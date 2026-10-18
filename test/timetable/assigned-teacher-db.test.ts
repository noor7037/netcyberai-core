import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// The app's own checks of who teaches what read the assignments once, before they write. These two are wrapped so a
// test can make that read return what it returned a moment before Setup changed (the race the database closes).
vi.mock('@/lib/academics/teacher-subjects', async (original) => {
  const real = await original<typeof import('@/lib/academics/teacher-subjects')>();
  return { ...real, activeAssignments: vi.fn(real.activeAssignments), assignedTeachers: vi.fn(real.assignedTeachers) };
});

import { activeAssignments, assign, assignedTeachers, decideRequest, listAssignments, proposeAssignment, unassign, waitingRequests } from '@/lib/academics/teacher-subjects';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { draftView, propose, publishDraft, setLoad } from '@/lib/timetable/generator-store';
import { clearEntry, entriesForClass, importTimetable, putEntry } from '@/lib/timetable/timetable';

// C243 (C230-C) on the whole schema, every migration replayed, as the app's own database role with each person's
// role. The acceptance sentences:
//   1  the academic coordinator assigns, and confirms or declines a teacher's proposal, beside the principal and the
//      school admin, a teacher's first subject too (the coordinator makes the teachers row behind it, and never
//      changes or removes one); a teacher can do neither; another school sees nothing.
//   2  the database refuses a period whose class and subject have assigned teachers and whose teacher is not one of
//      them, on insert and on update, whoever writes it; the app's paths answer with their own 'not_assigned' when the
//      database refuses first. A class and subject with no assignment takes anyone.
//   3  a period made before the rule that contradicts the assignments stays: it is read, the other periods are
//      written, it may be left alone or cleared; any change to it must keep to the rule.
// Every name is made up.

const A = 'c2430000-0000-4000-8000-0000000001a1';
const B = 'c2430000-0000-4000-8000-0000000001b1';
const u = (n: number) => `c2430000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
const [PRINCIPAL, ADMIN, COORD, ACCOUNTANT, COORD_B] = [u(11), u(12), u(13), u(14), u(15)];
const [T1, T2, T3, T4, T_GONE, T_B] = [u(21), u(22), u(23), u(24), u(25), u(26)];
const [C5A, C5B, C6A, CB] = [u(51), u(52), u(53), u(54)];
const [MATHS, ENGLISH, SB] = [u(61), u(62), u(63)];
const [T1_ROW, T_GONE_ROW] = [u(71), u(72)];
const TIMETABLE_SCHEMA = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'timetable')!.version;

// The school as it was before the migration C243: T1 teaches Maths in 5-A, and a period of 5-A Maths was already
// given to T2 (it contradicts the assignment). A teacher who left (T_GONE) is still assigned 6-A English.
const BEFORE_C243 = `
  insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
  insert into school_entitlements (school_id, plan) values ('${A}', 'standard');
  insert into school_module_entitlements (school_id, module_id, enabled, source) values ('${A}', 'timetable', true, 'plan') on conflict do nothing;
  insert into users (user_id, school_id, email, role, display_name, is_active) values
    ('${PRINCIPAL}', '${A}', 'p@school-a.example', 'principal', 'Pallavi Principal', true), ('${ADMIN}', '${A}', 'ad@school-a.example', 'school_admin', 'Amit Admin', true),
    ('${COORD}', '${A}', 'co@school-a.example', 'academic_coordinator', 'Charu Coordinator', true), ('${ACCOUNTANT}', '${A}', 'acc@school-a.example', 'accountant', 'Arun Accountant', true),
    ('${T1}', '${A}', 't1@school-a.example', 'teacher', 'Tejal Teacher', true), ('${T2}', '${A}', 't2@school-a.example', 'teacher', 'Tushar Teacher', true),
    ('${T3}', '${A}', 't3@school-a.example', 'teacher', 'Trisha Teacher', true), ('${T4}', '${A}', 't4@school-a.example', 'teacher', 'Tilak Teacher', true),
    ('${T_GONE}', '${A}', 'gone@school-a.example', 'teacher', 'Girish Gone', false),
    ('${COORD_B}', '${B}', 'co@school-b.example', 'academic_coordinator', 'Bina Coordinator', true), ('${T_B}', '${B}', 't@school-b.example', 'teacher', 'Bhanu Teacher', true);
  insert into classes (class_id, school_id, name, grade, section) values ('${C5A}', '${A}', '5-A', '5', 'A'), ('${C5B}', '${A}', '5-B', '5', 'B'), ('${C6A}', '${A}', '6-A', '6', 'A'), ('${CB}', '${B}', '9-Z', '9', 'Z');
  insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Maths'), ('${ENGLISH}', '${A}', 'English'), ('${SB}', '${B}', 'History');
  insert into teachers (teacher_id, school_id, user_id, name) values ('${T1_ROW}', '${A}', '${T1}', 'Tejal Teacher'), ('${T_GONE_ROW}', '${A}', '${T_GONE}', 'Girish Gone');
  insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) values ('${A}', '${T1_ROW}', '${MATHS}', '${C5A}'), ('${A}', '${T_GONE_ROW}', '${ENGLISH}', '${C6A}');
  insert into timetable_entries (school_id, class_id, weekday, period, subject_id, teacher_user_id) values ('${A}', '${C5A}', 1, 1, '${MATHS}', '${T2}');
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school?: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const coord: Who = { role: 'academic_coordinator', user: COORD };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
const t2: Who = { role: 'teacher', user: T2 };
const t3: Who = { role: 'teacher', user: T3 };
const coordB: Who = { role: 'academic_coordinator', user: COORD_B, school: B };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school ?? A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
const actor = (who: Who) => ({ schoolId: who.school ?? A, userId: who.user, role: who.role as never });
const rows = async (who: Who, sql: string, params: unknown[] = []) => (await as<{ rows: unknown[] }>(who, (c) => c.query(sql, params))).rows;
const period = async (classId: string, weekday: number, p: number) =>
  ((await db.pg.query(`select subject_id as "subjectId", teacher_user_id as "teacherUserId" from timetable_entries where school_id = $1 and class_id = $2 and weekday = $3 and period = $4`, [A, classId, weekday, p])).rows[0] as
    | { subjectId: string; teacherUserId: string }
    | undefined) ?? null;
