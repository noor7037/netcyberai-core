import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { assign, assignmentChoices, decideRequest, listAssignments, proposeAssignment, requestsWaiting, unassign, waitingRequests } from '@/lib/academics/teacher-subjects';
import { schemaProblems } from '@/lib/frameworks/settings-engine';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { readAllSettings, saveSettings } from '@/lib/frameworks/settings-store';
import { draftView, generatorRules, propose, publishDraft, readConstraints, setLoad } from '@/lib/timetable/generator-store';
import type { Slot } from '@/lib/timetable/plan';
import { importTimetable, putEntry, teacherWorkload } from '@/lib/timetable/timetable';

// docs/28 slice 10g (C231) on the whole schema, every migration replayed, as the app's own database role with each
// person's role. The acceptance sentences:
//   C1  who teaches what (teacher_subjects) is written by the office on the Staff screen; a teacher may propose for
//       themselves, the office confirms or declines; only a confirmed proposal is written. A teachers row is made for a
//       teacher when first needed, one per user, never for anyone else. A teacher cannot write it, nor confirm their
//       own proposal. The generator and the clash guard read it: a teacher Setup does not assign to a class and subject
//       that HAS assignments is refused ('not_assigned'); with none, as before.
//   C2  the most periods in a row for one teacher has no default: no proposal until the school sets it, and nothing
//       makes up a number for it; a draft made under the old default keeps working until it is decided.
//   C3  periods a week per teacher, read from the published timetable.
// Audit rows hold ids only. Every name is made up.

const A = 'c2310000-0000-4000-8000-0000000001a1';
const B = 'c2310000-0000-4000-8000-0000000001b1';
const u = (n: number) => `c2310000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
const [PRINCIPAL, ADMIN, COORD, ACCOUNTANT, PRINCIPAL_B] = [u(11), u(12), u(13), u(14), u(15)];
const [T1, T2, T3, T_GONE] = [u(21), u(22), u(23), u(24)];
const [C5A, C5B, C6A, CB] = [u(51), u(52), u(53), u(54)];
const [MATHS, ENGLISH, SB] = [u(61), u(62), u(63)];
const IDS = ['teacherId', 'teacherUserId', 'subjectId', 'classId'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school?: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const coord: Who = { role: 'academic_coordinator', user: COORD };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
const t1: Who = { role: 'teacher', user: T1 };
const t2: Who = { role: 'teacher', user: T2 };
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
const count = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows[0].n as number;
const teacherIdOf = async (user: string) => ((await db.pg.query(`select teacher_id from teachers where school_id = $1 and user_id = $2`, [A, user])).rows[0]?.teacher_id as string | undefined) ?? null;
const assigned = async () => (await db.pg.query(`select t.user_id as "teacherUserId", ts.class_id as "classId", ts.subject_id as "subjectId" from teacher_subjects ts join teachers t on t.teacher_id = ts.teacher_id where ts.school_id = $1 order by 1, 2, 3`, [A])).rows;
const timetable = async (): Promise<Slot[]> =>
  (await db.pg.query(`select class_id as "classId", weekday::int as weekday, period::int as period, subject_id as "subjectId", teacher_user_id as "teacherUserId" from timetable_entries where school_id = $1 order by class_id, weekday, period`, [A])).rows;
const key = (s: Slot) => `${s.classId}:${s.weekday}:${s.period}:${s.subjectId}:${s.teacherUserId}`;
const setLimit = (n: number | null) =>
  n === null
    ? db.pg.query(`delete from school_settings where school_id = $1 and module_id = 'timetable'`, [A])
    : db.pg.query(
        `insert into school_settings (school_id, module_id, schema_version, setting_values, revision) values ($1, 'timetable', $2, $3, 1)
         on conflict (school_id, module_id) do update set setting_values = excluded.setting_values, revision = school_settings.revision + 1`,
        [A, SETTINGS_SCHEMAS.find((s) => s.moduleId === 'timetable')!.version, JSON.stringify({ max_consecutive: n })]
      );
const clearAll = () =>
  db.pg.exec(`set session_replication_role = replica;
    delete from timetable_versions; delete from timetable_proposals; delete from timetable_loads; delete from timetable_entries;
    delete from teacher_subject_requests; delete from teacher_subjects; delete from teachers;
    delete from school_settings where module_id = 'timetable';
    set session_replication_role = origin;`);

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
    insert into school_entitlements (school_id, plan) values ('${A}', 'standard');
    insert into school_module_entitlements (school_id, module_id, enabled, source) values ('${A}', 'timetable', true, 'plan') on conflict do nothing;
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'p@school-a.example', 'principal', 'Priya Principal', true), ('${ADMIN}', '${A}', 'ad@school-a.example', 'school_admin', 'Asif Admin', true),
      ('${COORD}', '${A}', 'co@school-a.example', 'academic_coordinator', 'Chitra Coordinator', true), ('${ACCOUNTANT}', '${A}', 'acc@school-a.example', 'accountant', 'Anil Accountant', true),
      ('${T1}', '${A}', 't1@school-a.example', 'teacher', 'Tara Teacher', true), ('${T2}', '${A}', 't2@school-a.example', 'teacher', 'Tarun Teacher', true),
      ('${T3}', '${A}', 't3@school-a.example', 'teacher', 'Tanya Teacher', true), ('${T_GONE}', '${A}', 'gone@school-a.example', 'teacher', 'Gopal Gone', false),
      ('${PRINCIPAL_B}', '${B}', 'p@school-b.example', 'principal', 'Bela Principal', true);
    insert into classes (class_id, school_id, name, grade, section) values ('${C5A}', '${A}', '5-A', '5', 'A'), ('${C5B}', '${A}', '5-B', '5', 'B'), ('${C6A}', '${A}', '6-A', '6', 'A'), ('${CB}', '${B}', '9-Z', '9', 'Z');
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Maths'), ('${ENGLISH}', '${A}', 'English'), ('${SB}', '${B}', 'History');
  `);
}, 120_000);
afterAll(async () => db?.stop());

