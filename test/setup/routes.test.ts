import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { MODULE_REGISTRY } from '@/lib/contracts/modules';

// Academic sessions and subjects in Setup (docs/28 slice 10g, C244), through the app's routes as each person's own
// session, on the whole schema as the app's database role. The office makes a session current (one at a time, audited)
// and adds, renames, retires and brings back subjects; a teacher, an accountant, an academic coordinator and a parent
// are refused by the route AND by the database; a subject in use is retired, never deleted, and what refers to it is
// not touched; another school is never reached. Every name and email is made up.

const state = vi.hoisted(() => ({ claims: null as unknown, tenant: null as unknown }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/server-session', () => ({ getServerSession: async () => state.claims }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => (state.tenant as any)(claims, fn),
}));
vi.mock('@/lib/frameworks/page-access', () => ({ moduleOffReason: async () => null }));

import { GET as checklistRoute } from '@/app/api/app/setup/checklist/route';
import { GET as sessionsRoute, POST as addSessionRoute } from '@/app/api/app/setup/sessions/route';
import { POST as currentRoute } from '@/app/api/app/setup/sessions/[sessionId]/current/route';
import { GET as setupSubjectsRoute } from '@/app/api/app/setup/subjects/route';
import { PATCH as patchSubjectRoute } from '@/app/api/app/setup/subjects/[subjectId]/route';
import { GET as subjectsRoute, POST as addSubjectRoute } from '@/app/api/app/subjects/route';