const insertAs = (who: Who, classId: string, weekday: number, p: number, subjectId: string, teacherUserId: string) =>
  as(who, (c) => c.query(`insert into timetable_entries (school_id, class_id, weekday, period, subject_id, teacher_user_id) values ($1, $2, $3, $4, $5, $6)`, [A, classId, weekday, p, subjectId, teacherUserId]));
const RULE = /one of the teachers assigned to its class and subject/;
// What the app's own check read, `back` calls ago: [] proves the refusal came from the database.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const checkSaw = (fn: any, back = 1) => vi.mocked(fn).mock.results.at(-back)!.value;

beforeAll(async () => {
  db = await startHarnessDb({ port: 0, before: { migration: '_c243_assigned_teacher_rule.sql', sql: BEFORE_C243 } });
}, 120_000);
afterAll(async () => db?.stop());

describe('1: the academic coordinator assigns and decides (C230-C)', () => {
  it('the coordinator gives a subject and takes it away, audited in their own name; a teacher and the accountant cannot, by the app or the database', async () => {
    expect(await as(coord, (c) => assign(c, actor(coord), { teacherUserId: T1, classId: C5B, subjectId: MATHS }))).toEqual({ ok: true, created: true });
    expect(await as(coord, (c) => listAssignments(c, A, T1))).toEqual(expect.arrayContaining([{ teacherUserId: T1, classId: C5B, subjectId: MATHS }]));
    expect(await as(coord, (c) => unassign(c, actor(coord), { teacherUserId: T1, classId: C5B, subjectId: MATHS }))).toBe(true);
    const audit = (await db.pg.query(`select event_action, actor_user_id, actor_role from audit_log where school_id = $1 and event_action like 'teacher_subject.%' order by audit_id`, [A])).rows;
    expect(audit).toEqual([
      { event_action: 'teacher_subject.assign', actor_user_id: COORD, actor_role: 'academic_coordinator' },
      { event_action: 'teacher_subject.unassign', actor_user_id: COORD, actor_role: 'academic_coordinator' },
    ]);
    for (const who of [t2, accountant]) {
      await expect(as(who, (c) => c.query(`insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) values ($1, $2, $3, $4)`, [A, T1_ROW, MATHS, C5B]))).rejects.toThrow(/row-level security/);
      expect(await rows(who, `delete from teacher_subjects returning 1`), who.role).toEqual([]);
      expect(await rows(who, `update teacher_subjects set class_id = $1 returning 1`, [C5B]), who.role).toEqual([]);
    }
    await expect(as(t2, (c) => assign(c, actor(t2), { teacherUserId: T1, classId: C5B, subjectId: MATHS }))).rejects.toThrow(/row-level security/);
  });

  it('the coordinator gives a teacher with no teachers row their first subject: the row is made once, for a teacher only; changing or removing one stays the office’s', async () => {
    // T2 has no teachers row yet.
    expect((await db.pg.query(`select count(*)::int as n from teachers where user_id = $1`, [T2])).rows[0].n).toBe(0);
    expect(await as(coord, (c) => assign(c, actor(coord), { teacherUserId: T2, classId: C5B, subjectId: ENGLISH }))).toEqual({ ok: true, created: true });
    expect(await as(coord, (c) => assign(c, actor(coord), { teacherUserId: T2, classId: C6A, subjectId: MATHS }))).toEqual({ ok: true, created: true });
    const made = (await db.pg.query(`select t.name, (select count(*)::int from teachers x where x.user_id = $1) as n from teachers t where t.user_id = $1`, [T2])).rows;
    expect(made).toEqual([{ name: 'Tushar Teacher', n: 1 }]);
    const profile = (await db.pg.query(`select actor_user_id, actor_role, after_state from audit_log where school_id = $1 and event_action = 'teacher.profile_made' order by audit_id`, [A])).rows;
    expect(profile).toEqual([{ actor_user_id: COORD, actor_role: 'academic_coordinator', after_state: { teacherUserId: T2 } }]);
    // Never for anyone who is not a teacher, by the app or the database; never a change or a removal.
    expect(await as(coord, (c) => assign(c, actor(coord), { teacherUserId: ACCOUNTANT, classId: C5B, subjectId: ENGLISH }))).toEqual({ ok: false, reason: 'unknown_teacher' });
    await expect(as(coord, (c) => c.query(`insert into teachers (school_id, user_id, name) values ($1, $2, 'Arun Accountant')`, [A, ACCOUNTANT]))).rejects.toThrow(/row-level security/);
    expect(await rows(coord, `update teachers set name = 'Someone else' returning 1`)).toEqual([]);
    expect(await rows(coord, `delete from teachers where user_id = $1 returning 1`, [T_GONE])).toEqual([]);
    for (const who of [t2, accountant]) await expect(as(who, (c) => c.query(`insert into teachers (school_id, user_id, name) values ($1, $2, 'Tilak Teacher')`, [A, T4]))).rejects.toThrow(/row-level security/);
    expect(await as(coord, (c) => unassign(c, actor(coord), { teacherUserId: T2, classId: C6A, subjectId: MATHS }))).toBe(true);
    expect(await as(coord, (c) => unassign(c, actor(coord), { teacherUserId: T2, classId: C5B, subjectId: ENGLISH }))).toBe(true);
  });

  it('the coordinator reads the proposals, confirms one and declines one, never their own; a teacher decides none', async () => {
    const first = await as(t3, (c) => proposeAssignment(c, actor(t3), { classId: C5B, subjectId: ENGLISH }));
    const second = await as(t3, (c) => proposeAssignment(c, actor(t3), { classId: C5B, subjectId: MATHS }));
    if (!first.ok || !second.ok) throw new Error('the proposals were not made');
    expect((await as(coord, (c) => waitingRequests(c, A))).map((r) => r.requestId).sort()).toEqual([first.requestId, second.requestId].sort());
    // A teacher decides nothing: not their own, not another's.
    for (const who of [t3, t2]) {
      expect(await rows(who, `update teacher_subject_requests set state = 'declined', decided_by = $1 returning 1`, [who.user]), who.user).toEqual([]);
      expect(await as(who, (c) => decideRequest(c, actor(who), first.requestId, 'confirm')), who.user).toEqual({ ok: false, reason: 'not_found' });
    }
    // T3 has no teachers row: confirming their proposal makes it, as the office's confirming does.
    expect((await db.pg.query(`select count(*)::int as n from teachers where user_id = $1`, [T3])).rows[0].n).toBe(0);
    expect(await as(coord, (c) => decideRequest(c, actor(coord), first.requestId, 'confirm'))).toEqual({ ok: true, state: 'confirmed' });
    expect((await db.pg.query(`select count(*)::int as n from teachers where user_id = $1`, [T3])).rows[0].n).toBe(1);
    expect(await as(coord, (c) => decideRequest(c, actor(coord), second.requestId, 'decline'))).toEqual({ ok: true, state: 'declined' });
    expect((await db.pg.query(`select state, decided_by from teacher_subject_requests where request_id = any ($1::uuid[]) order by state`, [[first.requestId, second.requestId]])).rows).toEqual([
      { state: 'confirmed', decided_by: COORD },
      { state: 'declined', decided_by: COORD },
    ]);
    expect(await as(coord, (c) => listAssignments(c, A, T3))).toEqual(expect.arrayContaining([{ teacherUserId: T3, classId: C5B, subjectId: ENGLISH }]));
    // In their own name only, never in another's.
    const third = await as(t3, (c) => proposeAssignment(c, actor(t3), { classId: C5A, subjectId: ENGLISH }));
    if (!third.ok) throw new Error('the proposal was not made');
    await expect(as(coord, (c) => c.query(`update teacher_subject_requests set state = 'declined', decided_by = $1 where request_id = $2`, [PRINCIPAL, third.requestId]))).rejects.toThrow(/row-level security/);
    expect(await rows(coord, `update teacher_subject_requests set state = 'declined', decided_by = $1 where request_id = $2 returning 1`, [COORD, third.requestId])).toHaveLength(1);
    // The proposals' audit rows follow the proposals: the coordinator reads them.
    expect((await rows(coord, `select 1 from audit_log where event_action like 'teacher_subject.request%'`)).length).toBeGreaterThan(0);
    expect(await rows(accountant, `select 1 from audit_log where event_action like 'teacher_subject.request%'`)).toEqual([]);
    // Put back: 5-B English has no assignment again.
    expect(await as(coord, (c) => unassign(c, actor(coord), { teacherUserId: T3, classId: C5B, subjectId: ENGLISH }))).toBe(true);
  });

  it('another school sees nothing and writes nothing of this one', async () => {
    expect(await rows(coordB, `select 1 from teacher_subjects`)).toEqual([]);
    expect(await rows(coordB, `select 1 from teacher_subject_requests`)).toEqual([]);
    expect(await rows(coordB, `select 1 from timetable_entries`)).toEqual([]);
    expect(await rows(coordB, `delete from teacher_subjects returning 1`)).toEqual([]);
    expect(await rows(coordB, `update teacher_subject_requests set state = 'declined', decided_by = $1 returning 1`, [COORD_B])).toEqual([]);
    await expect(as(coordB, (c) => c.query(`insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) values ($1, $2, $3, $4)`, [A, T1_ROW, ENGLISH, C5B]))).rejects.toThrow(/row-level security/);
    expect(await as(coordB, (c) => assign(c, actor(coordB), { teacherUserId: T1, classId: C5B, subjectId: ENGLISH }))).toEqual({ ok: false, reason: 'unknown_class' });
    expect(await as(coordB, (c) => waitingRequests(c, B))).toEqual([]);
  });
});