describe('C1: who teaches what, written by the office only', () => {
  // C243 (C230-C): the academic coordinator writes teacher_subjects too, and makes a teacher's teachers row
  // (test/timetable/assigned-teacher-db.test.ts); changing or removing one stays the office's.
  it('a teacher and the accountant cannot write teachers or teacher_subjects; the office can, and a teachers row only for a teacher, once', async () => {
    await clearAll();
    for (const who of [t1, accountant])
      await expect(as(who, (c) => c.query(`insert into teachers (school_id, user_id, name) values ($1, $2, 'Tara Teacher')`, [A, T1]))).rejects.toThrow(/row-level security/);
    // Never for a user who is not a teacher, whoever asks.
    for (const target of [PRINCIPAL, ACCOUNTANT])
      await expect(as(principal, (c) => c.query(`insert into teachers (school_id, user_id, name) values ($1, $2, 'Someone')`, [A, target]))).rejects.toThrow(/row-level security/);
    await as(principal, (c) => c.query(`insert into teachers (school_id, user_id, name) values ($1, $2, 'Tara Teacher')`, [A, T1]));
    // One per user.
    await expect(as(admin, (c) => c.query(`insert into teachers (school_id, user_id, name) values ($1, $2, 'Tara Teacher')`, [A, T1]))).rejects.toThrow(/teachers_one_per_user/);
    const tid = (await teacherIdOf(T1))!;
    for (const who of [t1, accountant])
      await expect(as(who, (c) => c.query(`insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) values ($1, $2, $3, $4)`, [A, tid, MATHS, C5A]))).rejects.toThrow(/row-level security/);
    await as(admin, (c) => c.query(`insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) values ($1, $2, $3, $4)`, [A, tid, MATHS, C5A]));
    // A teacher can neither take it away nor change it, nor change their teachers row: nothing happens.
    expect(await rows(t1, `delete from teacher_subjects returning 1`)).toEqual([]);
    expect(await rows(t1, `update teacher_subjects set class_id = $1 returning 1`, [C5B])).toEqual([]);
    expect(await rows(t1, `update teachers set name = 'Someone else' returning 1`)).toEqual([]);
    expect(await rows(accountant, `delete from teacher_subjects returning 1`)).toEqual([]);
    expect(await rows(coord, `update teachers set name = 'Someone else' returning 1`)).toEqual([]);
    expect(await assigned()).toEqual([{ teacherUserId: T1, classId: C5A, subjectId: MATHS }]);
    // Everyone of the school still reads them: the teacher_scope_* policies need to.
    expect(await rows(t2, `select 1 from teacher_subjects`)).toHaveLength(1);
    expect(await rows(accountant, `select 1 from teachers`)).toHaveLength(1);
  });

  it('assign and unassign: the office, audited with ids; the teachers row made once; never for a non-teacher or a teacher no longer active', async () => {
    await clearAll();
    const from = await count(`select coalesce(max(audit_id), 0)::int as n from audit_log`);
    expect(await as(admin, (c) => assign(c, actor(admin), { teacherUserId: T2, classId: C5A, subjectId: ENGLISH }))).toEqual({ ok: true, created: true });
    expect(await as(principal, (c) => assign(c, actor(principal), { teacherUserId: T2, classId: C5B, subjectId: ENGLISH }))).toEqual({ ok: true, created: true });
    expect(await as(principal, (c) => assign(c, actor(principal), { teacherUserId: T2, classId: C5B, subjectId: ENGLISH }))).toEqual({ ok: true, created: false });
    expect(await count(`select count(*)::int as n from teachers where school_id = $1 and user_id = $2`, [A, T2])).toBe(1);
    expect((await db.pg.query(`select name from teachers where user_id = $1`, [T2])).rows[0].name).toBe('Tarun Teacher');
    for (const [teacherUserId, reason] of [[PRINCIPAL, 'unknown_teacher'], [T_GONE, 'unknown_teacher'], [PRINCIPAL_B, 'unknown_teacher']] as const)
      expect(await as(principal, (c) => assign(c, actor(principal), { teacherUserId, classId: C5A, subjectId: MATHS }))).toEqual({ ok: false, reason });
    expect(await as(principal, (c) => assign(c, actor(principal), { teacherUserId: T1, classId: CB, subjectId: MATHS }))).toEqual({ ok: false, reason: 'unknown_class' });
    expect(await as(principal, (c) => assign(c, actor(principal), { teacherUserId: T1, classId: C5A, subjectId: SB }))).toEqual({ ok: false, reason: 'unknown_subject' });
    expect(await count(`select count(*)::int as n from teachers where user_id = any ($1::uuid[])`, [[PRINCIPAL, T_GONE, PRINCIPAL_B, T1]])).toBe(0);
    // The app's own path refuses the others too: the database does not let them in.
    await expect(as(t1, (c) => assign(c, actor(t1), { teacherUserId: T1, classId: C5A, subjectId: MATHS }))).rejects.toThrow(/row-level security/);
    expect(await as(admin, (c) => unassign(c, actor(admin), { teacherUserId: T2, classId: C5A, subjectId: ENGLISH }))).toBe(true);
    expect(await as(admin, (c) => unassign(c, actor(admin), { teacherUserId: T2, classId: C5A, subjectId: ENGLISH }))).toBe(false);
    expect(await as(t2, (c) => unassign(c, actor(t2), { teacherUserId: T2, classId: C5B, subjectId: ENGLISH }))).toBe(false);
    expect(await as(t2, (c) => listAssignments(c, A, T2))).toEqual([{ teacherUserId: T2, classId: C5B, subjectId: ENGLISH }]);
    const audit = (await db.pg.query(`select event_action, before_state, after_state from audit_log where audit_id > $1 and school_id = $2 order by audit_id`, [from, A])).rows;
    expect(audit.map((r: { event_action: string }) => r.event_action)).toEqual(['teacher.profile_made', 'teacher_subject.assign', 'teacher_subject.assign', 'teacher_subject.unassign']);
    for (const r of audit) for (const k of Object.keys({ ...(r.before_state ?? {}), ...(r.after_state ?? {}) })) expect(IDS).toContain(k);
    expect(JSON.stringify(audit)).not.toMatch(/Tarun|Teacher/);
  });

  it('a teacher proposes for themselves; the office and that teacher read it; the office decides once; never the teacher who asked', async () => {
    await clearAll();
    expect(await as(t1, (c) => proposeAssignment(c, actor(t1), { classId: C5A, subjectId: MATHS }))).toMatchObject({ ok: true });
    expect(await as(t1, (c) => proposeAssignment(c, actor(t1), { classId: C5A, subjectId: MATHS }))).toEqual({ ok: false, reason: 'already_requested' });
    expect(await as(t1, (c) => proposeAssignment(c, actor(t1), { classId: CB, subjectId: MATHS }))).toEqual({ ok: false, reason: 'unknown_class' });
    // Only for themselves, and only a teacher.
    await expect(as(t1, (c) => c.query(`insert into teacher_subject_requests (school_id, teacher_user_id, class_id, subject_id) values ($1, $2, $3, $4)`, [A, T2, C5B, MATHS]))).rejects.toThrow(/row-level security/);
    await expect(as(principal, (c) => c.query(`insert into teacher_subject_requests (school_id, teacher_user_id, class_id, subject_id) values ($1, $2, $3, $4)`, [A, T2, C5B, MATHS]))).rejects.toThrow(/row-level security/);
    // Read by the office and by the teacher who asked; nobody else.
    for (const [who, n] of [[t1, 1], [t2, 0], [coord, 1], [accountant, 0], [principal, 1], [admin, 1]] as const) expect(await rows(who, `select 1 from teacher_subject_requests`), who.role + who.user).toHaveLength(n);
    expect(await as(admin, (c) => requestsWaiting(c, A))).toBe(1);
    const [waiting] = await as(admin, (c) => waitingRequests(c, A));
    expect(waiting).toMatchObject({ teacherUserId: T1, classId: C5A, subjectId: MATHS, state: 'pending', decidedAt: null });
    // The teacher who asked cannot confirm it: not by the database, not by the app's own path.
    expect(await rows(t1, `update teacher_subject_requests set state = 'confirmed', decided_by = $1 returning 1`, [T1])).toEqual([]);
    expect(await as(t1, (c) => decideRequest(c, actor(t1), waiting.requestId, 'confirm'))).toEqual({ ok: false, reason: 'not_found' });
    expect(await rows(accountant, `update teacher_subject_requests set state = 'declined', decided_by = $1 returning 1`, [ACCOUNTANT])).toEqual([]);
    // Confirmed only with the assignment written: the database checks it.
    await expect(as(principal, (c) => c.query(`update teacher_subject_requests set state = 'confirmed', decided_by = $1`, [PRINCIPAL]))).rejects.toThrow(/is in teacher_subjects/);
    expect(await assigned()).toEqual([]);
    expect(await as(principal, (c) => decideRequest(c, actor(principal), waiting.requestId, 'confirm'))).toEqual({ ok: true, state: 'confirmed' });
    expect(await assigned()).toEqual([{ teacherUserId: T1, classId: C5A, subjectId: MATHS }]);
    expect(await as(principal, (c) => decideRequest(c, actor(principal), waiting.requestId, 'decline'))).toEqual({ ok: false, reason: 'not_found' });
    await expect(as(principal, (c) => c.query(`update teacher_subject_requests set state = 'pending', decided_by = null, decided_at = null`))).rejects.toThrow(/stays as it is/);
    // Already given: nothing to propose. Declined: nothing written.
    expect(await as(t1, (c) => proposeAssignment(c, actor(t1), { classId: C5A, subjectId: MATHS }))).toEqual({ ok: false, reason: 'already_assigned' });
    const made = await as(t2, (c) => proposeAssignment(c, actor(t2), { classId: C5B, subjectId: ENGLISH }));
    expect(made.ok && (await as(admin, (c) => decideRequest(c, actor(admin), made.requestId, 'decline')))).toEqual({ ok: true, state: 'declined' });
    expect(await assigned()).toEqual([{ teacherUserId: T1, classId: C5A, subjectId: MATHS }]);
    // The office giving the same subject directly confirms a proposal of it that waits.
    const again = await as(t2, (c) => proposeAssignment(c, actor(t2), { classId: C5B, subjectId: ENGLISH }));
    expect(await as(admin, (c) => assign(c, actor(admin), { teacherUserId: T2, classId: C5B, subjectId: ENGLISH }))).toEqual({ ok: true, created: true });
    expect(again.ok && (await db.pg.query(`select state, decided_by from teacher_subject_requests where request_id = $1`, [again.requestId])).rows[0]).toEqual({ state: 'confirmed', decided_by: ADMIN });
    // A teacher who left cannot be given it: confirming is refused, and the office declines it.
    const gone = await as(t1, (c) => proposeAssignment(c, actor(t1), { classId: C6A, subjectId: ENGLISH }));
    await db.pg.query(`update users set is_active = false where user_id = $1`, [T1]);
    try {
      expect(gone.ok && (await as(admin, (c) => decideRequest(c, actor(admin), gone.requestId, 'confirm')))).toEqual({ ok: false, reason: 'unknown_teacher' });
      expect(gone.ok && (await as(admin, (c) => decideRequest(c, actor(admin), gone.requestId, 'decline')))).toEqual({ ok: true, state: 'declined' });
    } finally {
      await db.pg.query(`update users set is_active = true where user_id = $1`, [T1]);
    }
    // Audit rows: ids only. A proposal's rows are read as the proposals are: the office, or the person who acted.
    const audit = (await db.pg.query(`select before_state, after_state from audit_log where school_id = $1 and (event_action like 'teacher_subject.%' or event_action = 'teacher.profile_made')`, [A])).rows;
    for (const r of audit) for (const k of Object.keys({ ...(r.before_state ?? {}), ...(r.after_state ?? {}) })) expect(IDS).toContain(k);
    const proposed = `select actor_user_id from audit_log where event_action = 'teacher_subject.requested'`;
    expect(new Set((await rows(principal, proposed)).map((r) => (r as { actor_user_id: string }).actor_user_id))).toEqual(new Set([T1, T2]));
    expect(new Set((await rows(t1, proposed)).map((r) => (r as { actor_user_id: string }).actor_user_id))).toEqual(new Set([T1]));
    expect(new Set((await rows(coord, proposed)).map((r) => (r as { actor_user_id: string }).actor_user_id))).toEqual(new Set([T1, T2]));
    expect(await rows(accountant, proposed)).toEqual([]);
    expect(await rows({ role: 'teacher', user: T3 }, `select 1 from audit_log where event_action like 'teacher_subject.request%'`)).toEqual([]);
    expect(await rows(t2, `select 1 from audit_log where event_action like 'teacher_subject.request%' and actor_user_id <> $1`, [T2])).toEqual([]);
  });

  it('a teacher who left no longer holds a subject back, and is still listed on Staff while they have subjects, so the office can take them away', async () => {
    await clearAll();
    await as(principal, (c) => assign(c, actor(principal), { teacherUserId: T3, classId: C6A, subjectId: ENGLISH }));
    await db.pg.query(`update users set is_active = false where user_id = $1`, [T3]);
    try {
      expect(await as(principal, (c) => putEntry(c, actor(principal), { classId: C6A, weekday: 2, period: 1, subjectId: ENGLISH, teacherUserId: T2 }))).toMatchObject({ ok: true });
      const choices = await as(principal, (c) => assignmentChoices(c, A));
      expect(choices.teachers.find((p) => p.id === T3)).toEqual({ id: T3, name: 'Tanya Teacher', active: false });
      expect(choices.teachers.some((p) => p.id === T_GONE)).toBe(false);
      expect(await as(admin, (c) => unassign(c, actor(admin), { teacherUserId: T3, classId: C6A, subjectId: ENGLISH }))).toBe(true);
      expect((await as(principal, (c) => assignmentChoices(c, A))).teachers.some((p) => p.id === T3)).toBe(false);
    } finally {
      await db.pg.query(`update users set is_active = true where user_id = $1`, [T3]);
    }
  });
});