const A = 'c2441000-0000-4000-8000-000000000001';
const B = 'c2441000-0000-4000-8000-000000000002';
const u = (n: number) => `c2441000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const [PRINCIPAL, ADMIN, TARA, ACCOUNTANT, COORDINATOR, PARENT, B_PRINCIPAL] = [u(11), u(12), u(13), u(14), u(15), u(16), u(17)];
const [S_OLD, B_SESSION] = [u(21), u(23)];
// The session the test adds (its id is made by the database).
let S_NEW = '';
const [CLASS_5A, B_CLASS] = [u(31), u(32)];
const [MATHS, ENGLISH, B_MATHS] = [u(41), u(42), u(43)];
const [EXAM, PAPER, STUDENT] = [u(51), u(52), u(53)];
type Who = { role: string; user: string; school?: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const tara: Who = { role: 'teacher', user: TARA };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
const coordinator: Who = { role: 'academic_coordinator', user: COORDINATOR };
const parent: Who = { role: 'parent', user: PARENT };
const bPrincipal: Who = { role: 'principal', user: B_PRINCIPAL, school: B };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school ?? A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// One statement as that person, through row-level security.
type Ran = { rows: Record<string, unknown>[]; affectedRows: number };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (who: Who, sql: string, params: unknown[] = []): Promise<Ran> => as(who, async (c: any) => (await c.query(sql, params)) as Ran);
const claims = (who: Who) => ({ sub: who.user, role: who.role, schoolId: who.school ?? A, membershipId: u(90), tokenVersion: 0, aal: 'aal1', sessionId: u(91) });
const call = async (who: Who, fn: () => Promise<Response>) => {
  state.claims = claims(who);
  const res = await fn();
  const text = await res.text();
  return { status: res.status, body: res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : null };
};
const req = (path: string, method = 'GET', body?: unknown) => new NextRequest(`http://localhost${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
const listSessions = (who: Who) => call(who, () => sessionsRoute(req('/api/app/setup/sessions')));
const addSession = (who: Who, body: unknown) => call(who, () => addSessionRoute(req('/api/app/setup/sessions', 'POST', body)));
const makeCurrent = (who: Who, id: string) => call(who, () => currentRoute(req(`/api/app/setup/sessions/${id}/current`, 'POST'), { params: { sessionId: id } }));
const addSubject = (who: Who, body: unknown) => call(who, () => addSubjectRoute(req('/api/app/subjects', 'POST', body)));
const patchSubject = (who: Who, id: string, body: unknown) => call(who, () => patchSubjectRoute(req(`/api/app/setup/subjects/${id}`, 'PATCH', body), { params: { subjectId: id } }));
const owner = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;
const audits = (like: string) => owner(`select event_action, actor_user_id, actor_role::text as role, target_id, before_state, after_state from audit_log where school_id = $1 and event_action like $2 order by audit_id`, [A, like]);
const currentSessions = async (school = A) => (await owner(`select session_id from academic_sessions where school_id = $1 and is_current`, [school])).map((r: { session_id: string }) => r.session_id);

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal', true), ('${ADMIN}', '${A}', 'admin@school-a.example', 'school_admin', 'Asif Admin', true),
      ('${TARA}', '${A}', 'tara@school-a.example', 'teacher', 'Tara Teacher', true), ('${ACCOUNTANT}', '${A}', 'accounts@school-a.example', 'accountant', 'Anil Accountant', true),
      ('${COORDINATOR}', '${A}', 'coordinator@school-a.example', 'academic_coordinator', 'Chitra Coordinator', true), ('${B_PRINCIPAL}', '${B}', 'principal@school-b.example', 'principal', 'Bela Principal', true);
    insert into school_module_entitlements (school_id, module_id, enabled, source)
      select s, m, true, 'plan' from unnest(array['${A}', '${B}']::uuid[]) s, unnest(array[${MODULE_REGISTRY.map((m) => `'${m.id}'`).join(', ')}]) m on conflict (school_id, module_id) do update set enabled = true;
    insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values
      ('${S_OLD}', '${A}', '2025-26', '2025-04-01', '2026-03-31', true), ('${B_SESSION}', '${B}', '2026-27', '2026-04-01', '2027-03-31', true);
    insert into classes (class_id, school_id, name) values ('${CLASS_5A}', '${A}', '5-A'), ('${B_CLASS}', '${B}', '5-A');
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Mathematics'), ('${ENGLISH}', '${A}', 'English'), ('${B_MATHS}', '${B}', 'Mathematics');
    insert into teachers (school_id, user_id, name) values ('${A}', '${TARA}', 'Tara Teacher');
    insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) select '${A}', teacher_id, '${MATHS}', '${CLASS_5A}' from teachers where school_id = '${A}';
    -- Mathematics is in use: a period in the timetable, a homework, and a mark.
    insert into timetable_entries (school_id, class_id, weekday, period, subject_id, teacher_user_id) values ('${A}', '${CLASS_5A}', 1, 1, '${MATHS}', '${TARA}');
    insert into homework (school_id, subject_id, title, due_date, created_by) values ('${A}', '${MATHS}', 'Fractions', '2026-10-30', '${TARA}');
    insert into students (student_id, school_id, admission_no, name, class_id, roll_no, status) values ('${STUDENT}', '${A}', 'A-1', 'Sana Madeup', '${CLASS_5A}', '1', 'active');
    insert into exams (exam_id, school_id, name, session_id) values ('${EXAM}', '${A}', 'Half-yearly', '${S_OLD}');
    insert into exam_papers (paper_id, school_id, exam_id, class_id, subject_id, components) values ('${PAPER}', '${A}', '${EXAM}', '${CLASS_5A}', '${MATHS}', '[{"key": "theory", "name": "Theory", "max": 80, "share": null}]'::jsonb);
    insert into marks (school_id, exam_id, subject_id, paper_id, component, student_id, kind, score, max_score) values ('${A}', '${EXAM}', '${MATHS}', '${PAPER}', 'theory', '${STUDENT}', 'score', 30, 80);
  `);
  state.tenant = (c: { role: string; sub: string; schoolId: string }, fn: (client: unknown) => Promise<unknown>) => as({ role: c.role, user: c.sub, school: c.schoolId }, fn);
}, 120_000);
afterAll(async () => db?.stop());

describe('academic sessions', () => {
  it('the office lists the school’s sessions; another school’s are not among them', async () => {
    for (const who of [principal, admin]) {
      const listed = await listSessions(who);
      expect(listed.status, who.role).toBe(200);
      expect(listed.body.sessions).toEqual([{ sessionId: S_OLD, label: '2025-26', startDate: '2025-04-01', endDate: '2026-03-31', isCurrent: true }]);
    }
  });

  it('a session is added not current, with one audit row of ids; nothing is half-written when it is refused', async () => {
    const bad: [unknown, string][] = [
      [{ label: '', startDate: '2026-04-01', endDate: '2027-03-31' }, 'session_label'],
      [{ label: 'x'.repeat(31), startDate: '2026-04-01', endDate: '2027-03-31' }, 'session_label'],
      [{ label: '2026-27', startDate: '2026-02-30', endDate: '2027-03-31' }, 'session_dates'],
      [{ label: '2026-27', startDate: '2026-04-01' }, 'session_dates'],
      [{ label: '2026-27', startDate: '2027-03-31', endDate: '2026-04-01' }, 'session_order'],
      [{ label: '2026-27', startDate: '2026-04-01', endDate: '2026-04-01' }, 'session_order'],
    ];
    for (const [body, code] of bad) expect(await addSession(principal, body), JSON.stringify(body)).toMatchObject({ status: 400, body: { code } });
    expect(await addSession(principal, 'not an object')).toMatchObject({ status: 400 });
    expect(await owner(`select count(*)::int as n from academic_sessions where school_id = $1`, [A])).toEqual([{ n: 1 }]);

    const added = await addSession(principal, { label: ' 2026-27 ', startDate: '2026-04-01', endDate: '2027-03-31' });
    expect(added.status).toBe(201);
    expect(added.body.session).toMatchObject({ label: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31', isCurrent: false });
    S_NEW = added.body.session.sessionId;
    // The label is taken, whatever the case or the spaces.
    expect(await addSession(admin, { label: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31' })).toMatchObject({ status: 409, body: { code: 'session_exists' } });
    expect(await addSession(admin, { label: ' 2026-27', startDate: '2026-04-02', endDate: '2027-03-31' })).toMatchObject({ status: 409, body: { code: 'session_exists' } });
    expect(await currentSessions()).toEqual([S_OLD]);
    expect(await audits('setup.session_added')).toEqual([
      { event_action: 'setup.session_added', actor_user_id: PRINCIPAL, role: 'principal', target_id: S_NEW, before_state: null, after_state: { session_id: S_NEW } },
    ]);
  });

  it('making a session current switches the school’s one current session in one step, and is audited with both ids', async () => {
    const done = await makeCurrent(principal, S_NEW);
    expect(done).toMatchObject({ status: 200, body: { sessionId: S_NEW, changed: true } });
    expect(await currentSessions()).toEqual([S_NEW]);
    expect(await audits('setup.session_made_current')).toEqual([
      { event_action: 'setup.session_made_current', actor_user_id: PRINCIPAL, role: 'principal', target_id: S_NEW, before_state: { session_id: S_OLD }, after_state: { session_id: S_NEW } },
    ]);
    // The old one is still there, and nothing else changed.
    expect(await owner(`select session_id, is_current from academic_sessions where school_id = $1 order by start_date`, [A])).toEqual([
      { session_id: S_OLD, is_current: false },
      { session_id: S_NEW, is_current: true },
    ]);
    // Again: nothing changes and nothing more is audited. Then back, by the school admin.
    expect(await makeCurrent(principal, S_NEW)).toMatchObject({ status: 200, body: { changed: false } });
    expect(await audits('setup.session_made_current')).toHaveLength(1);
    expect(await makeCurrent(admin, S_OLD)).toMatchObject({ status: 200, body: { changed: true } });
    expect(await currentSessions()).toEqual([S_OLD]);
    expect((await audits('setup.session_made_current')).map((a: { actor_user_id: string; role: string }) => [a.actor_user_id, a.role])).toEqual([[PRINCIPAL, 'principal'], [ADMIN, 'school_admin']]);
    expect(await makeCurrent(principal, S_NEW)).toMatchObject({ status: 200 });
    expect(await currentSessions()).toEqual([S_NEW]);
  });

  it('only one session is ever current: the database refuses a second, and a session that is not the school’s changes nothing', async () => {
    await expect(owner(`update academic_sessions set is_current = true where session_id = $1`, [S_OLD])).rejects.toThrow(/idx_academic_sessions_one_current|duplicate key/);
    expect(await currentSessions()).toEqual([S_NEW]);
    // Another school's session, an id that is not a session, and an id that is not an id: not found or refused, and the current one stays.
    expect(await makeCurrent(principal, B_SESSION)).toMatchObject({ status: 404, body: { code: 'session_not_found' } });
    expect(await makeCurrent(principal, u(99))).toMatchObject({ status: 404, body: { code: 'session_not_found' } });
    expect(await makeCurrent(principal, 'not-an-id')).toMatchObject({ status: 400 });
    expect(await currentSessions()).toEqual([S_NEW]);
    expect(await currentSessions(B)).toEqual([B_SESSION]);
  });

  it('two requests to make different sessions current, together, leave exactly one current', async () => {
    const [x, y] = await Promise.all([makeCurrent(principal, S_OLD), makeCurrent(admin, S_NEW)]);
    expect([x.status, y.status]).toEqual([200, 200]);
    expect(await currentSessions()).toHaveLength(1);
    await makeCurrent(principal, S_NEW);
    expect(await currentSessions()).toEqual([S_NEW]);
  });

  it('a teacher, an accountant, an academic coordinator and a parent are refused by the route, and nothing changes', async () => {
    const before = await owner(`select session_id, label, is_current from academic_sessions where school_id = $1 order by label`, [A]);
    const auditCount = (await owner(`select count(*)::int as n from audit_log where school_id = $1`, [A]))[0].n;
    for (const who of [tara, accountant, coordinator]) {
      expect(await listSessions(who), `${who.role} list`).toMatchObject({ status: 403, body: { code: 'not_allowed' } });
      expect(await addSession(who, { label: '2027-28', startDate: '2027-04-01', endDate: '2028-03-31' }), `${who.role} add`).toMatchObject({ status: 403, body: { code: 'not_allowed' } });
      expect(await makeCurrent(who, S_OLD), `${who.role} current`).toMatchObject({ status: 403, body: { code: 'not_allowed' } });
    }
    // A parent's session never reaches the school app at all.
    for (const run of [() => listSessions(parent), () => addSession(parent, { label: '2027-28', startDate: '2027-04-01', endDate: '2028-03-31' }), () => makeCurrent(parent, S_OLD)]) expect([401, 403]).toContain((await run()).status);
    expect(await owner(`select session_id, label, is_current from academic_sessions where school_id = $1 order by label`, [A])).toEqual(before);
    expect((await owner(`select count(*)::int as n from audit_log where school_id = $1`, [A]))[0].n).toBe(auditCount);
  });

  it('the database refuses them too: a statement as that role cannot add, change or delete a session; nobody deletes one', async () => {
    for (const who of [tara, accountant, coordinator, parent]) {
      await expect(run(who, `insert into academic_sessions (school_id, label, start_date, end_date) values ($1, '2027-28', '2027-04-01', '2028-03-31')`, [A]), `${who.role} insert`).rejects.toThrow(/row-level security/);
      const changed = await run(who, `update academic_sessions set label = 'Changed' where school_id = $1`, [A]);
      expect(changed.affectedRows, `${who.role} update`).toBe(0);
      const gone = await run(who, `delete from academic_sessions where school_id = $1`, [A]);
      expect(gone.affectedRows, `${who.role} delete`).toBe(0);
      // Reading stays: the school's own sessions are visible to a role that may read them.
    }
    expect((await run(tara, `select count(*)::int as n from academic_sessions`)).rows[0].n).toBe(2);
    // Even the office cannot delete one (classes, exams and fee structures refer to it).
    for (const who of [principal, admin]) {
      const gone = await run(who, `delete from academic_sessions where school_id = $1`, [A]);
      expect(gone.affectedRows, `${who.role} delete`).toBe(0);
    }
    expect(await owner(`select count(*)::int as n from academic_sessions where school_id = $1`, [A])).toEqual([{ n: 2 }]);
    // The office can add and change one in its own school, and not in another's.
    await expect(run(principal, `insert into academic_sessions (school_id, label, start_date, end_date) values ($1, '2027-28', '2027-04-01', '2028-03-31')`, [B])).rejects.toThrow(/row-level security/);
    expect(await owner(`select count(*)::int as n from academic_sessions where school_id = $1`, [B])).toEqual([{ n: 1 }]);
  });
});

describe('subjects', () => {
  let science = '';

  it('the office adds a subject (audited with its id only); the same name in any case is refused; another school’s names are its own', async () => {
    const added = await addSubject(principal, { name: '  Science  ' });
    expect(added.status).toBe(201);
    science = added.body.subject.subject_id;
    expect(added.body.subject.name).toBe('Science');
    expect(await addSubject(admin, { name: 'science' })).toMatchObject({ status: 409, body: { code: 'already_exists' } });
    expect(await addSubject(admin, { name: '' })).toMatchObject({ status: 400, body: { code: 'required' } });
    expect(await addSubject(admin, { name: 'x'.repeat(81) })).toMatchObject({ status: 400, body: { code: 'too_long' } });
    // School B may have its own Science.
    expect(await addSubject(bPrincipal, { name: 'Science' })).toMatchObject({ status: 201 });
    expect(await audits('setup.subject_added')).toEqual([
      { event_action: 'setup.subject_added', actor_user_id: PRINCIPAL, role: 'principal', target_id: science, before_state: null, after_state: { subject_id: science } },
    ]);
  });

  it('the office renames a subject (audited), not to a name another subject has, and not one that is not the school’s', async () => {
    expect(await patchSubject(principal, science, { name: 'General Science' })).toMatchObject({ status: 200, body: { changed: true } });
    expect((await owner(`select name from subjects where subject_id = $1`, [science]))[0].name).toBe('General Science');
    // Only the case and the spaces differ from its own name: allowed (it does not clash with itself). Then back.
    expect(await patchSubject(principal, science, { name: ' general   science ' })).toMatchObject({ status: 200, body: { changed: true } });
    expect((await owner(`select name from subjects where subject_id = $1`, [science]))[0].name).toBe('general science');
    expect(await patchSubject(principal, science, { name: 'General Science' })).toMatchObject({ status: 200, body: { changed: true } });
    expect(await patchSubject(principal, science, { name: 'General Science' })).toMatchObject({ status: 200, body: { changed: false } });
    expect(await patchSubject(principal, science, { name: 'English' })).toMatchObject({ status: 409, body: { code: 'already_exists' } });
    expect(await patchSubject(principal, science, { name: '' })).toMatchObject({ status: 400, body: { code: 'required' } });
    expect(await patchSubject(principal, B_MATHS, { name: 'Maths' })).toMatchObject({ status: 404, body: { code: 'not_found' } });
    expect((await owner(`select name from subjects where subject_id = $1`, [B_MATHS]))[0].name).toBe('Mathematics');
    expect(await patchSubject(principal, science, { name: 'General science', retired: true })).toMatchObject({ status: 400 });
    expect(await patchSubject(principal, science, {})).toMatchObject({ status: 400 });
    expect(await patchSubject(principal, science, { retired: 'yes' })).toMatchObject({ status: 400 });
    expect(await patchSubject(principal, 'nope', { retired: true })).toMatchObject({ status: 400 });
    // Three renames were made (the same name again is not one); each is audited with the subject's id only.
    expect((await audits('setup.subject_renamed')).map((a: { after_state: unknown }) => a.after_state)).toEqual([{ subject_id: science }, { subject_id: science }, { subject_id: science }]);
  });

  it('a subject in use is retired, not deleted: its row stays with retired_at set, and its periods, homework, marks and teachers are untouched', async () => {
    const uses = async () => (await owner(
      `select (select count(*)::int from timetable_entries where subject_id = $1) as periods, (select count(*)::int from homework where subject_id = $1) as homework,
              (select count(*)::int from marks where subject_id = $1) as marks, (select count(*)::int from exam_papers where subject_id = $1) as papers,
              (select count(*)::int from teacher_subjects where subject_id = $1) as teaching`, [MATHS]))[0];
    const before = await uses();
    expect(before).toEqual({ periods: 1, homework: 1, marks: 1, papers: 1, teaching: 1 });
    const retired = await patchSubject(principal, MATHS, { retired: true });
    expect(retired).toMatchObject({ status: 200, body: { subjectId: MATHS, retired: true, changed: true } });
    const [row] = await owner(`select name, retired_at is not null as retired from subjects where subject_id = $1`, [MATHS]);
    expect(row).toEqual({ name: 'Mathematics', retired: true });
    expect(await uses()).toEqual(before);
    // Retired twice: nothing changes and it is audited once.
    expect(await patchSubject(admin, MATHS, { retired: true })).toMatchObject({ status: 200, body: { changed: false } });
    // The setup list shows it among the retired, with what still refers to it.
    const listed = await call(principal, () => setupSubjectsRoute(req('/api/app/setup/subjects')));
    const maths = listed.body.subjects.find((s: { subjectId: string }) => s.subjectId === MATHS);
    expect(maths).toMatchObject({ name: 'Mathematics', retired: true, uses: { periods: 1, papers: 1, homework: 1, teaching: 1 } });
    expect(typeof maths.retiredAt).toBe('string');
    expect(listed.body.subjects.map((s: { retired: boolean }) => s.retired)).toEqual([false, false, true]); // in use first, then retired
    // The subjects list for pickers leaves it out; asking for the retired ones too brings it back.
    const picker = await call(tara, () => subjectsRoute(req('/api/app/subjects')));
    expect(picker.body.subjects.map((s: { name: string }) => s.name)).toEqual(['English', 'General Science']);
    const all = await call(tara, () => subjectsRoute(req('/api/app/subjects?include=retired')));
    expect(all.body.subjects.map((s: { name: string; retired_at: unknown }) => [s.name, s.retired_at !== null])).toEqual([['English', false], ['General Science', false], ['Mathematics', true]]);
    // A retired name stays taken, and adding it says it is retired.
    expect(await addSubject(principal, { name: 'mathematics' })).toMatchObject({ status: 409, body: { code: 'subject_retired', subjectId: MATHS } });
    // Brought back, it is in use again, still with everything.
    expect(await patchSubject(principal, MATHS, { retired: false })).toMatchObject({ status: 200, body: { retired: false, changed: true } });
    expect((await owner(`select retired_at from subjects where subject_id = $1`, [MATHS]))[0].retired_at).toBeNull();
    expect(await uses()).toEqual(before);
    expect((await audits('setup.subject_re%')).filter((a: { event_action: string }) => a.event_action !== 'setup.subject_renamed').map((a: { event_action: string; target_id: string; after_state: unknown }) => [a.event_action, a.target_id, a.after_state])).toEqual([
      ['setup.subject_retired', MATHS, { subject_id: MATHS }],
      ['setup.subject_restored', MATHS, { subject_id: MATHS }],
    ]);
  });

  it('a subject cannot be deleted from the app: the route has no DELETE, and one that is in use cannot be deleted at the database either', async () => {
    const routeFile = await import('@/app/api/app/setup/subjects/[subjectId]/route');
    expect(Object.keys(routeFile).sort()).toEqual(['PATCH']);
    await expect(run(principal, `delete from subjects where subject_id = $1`, [MATHS])).rejects.toThrow(/foreign key|violates/);
    expect((await owner(`select count(*)::int as n from subjects where subject_id = $1`, [MATHS]))[0].n).toBe(1);
  });

  it('a teacher, an accountant, an academic coordinator and a parent are refused by the route, and nothing changes', async () => {
    const before = await owner(`select subject_id, name, retired_at is not null as retired from subjects where school_id = $1 order by name`, [A]);
    const auditCount = (await owner(`select count(*)::int as n from audit_log where school_id = $1`, [A]))[0].n;
    for (const who of [tara, accountant, coordinator]) {
      expect(await addSubject(who, { name: 'Music' }), `${who.role} add`).toMatchObject({ status: 403 });
      expect(await patchSubject(who, MATHS, { retired: true }), `${who.role} retire`).toMatchObject({ status: 403, body: { code: 'not_allowed' } });
      expect(await patchSubject(who, MATHS, { name: 'Maths' }), `${who.role} rename`).toMatchObject({ status: 403, body: { code: 'not_allowed' } });
      expect(await call(who, () => setupSubjectsRoute(req('/api/app/setup/subjects'))), `${who.role} list`).toMatchObject({ status: 403 });
    }
    for (const run of [() => addSubject(parent, { name: 'Music' }), () => patchSubject(parent, MATHS, { retired: true })]) expect([401, 403]).toContain((await run()).status);
    expect(await owner(`select subject_id, name, retired_at is not null as retired from subjects where school_id = $1 order by name`, [A])).toEqual(before);
    expect((await owner(`select count(*)::int as n from audit_log where school_id = $1`, [A]))[0].n).toBe(auditCount);
  });

  it('the database refuses them too: a statement as that role cannot add, rename, retire or delete a subject', async () => {
    for (const who of [tara, accountant, coordinator, parent]) {
      await expect(run(who, `insert into subjects (school_id, name) values ($1, 'Music')`, [A]), `${who.role} insert`).rejects.toThrow(/row-level security/);
      expect((await run(who, `update subjects set retired_at = now() where school_id = $1`, [A])).affectedRows, `${who.role} retire`).toBe(0);
      expect((await run(who, `update subjects set name = 'Changed' where school_id = $1`, [A])).affectedRows, `${who.role} rename`).toBe(0);
      expect((await run(who, `delete from subjects where subject_id = $1`, [science])).affectedRows, `${who.role} delete`).toBe(0);
    }
    expect((await owner(`select count(*)::int as n from subjects where school_id = $1 and retired_at is null and name <> 'Changed'`, [A]))[0].n).toBe(3);
    // The office can, in its own school and no other.
    expect((await run(principal, `update subjects set retired_at = now() where subject_id = $1`, [B_MATHS])).affectedRows).toBe(0);
    await expect(run(admin, `insert into subjects (school_id, name) values ($1, 'Music')`, [B])).rejects.toThrow(/row-level security/);
  });
});

describe('the checklist route', () => {
  it('the office reads its own school’s checklist, counted now; every other role is refused; another school is never mixed in', async () => {
    const a = await call(principal, () => checklistRoute(req('/api/app/setup/checklist')));
    expect(a.status).toBe(200);
    const by = (body: { items: { id: string; done: boolean; count: number }[] }) => Object.fromEntries(body.items.map((i) => [i.id, i]));
    expect(by(a.body)).toMatchObject({ session: { done: true, count: 2 }, classes: { done: true, count: 1 }, subjects: { done: true, count: 3 }, teachers: { done: true, count: 1 }, students: { done: true, count: 1 }, timetable: { done: true, count: 1 }, fees: { done: false }, logo: { done: false } });
    expect(a.body.progress).toEqual({ done: 6, total: 9, complete: false });
    expect(await call(admin, () => checklistRoute(req('/api/app/setup/checklist')))).toMatchObject({ status: 200 });
    const b = await call(bPrincipal, () => checklistRoute(req('/api/app/setup/checklist')));
    expect(by(b.body)).toMatchObject({ session: { done: true, count: 1 }, classes: { done: true, count: 1 }, subjects: { done: false, count: 2, without: 1 }, timetable: { done: false } });
    for (const who of [tara, accountant, coordinator]) expect(await call(who, () => checklistRoute(req('/api/app/setup/checklist'))), who.role).toMatchObject({ status: 403 });
  });
});