describe('2: the database keeps the assigned-teacher rule', () => {
  it('a direct insert or update by a role that writes the timetable is refused for a teacher not assigned; an assigned teacher is taken', async () => {
    for (const who of [principal, coord]) {
      await expect(insertAs(who, C5A, 2, 1, MATHS, T2)).rejects.toThrow(RULE);
      await expect(insertAs(who, C5A, 2, 1, MATHS, T2)).rejects.toMatchObject({ code: '23514' });
    }
    await insertAs(principal, C5A, 2, 1, MATHS, T1);
    // Changing its teacher, its subject or its class to one that breaks the rule is refused.
    await expect(as(coord, (c) => c.query(`update timetable_entries set teacher_user_id = $1 where school_id = $2 and class_id = $3 and weekday = 2 and period = 1`, [T4, A, C5A]))).rejects.toThrow(RULE);
    await insertAs(principal, C5B, 2, 3, MATHS, T4);
    await expect(as(principal, (c) => c.query(`update timetable_entries set class_id = $1 where school_id = $2 and class_id = $3 and weekday = 2 and period = 3`, [C5A, A, C5B]))).rejects.toThrow(RULE);
    await insertAs(principal, C5A, 2, 2, ENGLISH, T2);
    await expect(as(principal, (c) => c.query(`update timetable_entries set subject_id = $1 where school_id = $2 and class_id = $3 and weekday = 2 and period = 2`, [MATHS, A, C5A]))).rejects.toThrow(RULE);
    expect(await period(C5A, 2, 1)).toEqual({ subjectId: MATHS, teacherUserId: T1 });
    expect(await period(C5B, 2, 3)).toEqual({ subjectId: MATHS, teacherUserId: T4 });
    expect(await period(C5A, 2, 2)).toEqual({ subjectId: ENGLISH, teacherUserId: T2 });
  });

  it('a class and subject with no assignment takes anyone; a teacher who left no longer holds a subject back, as the app reads it', async () => {
    // 5-B English: no assignment.
    await insertAs(coord, C5B, 3, 1, ENGLISH, T4);
    expect(await as(principal, (c) => putEntry(c, actor(principal), { classId: C5B, weekday: 3, period: 2, subjectId: ENGLISH, teacherUserId: T2 }))).toMatchObject({ ok: true });
    // 6-A English: only T_GONE, who left.
    await insertAs(principal, C6A, 3, 3, ENGLISH, T4);
    expect(await period(C6A, 3, 3)).toEqual({ subjectId: ENGLISH, teacherUserId: T4 });
  });

  it('putEntry, the CSV import and publishing a draft answer "not_assigned" when the database refuses first (Setup changed after their check), and write nothing', async () => {
    // putEntry: its check read 5-A Maths a moment before Setup gave it to T1 only.
    vi.mocked(assignedTeachers).mockResolvedValueOnce([]);
    expect(await as(principal, (c) => putEntry(c, actor(principal), { classId: C5A, weekday: 4, period: 1, subjectId: MATHS, teacherUserId: T4 }))).toEqual({ ok: false, reason: 'not_assigned' });
    expect(await checkSaw(assignedTeachers)).toEqual([]);
    expect(await period(C5A, 4, 1)).toBeNull();
    // The transaction goes on after the refusal: a period that keeps to the rule is saved in the same one.
    expect(
      await as(principal, async (c) => {
        vi.mocked(assignedTeachers).mockResolvedValueOnce([]);
        const refused = await putEntry(c, actor(principal), { classId: C5A, weekday: 4, period: 1, subjectId: MATHS, teacherUserId: T4 });
        const saved = await putEntry(c, actor(principal), { classId: C5A, weekday: 4, period: 1, subjectId: MATHS, teacherUserId: T1 });
        return [refused.ok, saved.ok];
      })
    ).toEqual([false, true]);

    // The CSV import: nothing imported, the refused line named with the teacher, as its own check names it.
    vi.mocked(activeAssignments).mockResolvedValueOnce([]);
    const csv = `class,day,period,subject,teacher\n5-B,THU,1,English,t4@school-a.example\n5-A,THU,2,Maths,t4@school-a.example\n`;
    expect(await as(coord, (c) => importTimetable(c, actor(coord), csv))).toEqual({ ok: false, problems: [{ line: 3, code: 'not_assigned', value: 't4@school-a.example' }] });
    expect(await checkSaw(activeAssignments, 2)).toEqual([]);
    expect(await period(C5B, 4, 1)).toBeNull();
    expect(await period(C5A, 4, 2)).toBeNull();
    // Without the race, the import's own check names the same line.
    expect(await as(coord, (c) => importTimetable(c, actor(coord), csv))).toEqual({ ok: false, problems: [{ line: 3, code: 'not_assigned', value: 't4@school-a.example' }] });

    // Publishing: a draft gives 5-B English to T2 (no assignment then); Setup then gives 5-B English to T3 only.
    await db.pg.query(
      `insert into school_settings (school_id, module_id, schema_version, setting_values, revision) values ($1, 'timetable', $2, '{"max_consecutive": 3}', 1)
       on conflict (school_id, module_id) do update set setting_values = excluded.setting_values, revision = school_settings.revision + 1`,
      [A, TIMETABLE_SCHEMA]
    );
    expect(await as(coord, (c) => setLoad(c, actor(coord), { classId: C5B, subjectId: ENGLISH, periods: 2, teacherUserId: T2 }))).toEqual({ ok: true });
    const made = await as(coord, (c) => propose(c, actor(coord)));
    if (!made.ok) throw new Error(`no proposal: ${JSON.stringify(made)}`);
    await as(admin, (c) => assign(c, actor(admin), { teacherUserId: T3, classId: C5B, subjectId: ENGLISH }));
    const before = (await db.pg.query(`select class_id, weekday, period, subject_id, teacher_user_id from timetable_entries where school_id = $1 order by 1, 2, 3`, [A])).rows;
    // Its check read the assignments a moment before: the database refuses, the answer is the check's own.
    vi.mocked(activeAssignments).mockResolvedValueOnce([]);
    expect(await as(coord, (c) => publishDraft(c, actor(coord), made.proposalId, { withMissing: true }))).toEqual({ ok: false, reason: 'not_assigned' });
    expect(await checkSaw(activeAssignments)).toEqual([]);
    expect((await db.pg.query(`select class_id, weekday, period, subject_id, teacher_user_id from timetable_entries where school_id = $1 order by 1, 2, 3`, [A])).rows).toEqual(before);
    expect((await db.pg.query(`select state from timetable_proposals where proposal_id = $1`, [made.proposalId])).rows[0].state).toBe('draft');
    // And without the race, the check refuses it, and the draft says why.
    expect(await as(coord, (c) => publishDraft(c, actor(coord), made.proposalId, { withMissing: true }))).toEqual({ ok: false, reason: 'not_assigned' });
    expect((await as(coord, (c) => draftView(c, A)))!.notAssigned).toEqual([{ classId: C5B, subjectId: ENGLISH, teacherUserId: T2 }]);
  });
});