describe('C1: the timetable reads who teaches what', () => {
  it('putEntry: a class and subject with assignments take only those teachers ("not_assigned"); with none, any active teacher, as before; a clash is still named first', async () => {
    await clearAll();
    await as(principal, (c) => assign(c, actor(principal), { teacherUserId: T1, classId: C5A, subjectId: MATHS }));
    const put = (who: Who, slot: Slot) => as(who, (c) => putEntry(c, actor(who), slot));
    // On the code before C231 this was saved.
    expect(await put(principal, { classId: C5A, weekday: 1, period: 1, subjectId: MATHS, teacherUserId: T2 })).toEqual({ ok: false, reason: 'not_assigned' });
    expect(await put(coord, { classId: C5A, weekday: 1, period: 1, subjectId: MATHS, teacherUserId: T1 })).toMatchObject({ ok: true });
    // No assignment for 6-A Maths or 5-A English: as before.
    expect(await put(principal, { classId: C6A, weekday: 1, period: 2, subjectId: MATHS, teacherUserId: T2 })).toMatchObject({ ok: true });
    expect(await put(principal, { classId: C5A, weekday: 1, period: 2, subjectId: ENGLISH, teacherUserId: T3 })).toMatchObject({ ok: true });
    // T2 teaches 6-A in period 2: the clash is named, as it always was.
    expect(await put(principal, { classId: C5A, weekday: 1, period: 2, subjectId: MATHS, teacherUserId: T2 })).toMatchObject({ ok: false, reason: 'teacher_clash' });
    expect((await timetable()).map(key).sort()).toEqual([`${C5A}:1:1:${MATHS}:${T1}`, `${C5A}:1:2:${ENGLISH}:${T3}`, `${C6A}:1:2:${MATHS}:${T2}`].sort());
    // The CSV import: the same rule, line by line, and nothing imported.
    const csv = `class,day,period,subject,teacher\n5-A,TUE,1,Maths,t2@school-a.example\n6-A,TUE,1,Maths,t3@school-a.example\n`;
    expect(await as(principal, (c) => importTimetable(c, actor(principal), csv))).toEqual({ ok: false, problems: [{ line: 2, code: 'not_assigned', value: 't2@school-a.example' }] });
    expect(await timetable()).toHaveLength(3);
  });

  it('the generator: a load takes an assigned teacher; a load left from before is not placed, with the reason; publishing refuses a teacher no longer assigned', async () => {
    await clearAll();
    await setLimit(3);
    await as(principal, (c) => assign(c, actor(principal), { teacherUserId: T1, classId: C5A, subjectId: MATHS }));
    expect(await as(coord, (c) => setLoad(c, actor(coord), { classId: C5A, subjectId: MATHS, periods: 3, teacherUserId: T2 }))).toEqual({ ok: false, reason: 'not_assigned' });
    expect(await as(coord, (c) => setLoad(c, actor(coord), { classId: C5A, subjectId: MATHS, periods: 3, teacherUserId: T1 }))).toEqual({ ok: true });
    expect(await as(coord, (c) => setLoad(c, actor(coord), { classId: C6A, subjectId: MATHS, periods: 2, teacherUserId: T2 }))).toEqual({ ok: true });
    expect((await as(coord, (c) => readConstraints(c, A))).assigned).toEqual([{ classId: C5A, subjectId: MATHS, teacherUserId: T1 }]);
    // Setup now gives 6-A Maths to T3: T2's load is from before. It is not placed, and says why.
    await as(admin, (c) => assign(c, actor(admin), { teacherUserId: T3, classId: C6A, subjectId: MATHS }));
    const made = await as(coord, (c) => propose(c, actor(coord)));
    expect(made).toMatchObject({ ok: true, placed: 3, notPlaced: 2 });
    let view = (await as(coord, (c) => draftView(c, A)))!;
    expect(view.unplaced).toEqual([{ classId: C6A, subjectId: MATHS, teacherUserId: T2, wanted: 2, placed: 0, reason: 'not_assigned' }]);
    expect(view.entries.every((e) => e.teacherUserId === T1 && e.classId === C5A)).toBe(true);
    expect(view.notAssigned).toEqual([]);
    // Then Setup gives 5-A Maths to T3 instead of T1: the draft says so, and publishing is refused; nothing written.
    await as(admin, (c) => assign(c, actor(admin), { teacherUserId: T3, classId: C5A, subjectId: MATHS }));
    await as(admin, (c) => unassign(c, actor(admin), { teacherUserId: T1, classId: C5A, subjectId: MATHS }));
    view = (await as(coord, (c) => draftView(c, A)))!;
    expect(view.notAssigned).toEqual([{ classId: C5A, subjectId: MATHS, teacherUserId: T1 }]);
    expect(made.ok && (await as(coord, (c) => publishDraft(c, actor(coord), made.proposalId, { withMissing: true })))).toEqual({ ok: false, reason: 'not_assigned' });
    expect(await timetable()).toEqual([]);
    // Given back to T1: it publishes.
    await as(admin, (c) => assign(c, actor(admin), { teacherUserId: T1, classId: C5A, subjectId: MATHS }));
    expect(made.ok && (await as(coord, (c) => publishDraft(c, actor(coord), made.proposalId, { withMissing: true })))).toMatchObject({ ok: true, added: 3 });
  });
});

