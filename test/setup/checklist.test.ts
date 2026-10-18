import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { providersFor, TODAY_PROVIDERS } from '@/lib/today/cards';
import type { SchoolEntitlements } from '@/lib/contracts/entitlements';
import { MODULE_REGISTRY, SCHOOL_ROLES } from '@/lib/contracts/modules';
import { checklistProgress, CHECKLIST_HREFS, CHECKLIST_IDS, onboardingChecklist, type ChecklistId } from '@/lib/setup/checklist';

// The onboarding checklist (docs/28 slice 10g, C244), on the whole schema as the app's own database role: it is
// counted from the rows that exist, never stored. Start from an empty school and add the rows one at a time: each step
// flips only when its own rows exist, a step opens again when its rows go, and another school's rows never count. Every
// name and email is made up.

const A = 'c2440000-0000-4000-8000-000000000001';
const B = 'c2440000-0000-4000-8000-000000000002';
const u = (n: number) => `c2440000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const [PRINCIPAL, ADMIN, TARA, LATA, ACCOUNTANT, B_PRINCIPAL, B_TEACHER] = [u(11), u(12), u(13), u(14), u(15), u(16), u(17)];
const [CLASS_5A, CLASS_5B, B_CLASS] = [u(21), u(22), u(23)];
const [MATHS, ENGLISH, B_MATHS] = [u(31), u(32), u(33)];
const [SESSION_1, B_SESSION] = [u(41), u(42)];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(role: string, user: string, school: string, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', school], ['app.current_role', role], ['app.current_user_id', user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// The checklist as School A's principal reads it, through row-level security.
const read = async (school = A) => {
  const items = await as('principal', PRINCIPAL, A, (c) => onboardingChecklist(c, school));
  return Object.fromEntries(items.map((i) => [i.id, i])) as Record<ChecklistId, (typeof items)[number]>;
};
const doneIds = (items: Record<string, { done: boolean }>) => CHECKLIST_IDS.filter((id) => items[id].done);
const owner = (sql: string, params: unknown[] = []) => db.pg.query(sql, params);

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal', true), ('${ADMIN}', '${A}', 'admin@school-a.example', 'school_admin', 'Asif Admin', true),
      ('${TARA}', '${A}', 'tara@school-a.example', 'teacher', 'Tara Teacher', true), ('${LATA}', '${A}', 'lata@school-a.example', 'teacher', 'Lata Left', false),
      ('${ACCOUNTANT}', '${A}', 'accounts@school-a.example', 'accountant', 'Anil Accountant', true),
      ('${B_PRINCIPAL}', '${B}', 'principal@school-b.example', 'principal', 'Bela Principal', true), ('${B_TEACHER}', '${B}', 'teacher@school-b.example', 'teacher', 'Bina Teacher', true);
    insert into memberships (user_id, school_id, role, is_active) values
      ('${PRINCIPAL}', '${A}', 'principal', true), ('${B_PRINCIPAL}', '${B}', 'principal', true), ('${B_TEACHER}', '${B}', 'teacher', true);
    -- School B is fully set up. None of it may count for School A.
    insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values ('${B_SESSION}', '${B}', '2026-27', '2026-04-01', '2027-03-31', true);
    insert into classes (class_id, school_id, name) values ('${B_CLASS}', '${B}', '5-A');
    insert into subjects (subject_id, school_id, name) values ('${B_MATHS}', '${B}', 'Mathematics');
    insert into teachers (school_id, user_id, name) values ('${B}', '${B_TEACHER}', 'Bina Teacher');
    insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) select '${B}', teacher_id, '${B_MATHS}', '${B_CLASS}' from teachers where school_id = '${B}';
    insert into students (school_id, admission_no, name, class_id, roll_no, status) values ('${B}', 'B-1', 'Rohan Madeup', '${B_CLASS}', '1', 'active');
    insert into fee_structures (school_id, class_id, academic_year, effective_from) values ('${B}', '${B_CLASS}', '2026-27', '2026-04-01');
    insert into timetable_entries (school_id, class_id, weekday, period, subject_id, teacher_user_id) values ('${B}', '${B_CLASS}', 1, 1, '${B_MATHS}', '${B_TEACHER}');
    update schools set logo_path = '${B}/branding/logo-${u(99)}.png' where school_id = '${B}';
  `);
}, 120_000);
afterAll(async () => db?.stop());