describe('3: a period made before the rule stays (C230-C)', () => {
  it('the contradicting period is still there and read; other periods are written; it may be left, touched or cleared; changing it must keep to the rule', async () => {
    // Made before the migration: 5-A Maths, Monday period 1, by T2, while Setup gives 5-A Maths to T1.
    expect(await period(C5A, 1, 1)).toEqual({ subjectId: MATHS, teacherUserId: T2 });
    expect((await as(principal, (c) => entriesForClass(c, A, C5A))).find((e) => e.weekday === 1 && e.period === 1)).toMatchObject({ teacher_user_id: T2, subject_id: MATHS });
    expect(await rows(t2, `select 1 from timetable_entries where teacher_user_id = $1 and weekday = 1 and period = 1`, [T2])).toHaveLength(1);
    // Another period of the same class and subject is written, and another row is changed, as before.
    expect(await as(principal, (c) => putEntry(c, actor(principal), { classId: C5A, weekday: 1, period: 2, subjectId: MATHS, teacherUserId: T1 }))).toMatchObject({ ok: true });
    expect(await rows(coord, `update timetable_entries set teacher_user_id = $1 where school_id = $2 and class_id = $3 and weekday = 3 and period = 3 returning 1`, [T2, A, C6A])).toHaveLength(1);
    // An update that changes nothing the rule reads leaves it as it is.
    expect(await rows(coord, `update timetable_entries set updated_at = now() where school_id = $1 and class_id = $2 and weekday = 1 and period = 1 returning 1`, [A, C5A])).toHaveLength(1);
    // A change of the assignments never rewrites or refuses it.
    await as(admin, (c) => assign(c, actor(admin), { teacherUserId: T1, classId: C5A, subjectId: ENGLISH }));
    expect(await period(C5A, 1, 1)).toEqual({ subjectId: MATHS, teacherUserId: T2 });
    // Changing its teacher to another one not assigned is refused, by the database and by the app.
    await expect(as(coord, (c) => c.query(`update timetable_entries set teacher_user_id = $1 where school_id = $2 and class_id = $3 and weekday = 1 and period = 1`, [T4, A, C5A]))).rejects.toThrow(RULE);
    expect(await as(coord, (c) => putEntry(c, actor(coord), { classId: C5A, weekday: 1, period: 1, subjectId: MATHS, teacherUserId: T4 }))).toEqual({ ok: false, reason: 'not_assigned' });
    // Moving it to another period is a change too.
    await expect(as(coord, (c) => c.query(`update timetable_entries set period = 7 where school_id = $1 and class_id = $2 and weekday = 1 and period = 1`, [A, C5A]))).rejects.toThrow(RULE);
    expect(await period(C5A, 1, 1)).toEqual({ subjectId: MATHS, teacherUserId: T2 });
    // Given to an assigned teacher, it keeps to the rule; or it is cleared.
    expect(await rows(coord, `update timetable_entries set teacher_user_id = $1 where school_id = $2 and class_id = $3 and weekday = 1 and period = 1 returning 1`, [T1, A, C5A])).toHaveLength(1);
    expect(await as(coord, (c) => clearEntry(c, actor(coord), { classId: C5A, weekday: 1, period: 1 }))).toBe(true);
    expect(await period(C5A, 1, 1)).toBeNull();
  });
});