describe('C2: the most periods in a row for one teacher has no default', () => {
  const tt = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'timetable')!;

  it('the setting has no default and a new schema version; the settings screen shows it as not set; it is set, changed, never reset', async () => {
    await clearAll();
    expect(tt.version).toBe(3);
    expect(tt.fields.find((f) => f.key === 'max_consecutive')).toMatchObject({ default: null, min: 1, max: 12 });
    expect(schemaProblems(tt)).toEqual([]);
    const field = async () => (await as(principal, (c) => readAllSettings(c, { schoolId: A, role: 'principal' }))).find((m) => m.moduleId === 'timetable')?.fields.find((f) => f.def.key === 'max_consecutive');
    expect(await field()).toMatchObject({ value: null, isDefault: true, mayEdit: true });
    const saved = await as(principal, (c) => saveSettings(c, actor(principal), tt, { moduleId: 'timetable', baseRevision: 0, set: { max_consecutive: 4 } }));
    expect(saved).toMatchObject({ ok: true, settings: { values: { max_consecutive: 4 } } });
    expect(await field()).toMatchObject({ value: 4, isDefault: false });
    expect(await as(admin, (c) => saveSettings(c, actor(admin), tt, { moduleId: 'timetable', baseRevision: 1, resetToDefault: ['max_consecutive'] }))).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await as(admin, (c) => generatorRules(c, A))).toMatchObject({ maxConsecutive: 4 });
  });

  it('until the school sets it, no proposal is made and no number stands in for it', async () => {
    await clearAll();
    await as(principal, (c) => setLoad(c, actor(principal), { classId: C5A, subjectId: MATHS, periods: 3, teacherUserId: T1 }));
    // On the code before C231 this was 12 (no limit), a number nobody chose.
    expect(await as(principal, (c) => generatorRules(c, A))).toEqual({ days: [1, 2, 3, 4, 5, 6], periods: 8, maxConsecutive: null });
    expect(await as(principal, (c) => propose(c, actor(principal)))).toEqual({ ok: false, reason: 'no_consecutive_limit' });
    expect(await count(`select count(*)::int as n from timetable_proposals where school_id = $1`, [A])).toBe(0);
    await setLimit(2);
    expect(await as(principal, (c) => propose(c, actor(principal)))).toMatchObject({ ok: true, placed: 3 });
  });

  it('a draft made under the old default (12, nothing stored) keeps working until it is decided; once a limit is set, a draft under another is refused', async () => {
    await clearAll();
    await as(principal, (c) => setLoad(c, actor(principal), { classId: C5A, subjectId: MATHS, periods: 3, teacherUserId: T1 }));
    // As the old default left it: the draft records 12, and the school has nothing stored.
    await setLimit(12);
    const made = await as(principal, (c) => propose(c, actor(principal)));
    await setLimit(null);
    const view = (await as(principal, (c) => draftView(c, A)))!;
    expect(view.rules.maxConsecutive).toBe(12);
    expect(view.rulesChanged).toBe(false);
    // The school then sets a limit: that draft was made under another one.
    await setLimit(5);
    expect((await as(principal, (c) => draftView(c, A)))!.rulesChanged).toBe(true);
    expect(made.ok && (await as(principal, (c) => publishDraft(c, actor(principal), made.proposalId, { withMissing: true })))).toEqual({ ok: false, reason: 'rules_changed' });
    // Back to nothing stored: it publishes, under the limit it records.
    await setLimit(null);
    expect(made.ok && (await as(principal, (c) => publishDraft(c, actor(principal), made.proposalId, { withMissing: true })))).toMatchObject({ ok: true, added: 3 });
  });
});