describe('the onboarding checklist, from an empty school', () => {
  it('names nine steps, each with the screen where it is done; a school with nothing has none done, whatever another school has', async () => {
    expect(CHECKLIST_IDS).toEqual(['session', 'classes', 'subjects', 'staff', 'teachers', 'students', 'fees', 'timetable', 'logo']);
    const items = await read();
    expect(Object.keys(items)).toEqual([...CHECKLIST_IDS]);
    for (const id of CHECKLIST_IDS) expect(items[id], id).toEqual({ id, done: false, count: 0, without: 0, href: CHECKLIST_HREFS[id] });
    expect(CHECKLIST_HREFS).toEqual({
      session: '/app/setup/sessions',
      classes: '/app/students?classes=1',
      subjects: '/app/setup/subjects',
      staff: '/app/staff',
      teachers: '/app/staff',
      students: '/app/students',
      fees: '/app/fees',
      timetable: '/app/timetable',
      logo: '/app/settings',
    });
    expect(checklistProgress(Object.values(items))).toEqual({ done: 0, total: 9, complete: false });
    // School B, read as its own principal, has every step.
    const b = Object.fromEntries((await as('principal', B_PRINCIPAL, B, (c) => onboardingChecklist(c, B))).map((i) => [i.id, i]));
    expect(doneIds(b)).toEqual([...CHECKLIST_IDS]);
  });

  it('a school the caller cannot see has no checklist at all: an empty list, never nine steps with nothing done', async () => {
    expect(await as('principal', PRINCIPAL, A, (c) => onboardingChecklist(c, B))).toEqual([]);
    expect(checklistProgress([])).toEqual({ done: 0, total: 0, complete: false });
  });

  it('a session flips its step when it is made current, not when it is only added', async () => {
    await owner(`insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values ($1, $2, '2026-27', '2026-04-01', '2027-03-31', false)`, [SESSION_1, A]);
    expect(await read()).toMatchObject({ session: { done: false, count: 1 } });
    await owner(`update academic_sessions set is_current = true where session_id = $1`, [SESSION_1]);
    expect(await read()).toMatchObject({ session: { done: true, count: 1 } });
  });

  it('classes flip with the first class; subjects are not done with a class and no subject', async () => {
    await owner(`insert into classes (class_id, school_id, name) values ($1, $2, '5-A')`, [CLASS_5A, A]);
    expect(await read()).toMatchObject({ classes: { done: true, count: 1 }, subjects: { done: false, count: 0, without: 1 } });
  });

  it('subjects need a subject in use AND a subject taught in every class', async () => {
    await owner(`insert into subjects (subject_id, school_id, name) values ($1, $2, 'Mathematics'), ($3, $2, 'English')`, [MATHS, A, ENGLISH]);
    expect(await read()).toMatchObject({ subjects: { done: false, count: 2, without: 1 }, teachers: { done: false, count: 0 } });
  });

  it('staff with logins counts active staff accounts besides the principal: not the principal, not someone who left, not another school’s', async () => {
    // The principal's own membership, a teacher who left (inactive account and membership) and School B's teacher: none counts.
    await owner(`insert into memberships (user_id, school_id, role, is_active) values ($1, $2, 'teacher', false), ($3, $2, 'accountant', false)`, [LATA, A, ACCOUNTANT]);
    expect(await read()).toMatchObject({ staff: { done: false, count: 0 } });
    // An accountant whose membership is active but whose account was deactivated does not count either.
    await owner(`update memberships set is_active = true where user_id = $1`, [ACCOUNTANT]);
    await owner(`update users set is_active = false where user_id = $1`, [ACCOUNTANT]);
    expect(await read()).toMatchObject({ staff: { done: false, count: 0 } });
    await owner(`update users set is_active = true where user_id = $1`, [ACCOUNTANT]);
    expect(await read()).toMatchObject({ staff: { done: true, count: 1 } });
    // A teacher with a login makes two.
    await owner(`insert into memberships (user_id, school_id, role, is_active) values ($1, $2, 'teacher', true)`, [TARA, A]);
    expect(await read()).toMatchObject({ staff: { done: true, count: 2 } });
  });

  it('teachers assigned flips with the first teacher_subjects row, and then every class has a subject taught', async () => {
    await owner(`insert into teachers (school_id, user_id, name) values ($1, $2, 'Tara Teacher')`, [A, TARA]);
    await owner(`insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) select $1, teacher_id, $2, $3 from teachers where school_id = $1 and user_id = $4`, [A, MATHS, CLASS_5A, TARA]);
    expect(await read()).toMatchObject({ teachers: { done: true, count: 1 }, subjects: { done: true, count: 2, without: 0 } });
    // A second class with nothing taught in it opens the subjects step again.
    await owner(`insert into classes (class_id, school_id, name) values ($1, $2, '5-B')`, [CLASS_5B, A]);
    expect(await read()).toMatchObject({ classes: { count: 2 }, subjects: { done: false, without: 1 } });
    await owner(`insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) select $1, teacher_id, $2, $3 from teachers where school_id = $1 and user_id = $4`, [A, ENGLISH, CLASS_5B, TARA]);
    expect(await read()).toMatchObject({ subjects: { done: true, without: 0 }, teachers: { count: 2 } });
  });

  it('a retired subject is not in use: retiring the only subjects opens the step, bringing one back closes it', async () => {
    await owner(`update subjects set retired_at = now() where school_id = $1`, [A]);
    expect(await read()).toMatchObject({ subjects: { done: false, count: 0 }, teachers: { done: true, count: 2 } });
    // Mathematics is back; English (the only subject taught in 5-B) is still retired, so 5-B has nothing in use taught.
    await owner(`update subjects set retired_at = null where subject_id = $1`, [MATHS]);
    expect(await read()).toMatchObject({ subjects: { done: false, count: 1, without: 1 }, teachers: { count: 2 } });
    await owner(`update subjects set retired_at = null where school_id = $1`, [A]);
    expect(await read()).toMatchObject({ subjects: { done: true, count: 2 } });
  });

  it('students count only the active ones', async () => {
    await owner(`insert into students (school_id, admission_no, name, class_id, roll_no, status) values ($1, 'A-1', 'Neel Madeup', $2, '1', 'pending_consent'), ($1, 'A-2', 'Ira Madeup', $2, '2', 'transferred')`, [A, CLASS_5A]);
    expect(await read()).toMatchObject({ students: { done: false, count: 0 } });
    await owner(`insert into students (school_id, admission_no, name, class_id, roll_no, status) values ($1, 'A-3', 'Sana Madeup', $2, '3', 'active')`, [A, CLASS_5A]);
    expect(await read()).toMatchObject({ students: { done: true, count: 1 } });
  });

  it('a fee structure, a published period and a logo each flip their own step', async () => {
    expect(await read()).toMatchObject({ fees: { done: false }, timetable: { done: false }, logo: { done: false } });
    await owner(`insert into fee_structures (school_id, class_id, academic_year, effective_from) values ($1, $2, '2026-27', '2026-04-01')`, [A, CLASS_5A]);
    expect(await read()).toMatchObject({ fees: { done: true, count: 1 }, timetable: { done: false }, logo: { done: false } });
    await owner(`insert into timetable_entries (school_id, class_id, weekday, period, subject_id, teacher_user_id) values ($1, $2, 1, 1, $3, $4)`, [A, CLASS_5A, MATHS, TARA]);
    expect(await read()).toMatchObject({ timetable: { done: true, count: 1 }, logo: { done: false } });
    await owner(`update schools set logo_path = $2 where school_id = $1`, [A, `${A}/branding/logo-${u(98)}.png`]);
    expect(await read()).toMatchObject({ logo: { done: true, count: 1 } });
  });

  it('every step is done; the principal and the school admin read the same list; a step opens again when its rows go', async () => {
    const all = await read();
    expect(doneIds(all)).toEqual([...CHECKLIST_IDS]);
    expect(checklistProgress(Object.values(all))).toEqual({ done: 9, total: 9, complete: true });
    const admin = await as('school_admin', ADMIN, A, (c) => onboardingChecklist(c, A));
    expect(admin).toEqual(Object.values(all));
    // The platform role (Control) reads any school it is given, and counts that school's rows only.
    const control = await db.pg.transaction(async (tx: { query: (s: string, p?: unknown[]) => Promise<unknown> }) => {
      await tx.query('set local role nca_super');
      return onboardingChecklist(tx as never, A);
    });
    expect(control).toEqual(Object.values(all));
    await owner(`delete from timetable_entries where school_id = $1`, [A]);
    await owner(`update schools set logo_path = null where school_id = $1`, [A]);
    await owner(`update academic_sessions set is_current = false where school_id = $1`, [A]);
    const after = await read();
    expect(doneIds(after)).toEqual(['classes', 'subjects', 'staff', 'teachers', 'students', 'fees']);
    expect(checklistProgress(Object.values(after))).toEqual({ done: 6, total: 9, complete: false });
    // School B is the same as before.
    const b = await as('principal', B_PRINCIPAL, B, (c) => onboardingChecklist(c, B));
    expect(b.filter((i) => i.done)).toHaveLength(9);
  });
});