describe('C3: periods a week per teacher, from the published timetable', () => {
  it('counts only the school’s week; the most first; every active teacher, a teacher no longer active only while they have periods', async () => {
    await clearAll();
    const put = (classId: string, weekday: number, period: number, teacherUserId: string) =>
      db.pg.query(`insert into timetable_entries (school_id, class_id, weekday, period, subject_id, teacher_user_id) values ($1, $2, $3, $4, $5, $6)`, [A, classId, weekday, period, MATHS, teacherUserId]);
    for (const w of [1, 2, 3, 4, 5]) await put(C5A, w, 1, T1);
    await put(C5A, 7, 1, T1); // Sunday: not a working day
    await put(C5A, 1, 10, T1); // past the periods a day (8)
    for (const w of [1, 2, 3]) await put(C5B, w, 2, T2);
    for (const w of [4, 5]) await put(C6A, w, 3, T_GONE);
    const week = { days: [1, 2, 3, 4, 5, 6], periods: 8 };
    const office = [
      { teacherUserId: T1, name: 'Tara Teacher', active: true, periods: 5 },
      { teacherUserId: T2, name: 'Tarun Teacher', active: true, periods: 3 },
      { teacherUserId: T_GONE, name: 'Gopal Gone', active: false, periods: 2 },
      { teacherUserId: T3, name: 'Tanya Teacher', active: true, periods: 0 },
    ];
    for (const who of [principal, admin, coord]) expect(await as(who, (c) => teacherWorkload(c, A, week)), who.role).toEqual(office);
    expect(await as(t2, (c) => teacherWorkload(c, A, { ...week, teacherUserId: T2 }))).toEqual([office[1]]);
    // Another school's office counts its own.
    expect(await as({ role: 'principal', user: PRINCIPAL_B, school: B }, (c) => teacherWorkload(c, B, week))).toEqual([]);
  });
});