describe('the setup card on My Day', () => {
  const provider = TODAY_PROVIDERS.find((p) => p.type === 'setup-checklist')!;
  const ents = (setupOn = true): SchoolEntitlements => ({
    schoolId: A,
    plan: 'unassigned',
    accessMode: 'full',
    modules: Object.fromEntries(MODULE_REGISTRY.map((m) => [m.id, { enabled: m.id === 'setup' ? setupOn : true, source: 'plan' as const }])),
  });
  const card = (school: string, user: string, role: string) =>
    as(role, user, school, (c) => provider.load(c, { schoolId: school, userId: user, role: role as never, sunday: false }));

  it('belongs to the principal and the school admin while the school’s Setup is on, and no other role', () => {
    expect(provider).toMatchObject({ moduleId: 'setup', roles: ['principal', 'school_admin'] });
    for (const role of SCHOOL_ROLES) expect(providersFor(role, ents()).some((p) => p.type === 'setup-checklist'), role).toBe(role === 'principal' || role === 'school_admin');
    expect(providersFor('principal', ents(false)).some((p) => p.type === 'setup-checklist')).toBe(false);
  });

  it('is one card with the steps done out of all of them while any is open, linking to Setup; none when every step is done', async () => {
    // The state the checklist test left School A in: session, logo and timetable were taken away again.
    expect(await card(A, PRINCIPAL, 'principal')).toEqual([{ id: 'setup-checklist', type: 'setup-checklist', moduleId: 'setup', state: 'todo', count: 6, total: 9, href: '/app/setup' }]);
    expect(await card(A, ADMIN, 'school_admin')).toHaveLength(1);
    await owner(`update academic_sessions set is_current = true where session_id = $1`, [SESSION_1]);
    await owner(`insert into timetable_entries (school_id, class_id, weekday, period, subject_id, teacher_user_id) values ($1, $2, 1, 1, $3, $4)`, [A, CLASS_5A, MATHS, TARA]);
    await owner(`update schools set logo_path = $2 where school_id = $1`, [A, `${A}/branding/logo-${u(98)}.png`]);
    expect(await card(A, PRINCIPAL, 'principal')).toEqual([]);
    await owner(`delete from fee_structures where school_id = $1`, [A]);
    expect(await card(A, PRINCIPAL, 'principal')).toEqual([{ id: 'setup-checklist', type: 'setup-checklist', moduleId: 'setup', state: 'todo', count: 8, total: 9, href: '/app/setup' }]);
  });
});
