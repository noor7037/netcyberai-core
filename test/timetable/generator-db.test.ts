import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { isoWeekday, periodsToCover } from '@/lib/proxy/proxy';
import { indiaDate } from '@/lib/time/india';
import { diffWeeks, weekProblems } from '@/lib/timetable/generator';
import {
  discardDraft,
  draftView,
  generatorInPlan,
  history,
  propose,
  publishDraft,
  readConstraints,
  removeLoad,
  setLoad,
  setUnavailable,
  swapInDraft,
  versionDetail,
} from '@/lib/timetable/generator-store';
import type { Slot } from '@/lib/timetable/plan';
import { entriesForTeacher, putEntry } from '@/lib/timetable/timetable';
import { TODAY_PROVIDERS } from '@/lib/today/cards';

// The timetable generator on the whole schema (docs/28 slice 10f, C229), every migration replayed, as the app's own
// database role in the school's context with each person's role. The acceptance sentence: "A proposal never puts a
// teacher in two classes at once or a class in two subjects in one period, and meets each subject's periods or says
// which it could not. Nothing reaches timetable_entries until a person accepts." And: publishing goes through the
// timetable's own entry path in one transaction; each publish is kept and the earlier timetable is read back; My Day
// and Proxy Auto read what was published; the office plans and publishes, a teacher reads the published timetable as
// before, and nobody else reads anything of it; audit rows hold no names. Every name is made up.

const A = 'c2290000-0000-4000-8000-0000000002a1';
const B = 'c2290000-0000-4000-8000-0000000002b1';
const u = (n: number) => `c2290000-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`;
const [PRINCIPAL, ADMIN, COORD, ACCOUNTANT, PRINCIPAL_B] = [u(11), u(12), u(13), u(14), u(15)];
const [T1, T2, T3, T4, T_GONE] = [u(21), u(22), u(23), u(24), u(25)];
const [C5A, C5B, C6A, CB] = [u(51), u(52), u(53), u(54)];
const [MATHS, ENGLISH, HINDI, SB] = [u(61), u(62), u(63), u(64)];
const ALL_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const TODAY = indiaDate();
const W = isoWeekday(TODAY);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school?: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const coord: Who = { role: 'academic_coordinator', user: COORD };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
const t1: Who = { role: 'teacher', user: T1 };
const principalB: Who = { role: 'principal', user: PRINCIPAL_B, school: B };
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
const timetable = async (): Promise<Slot[]> =>
  (await db.pg.query(`select class_id as "classId", weekday::int as weekday, period::int as period, subject_id as "subjectId", teacher_user_id as "teacherUserId" from timetable_entries where school_id = $1 order by class_id, weekday, period`, [A])).rows;
const key = (s: Slot) => `${s.classId}:${s.weekday}:${s.period}:${s.subjectId}:${s.teacherUserId}`;
const sameSlots = (a: readonly Slot[], b: readonly Slot[]) => expect(a.map(key).sort()).toEqual(b.map(key).sort());
const draftRow = async () => (await db.pg.query(`select * from timetable_proposals where school_id = $1 and state = 'draft'`, [A])).rows[0];
const auditOf = async (action: string) => (await db.pg.query(`select actor_user_id, before_state, after_state from audit_log where school_id = $1 and event_action = $2 order by audit_id`, [A, action])).rows;
const clearPlans = () => db.pg.exec(`set session_replication_role = replica; delete from timetable_versions; delete from timetable_proposals; set session_replication_role = origin;`);
// The timetable as it was before any proposal: 6-A (never planned) has T1 in period 1 every day; 5-A has two periods
// of English that a publish will replace.
const BEFORE: Slot[] = [
  ...[1, 2, 3, 4, 5, 6, 7].map((w) => ({ classId: C6A, weekday: w, period: 1, subjectId: MATHS, teacherUserId: T1 })),
  { classId: C5A, weekday: 1, period: 1, subjectId: ENGLISH, teacherUserId: T2 },
  { classId: C5A, weekday: 1, period: 2, subjectId: ENGLISH, teacherUserId: T2 },
];
const resetTimetable = () =>
  db.pg.exec(`delete from timetable_entries where school_id = '${A}';
    insert into timetable_entries (school_id, class_id, weekday, period, subject_id, teacher_user_id) values ${BEFORE.map((s) => `('${A}', '${s.classId}', ${s.weekday}, ${s.period}, '${s.subjectId}', '${s.teacherUserId}')`).join(', ')};`);

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  const setup = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'setup')!;
  const tt = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'timetable')!;
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'p@school-a.example', 'principal', 'Priya Principal', true), ('${ADMIN}', '${A}', 'ad@school-a.example', 'school_admin', 'Asif Admin', true),
      ('${COORD}', '${A}', 'co@school-a.example', 'academic_coordinator', 'Chitra Coordinator', true), ('${ACCOUNTANT}', '${A}', 'acc@school-a.example', 'accountant', 'Anil Accountant', true),
      ('${T1}', '${A}', 't1@school-a.example', 'teacher', 'Tara Teacher', true), ('${T2}', '${A}', 't2@school-a.example', 'teacher', 'Tarun Teacher', true),
      ('${T3}', '${A}', 't3@school-a.example', 'teacher', 'Tanya Teacher', true), ('${T4}', '${A}', 't4@school-a.example', 'teacher', 'Tejas Teacher', true),
      ('${T_GONE}', '${A}', 'gone@school-a.example', 'teacher', 'Gopal Gone', false), ('${PRINCIPAL_B}', '${B}', 'p@school-b.example', 'principal', 'Bela Principal', true);
    insert into classes (class_id, school_id, name, grade, section) values ('${C5A}', '${A}', '5-A', '5', 'A'), ('${C5B}', '${A}', '5-B', '5', 'B'), ('${C6A}', '${A}', '6-A', '6', 'A'), ('${CB}', '${B}', '9-Z', '9', 'Z');
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Maths'), ('${ENGLISH}', '${A}', 'English'), ('${HINDI}', '${A}', 'Hindi'), ('${SB}', '${B}', 'History');
    insert into school_settings (school_id, module_id, schema_version, setting_values, revision) values
      ('${A}', 'setup', ${setup.version}, '${JSON.stringify({ working_days: ALL_DAYS })}', 1),
      ('${A}', 'timetable', ${tt.version}, '${JSON.stringify({ periods_per_day: 4, max_consecutive: 3 })}', 1);
  `);
  await resetTimetable();
}, 120_000);
afterAll(async () => db?.stop());

describe('the constraints', () => {
  it('the office keeps each class’s periods a week per subject and its teacher, and when teachers cannot teach', async () => {
    const loads: [Who, string, string, number, string][] = [
      [principal, C5A, MATHS, 5, T1], [principal, C5A, ENGLISH, 4, T2],
      [admin, C5B, MATHS, 4, T1], [coord, C5B, HINDI, 3, T3], [coord, C5B, ENGLISH, 5, T4],
    ];
    for (const [who, classId, subjectId, periods, teacherUserId] of loads) expect(await as(who, (c) => setLoad(c, actor(who), { classId, subjectId, periods, teacherUserId }))).toEqual({ ok: true });
    // T4 can teach only on Monday; T2 not on Wednesday's period 2. A whole day takes the place of its single periods.
    expect(await as(admin, (c) => setUnavailable(c, actor(admin), T4, [2, 3, 4, 5, 6, 7].map((w) => ({ weekday: w, period: null })).concat([{ weekday: 2, period: 3 } as never])))).toEqual({ ok: true, periods: 6 });
    expect(await as(coord, (c) => setUnavailable(c, actor(coord), T2, [{ weekday: 3, period: 2 }]))).toEqual({ ok: true, periods: 1 });
    const kept = await as(principal, (c) => readConstraints(c, A));
    expect(kept.rules).toEqual({ days: [1, 2, 3, 4, 5, 6, 7], periods: 4, maxConsecutive: 3 });
    expect(kept.loads).toHaveLength(5);
    expect(kept.unavailable).toHaveLength(7);
    // Changing a load replaces it; the audit rows hold ids and numbers.
    expect(await as(principal, (c) => setLoad(c, actor(principal), { classId: C5A, subjectId: MATHS, periods: 5, teacherUserId: T1 }))).toEqual({ ok: true });
    expect((await auditOf('timetable.plan.load_set')).at(-1)).toMatchObject({ actor_user_id: PRINCIPAL, before_state: { periods: 5, teacherUserId: T1 }, after_state: { classId: C5A, subjectId: MATHS, periods: 5, teacherUserId: T1 } });
  });

  it('only this school’s class, subject and active teacher; the database holds the teacher rule too', async () => {
    const set = (classId: string, subjectId: string, teacherUserId: string, periods = 2) => as(principal, (c) => setLoad(c, actor(principal), { classId, subjectId, periods, teacherUserId }));
    expect(await set(CB, MATHS, T1)).toEqual({ ok: false, reason: 'unknown_class' });
    expect(await set(C6A, SB, T1)).toEqual({ ok: false, reason: 'unknown_subject' });
    expect(await set(C6A, MATHS, T_GONE)).toEqual({ ok: false, reason: 'unknown_teacher' });
    expect(await set(C6A, MATHS, PRINCIPAL)).toEqual({ ok: false, reason: 'unknown_teacher' });
    expect(await set(C6A, MATHS, T1, 85)).toEqual({ ok: false, reason: 'bad_periods' });
    await expect(as(principal, (c) => c.query(`insert into timetable_loads (school_id, class_id, subject_id, periods_per_week, teacher_user_id, updated_by) values ($1, $2, $3, 2, $4, $5)`, [A, C6A, MATHS, T_GONE, PRINCIPAL]))).rejects.toThrow(/active teacher/);
    // Written in one's own name only.
    await expect(as(principal, (c) => c.query(`insert into timetable_loads (school_id, class_id, subject_id, periods_per_week, teacher_user_id, updated_by) values ($1, $2, $3, 2, $4, $5)`, [A, C6A, MATHS, T1, ADMIN]))).rejects.toThrow(/row-level security/);
    // A load added and taken away again.
    expect(await set(C6A, HINDI, T3)).toEqual({ ok: true });
    expect(await as(principal, (c) => removeLoad(c, actor(principal), { classId: C6A, subjectId: HINDI }))).toBe(true);
    expect(await as(principal, (c) => removeLoad(c, actor(principal), { classId: C6A, subjectId: HINDI }))).toBe(false);
  });

  it('nobody else reads or writes them: a teacher, an accountant, another school; the database refuses', async () => {
    for (const who of [t1, accountant]) {
      for (const table of ['timetable_loads', 'timetable_unavailable', 'timetable_proposals', 'timetable_versions']) expect(await rows(who, `select 1 from ${table}`), `${who.role} ${table}`).toEqual([]);
      await expect(as(who, (c) => c.query(`insert into timetable_loads (school_id, class_id, subject_id, periods_per_week, teacher_user_id, updated_by) values ($1, $2, $3, 2, $4, $5)`, [A, C6A, HINDI, T3, who.user]))).rejects.toThrow(/row-level security/);
      await expect(as(who, (c) => c.query(`insert into timetable_unavailable (school_id, teacher_user_id, weekday, period, updated_by) values ($1, $2, 1, 1, $3)`, [A, T3, who.user]))).rejects.toThrow(/row-level security/);
      expect(await rows(who, `delete from timetable_loads returning 1`)).toEqual([]);
    }
    expect(await rows(principalB, `select 1 from timetable_loads`)).toEqual([]);
    expect(await rows(principalB, `select 1 from timetable_unavailable`)).toEqual([]);
    expect((await db.pg.query(`select count(*)::int as n from timetable_loads where school_id = $1`, [A])).rows[0].n).toBe(5);
  });
});

describe('the proposal, the review and publishing', () => {
  let proposalId = '';

  it('a proposal never puts a teacher in two places or a class in two subjects at once, meets each subject’s periods or says which it could not; nothing reaches timetable_entries', async () => {
    const before = await timetable();
    const made = await as(principal, (c) => propose(c, actor(principal)));
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    proposalId = made.proposalId;
    sameSlots(await timetable(), before);
    const view = (await as(principal, (c) => draftView(c, A)))!;
    expect(view.classIds.sort()).toEqual([C5A, C5B].sort());
    // Every rule, checked again from scratch, with 6-A's periods kept as they are.
    const fixed = before.filter((s) => s.classId === C6A);
    const constraints = await as(principal, (c) => readConstraints(c, A));
    expect(weekProblems(view.entries, { ...constraints.rules, unavailable: constraints.unavailable, fixed })).toEqual([]);
    expect(view.problems).toEqual([]);
    const count = (classId: string, subjectId: string) => view.entries.filter((e) => e.classId === classId && e.subjectId === subjectId).length;
    expect([count(C5A, MATHS), count(C5A, ENGLISH), count(C5B, MATHS), count(C5B, HINDI)]).toEqual([5, 4, 4, 3]);
    // T1 keeps 6-A's period 1 every day: never put there; T4 only on Monday; T2 never on Wednesday's period 2.
    expect(view.entries.some((e) => e.teacherUserId === T1 && e.period === 1)).toBe(false);
    expect(view.entries.filter((e) => e.teacherUserId === T4).every((e) => e.weekday === 1)).toBe(true);
    expect(view.entries.some((e) => e.teacherUserId === T2 && e.weekday === 3 && e.period === 2)).toBe(false);
    // English in 5-B needs 5 periods; its teacher has Monday's 4, at most 3 in a row: said exactly, with why.
    expect(view.unplaced).toEqual([{ classId: C5B, subjectId: ENGLISH, teacherUserId: T4, wanted: 5, placed: 3, reason: 'teacher_week_full' }]);
    expect(count(C5B, ENGLISH)).toBe(3);
    // Beside the timetable now: 5-A's two old English periods are among the changes.
    expect(view.current.map(key).sort()).toEqual(before.filter((s) => s.classId === C5A).map(key).sort());
    expect(view.changes).toEqual(diffWeeks(before, view.entries, [C5A, C5B]));
    expect(view.stale).toBe(false);
    // The audit row: ids and counts.
    expect((await auditOf('timetable.plan.proposed')).at(-1)).toMatchObject({ actor_user_id: PRINCIPAL, after_state: { classes: 2, placed: view.entries.length, notPlaced: 2, loadsShort: 1 } });
  });

  it('the same constraints give the same week; a new proposal takes the place of the draft; one draft at a time', async () => {
    const first = (await draftRow()).entries;
    const again = await as(coord, (c) => propose(c, actor(coord)));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect((await draftRow()).entries).toEqual(first);
    expect((await db.pg.query(`select state, decided_by from timetable_proposals where proposal_id = $1`, [proposalId])).rows[0]).toEqual({ state: 'discarded', decided_by: COORD });
    proposalId = again.proposalId;
    // The database holds one draft per school.
    await expect(as(principal, (c) => c.query(`insert into timetable_proposals (school_id, days, periods, max_consecutive, class_ids, entries, unplaced, based_on, proposed_by) values ($1, '{1}', 4, 3, $2, '[]', '[]', md5('x'), $3)`, [A, [C5A], PRINCIPAL]))).rejects.toThrow(/timetable_proposals_one_draft/);
  });

  it('a person swaps two periods of a class: refused when the teacher would clash or cannot teach; kept and audited when it holds', async () => {
    const view = (await as(principal, (c) => draftView(c, A)))!;
    // A Maths period of 5-A, moved to period 1 of a day: T1 is in 6-A then.
    const maths = view.entries.find((e) => e.classId === C5A && e.subjectId === MATHS)!;
    const refused = await as(principal, (c) => swapInDraft(c, actor(principal), proposalId, C5A, { weekday: maths.weekday, period: maths.period }, { weekday: maths.weekday, period: 1 }));
    expect(refused).toMatchObject({ ok: false, reason: 'teacher_clash', with: { classId: C6A, teacherUserId: T1, period: 1 } });
    // T2 cannot teach on Wednesday's period 2: an English period of 5-A moved there is refused.
    const english = view.entries.find((e) => e.classId === C5A && e.subjectId === ENGLISH && !(e.weekday === 3 && e.period === 2))!;
    expect(await as(principal, (c) => swapInDraft(c, actor(principal), proposalId, C5A, { weekday: english.weekday, period: english.period }, { weekday: 3, period: 2 }))).toEqual({ ok: false, reason: 'unavailable' });
    // A swap that holds: a period of 5-A and another (or a free one) where both teachers are free and may teach.
    const mine = view.entries.filter((e) => e.classId === C5A);
    const week = [1, 2, 3, 4, 5, 6, 7].flatMap((weekday) => [1, 2, 3, 4].map((period) => ({ weekday, period })));
    const reasons = new Set<string>();
    let done = false;
    for (const a of mine) {
      for (const b of week) {
        const other = mine.find((e) => e.weekday === b.weekday && e.period === b.period);
        if (done || (a.weekday === b.weekday && a.period === b.period) || other?.subjectId === a.subjectId) continue;
        const r = await as(principal, (c) => swapInDraft(c, actor(principal), proposalId, C5A, { weekday: a.weekday, period: a.period }, b));
        if (!r.ok) reasons.add(r.reason);
        if (r.ok) {
          done = true;
          const after = (await draftRow()).entries as Slot[];
          expect(after.find((e) => e.classId === C5A && e.weekday === b.weekday && e.period === b.period)?.subjectId).toBe(a.subjectId);
          expect(after.find((e) => e.classId === C5A && e.weekday === a.weekday && e.period === a.period)?.subjectId).toBe(other?.subjectId);
          expect(weekProblems(after, { days: [1, 2, 3, 4, 5, 6, 7], periods: 4, maxConsecutive: 3, unavailable: (await as(principal, (c) => readConstraints(c, A))).unavailable, fixed: BEFORE.filter((s) => s.classId === C6A) })).toEqual([]);
          expect((await auditOf('timetable.plan.swapped')).at(-1)).toMatchObject({ actor_user_id: PRINCIPAL, after_state: { classId: C5A, from: { weekday: a.weekday, period: a.period }, to: { weekday: b.weekday, period: b.period } } });
        }
      }
    }
    expect(done, [...reasons].join()).toBe(true);
    expect((await draftRow()).swaps).toBe(1);
    // Another class's draft, or a class the draft does not plan, is not found.
    expect(await as(principal, (c) => swapInDraft(c, actor(principal), proposalId, C6A, { weekday: 1, period: 2 }, { weekday: 1, period: 3 }))).toEqual({ ok: false, reason: 'not_found' });
    // The database: only a draft's periods change, one swap at a time; what it could not place never changes.
    await expect(as(principal, (c) => c.query(`update timetable_proposals set unplaced = '[]' where proposal_id = $1`, [proposalId]))).rejects.toThrow(/only a draft/);
    await expect(as(principal, (c) => c.query(`update timetable_proposals set entries = '[]' where proposal_id = $1`, [proposalId]))).rejects.toThrow(/one swap/);
  });

  it('nothing is published without the person saying so for what could not be placed, and the database will not mark a draft published by itself', async () => {
    const before = await timetable();
    expect(await as(principal, (c) => publishDraft(c, actor(principal), proposalId, { withMissing: false }))).toEqual({ ok: false, reason: 'missing_not_accepted' });
    sameSlots(await timetable(), before);
    await expect(as(principal, (c) => c.query(`update timetable_proposals set state = 'published', decided_by = $2 where proposal_id = $1`, [proposalId, PRINCIPAL]))).rejects.toThrow(/has its version/);
    await expect(as(principal, (c) => c.query(`insert into timetable_versions (school_id, proposal_id, class_ids, before_entries, published_by) values ($1, $2, $3, '[]', $4)`, [A, proposalId, [C6A], PRINCIPAL]))).rejects.toThrow(/for its classes/);
    // A teacher, an accountant and another school cannot publish it, by the app or the database.
    for (const who of [t1, accountant]) {
      expect(await rows(who, `update timetable_proposals set state = 'discarded', decided_by = '${who.user}' returning 1`)).toEqual([]);
      expect(await as(who, (c) => publishDraft(c, actor(who), proposalId, { withMissing: true }))).toEqual({ ok: false, reason: 'not_found' });
    }
    expect(await as(principalB, (c) => publishDraft(c, actor(principalB), proposalId, { withMissing: true }))).toEqual({ ok: false, reason: 'not_found' });
    sameSlots(await timetable(), before);
  });

  it('a refusal on the entry path part way leaves nothing behind: the timetable, the draft and the history are as they were', async () => {
    const before = await timetable();
    // T3 leaves after the draft was made: putEntry refuses T3's periods, and every change before them is undone.
    await db.pg.query(`update users set is_active = false where user_id = $1`, [T3]);
    expect(await as(principal, (c) => publishDraft(c, actor(principal), proposalId, { withMissing: true }))).toEqual({ ok: false, reason: 'unknown_teacher' });
    await db.pg.query(`update users set is_active = true where user_id = $1`, [T3]);
    sameSlots(await timetable(), before);
    expect((await draftRow()).proposal_id).toBe(proposalId);
    expect((await db.pg.query(`select count(*)::int as n from timetable_versions`)).rows[0].n).toBe(0);
    expect(await auditOf('timetable.plan.published')).toEqual([]);
  });

  let published: { versionId: string; added: number; removed: number; changed: number } | null = null;
  let draftEntries: Slot[] = [];
  it('published by a person, through the timetable’s own entry path, in one transaction: the classes planned hold exactly the proposal; 6-A is untouched', async () => {
    const before = await timetable();
    draftEntries = (await draftRow()).entries;
    const auditFrom = (await db.pg.query(`select coalesce(max(audit_id), 0) as n from audit_log`)).rows[0].n;
    const r = await as(principal, (c) => publishDraft(c, actor(principal), proposalId, { withMissing: true }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    published = r;
    const after = await timetable();
    sameSlots(after.filter((s) => s.classId !== C6A), draftEntries);
    sameSlots(after.filter((s) => s.classId === C6A), before.filter((s) => s.classId === C6A));
    const changes = diffWeeks(before, draftEntries, [C5A, C5B]);
    expect([r.added, r.removed, r.changed]).toEqual(['added', 'removed', 'changed'].map((k) => changes.filter((c) => c.kind === k).length));
    // Every period that changed went through putEntry and clearEntry: their audit rows, in the person's name.
    const steps = (await db.pg.query(`select event_action, count(*)::int as n from audit_log where audit_id > $1 and event_action like 'timetable.%' and actor_user_id = $2 group by event_action order by event_action`, [auditFrom, PRINCIPAL])).rows;
    expect(r.added + r.changed).toBeGreaterThan(0);
    expect(steps).toEqual(
      [
        { event_action: 'timetable.clear', n: r.removed + r.changed },
        { event_action: 'timetable.plan.published', n: 1 },
        { event_action: 'timetable.set', n: r.added + r.changed },
      ].filter((s) => s.n > 0)
    );
    expect((await db.pg.query(`select state, decided_by from timetable_proposals where proposal_id = $1`, [proposalId])).rows[0]).toEqual({ state: 'published', decided_by: PRINCIPAL });
    // Published for good.
    await expect(as(principal, (c) => c.query(`update timetable_proposals set state = 'discarded' where proposal_id = $1`, [proposalId]))).rejects.toThrow(/stays as it is/);
    expect(await as(principal, (c) => discardDraft(c, actor(principal), proposalId))).toBe(false);
    // The database's own clash guard is still behind it all.
    const t1At = after.find((s) => s.teacherUserId === T1 && s.classId === C5A)!;
    await expect(db.pg.query(`insert into timetable_entries (school_id, class_id, weekday, period, subject_id, teacher_user_id) values ($1, $2, $3, $4, $5, $6)`, [A, C5B, t1At.weekday, t1At.period, MATHS, T1])).rejects.toThrow(/timetable_(class|teacher)_slot/);
  });

  it('each publish is kept: who, when, what changed; the earlier timetable is read back; the history cannot be changed', async () => {
    const list = await as(coord, (c) => history(c, A));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ versionId: published!.versionId, publishedBy: PRINCIPAL, publishedByName: 'Priya Principal', classes: 2, added: published!.added, removed: published!.removed, changed: published!.changed });
    const detail = (await as(admin, (c) => versionDetail(c, A, published!.versionId)))!;
    sameSlots(detail.before, BEFORE);
    sameSlots(detail.after, await timetable());
    expect(detail.changes).toEqual(diffWeeks(BEFORE, await timetable(), [C5A, C5B]));
    // Append-only, and the office's only.
    await expect(as(principal, (c) => c.query(`update timetable_versions set added = 0`))).rejects.toThrow(/permission denied/);
    await expect(as(principal, (c) => c.query(`delete from timetable_versions`))).rejects.toThrow(/permission denied/);
    expect(await as(t1, (c) => history(c, A))).toEqual([]);
    expect(await as(accountant, (c) => versionDetail(c, A, published!.versionId))).toBeNull();
    expect(await as(principalB, (c) => history(c, A))).toEqual([]);
  });

  it('a teacher reads the published timetable as before: their own periods', async () => {
    const mine = await as(t1, (c) => entriesForTeacher(c, A, T1));
    sameSlots(
      mine.map((e) => ({ classId: e.class_id, weekday: e.weekday, period: e.period, subjectId: e.subject_id, teacherUserId: e.teacher_user_id })),
      (await timetable()).filter((s) => s.teacherUserId === T1)
    );
  });

  it('My Day and Proxy Auto read what was published', async () => {
    const expectToday = [...draftEntries, ...BEFORE.filter((s) => s.classId === C6A)].filter((s) => s.teacherUserId === T1 && s.weekday === W);
    const card = TODAY_PROVIDERS.find((p) => p.type === 'timetable-today')!;
    const cards = await as(t1, (c) => card.load(c, { schoolId: A, userId: T1, role: 'teacher', sunday: false } as never));
    expect(cards[0]?.count ?? 0).toBe(expectToday.length);
    // T1 is on approved leave today: the periods to cover are T1's published periods of today.
    await db.pg.exec(`set session_replication_role = replica; insert into staff_leave (school_id, user_id, from_date, to_date, kind, reason, status, recorded_by, decided_by, decided_at) values ('${A}', '${T1}', '${TODAY}', '${TODAY}', 'sick', 'Unwell.', 'approved', '${ADMIN}', '${ADMIN}', now()); set session_replication_role = origin;`);
    const toCover = await as(principal, (c) => periodsToCover(c, A, TODAY));
    expect(toCover.map((p) => `${p.class_id}:${p.period}:${p.subject_id}`).sort()).toEqual(expectToday.map((s) => `${s.classId}:${s.period}:${s.subjectId}`).sort());
    await db.pg.exec(`set session_replication_role = replica; delete from staff_leave; set session_replication_role = origin;`);
  });

  it('a draft made before the timetable changed by hand cannot be published; a discarded draft is gone', async () => {
    const made = await as(admin, (c) => propose(c, actor(admin)));
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    // The school day changes in Settings (at most two periods in a row now): the draft was made for another day.
    const setTt = (values: object) => db.pg.query(`update school_settings set setting_values = $2 where school_id = $1 and module_id = 'timetable'`, [A, JSON.stringify(values)]);
    await setTt({ periods_per_day: 4, max_consecutive: 2 });
    expect(await as(admin, (c) => draftView(c, A))).toMatchObject({ stale: false, rulesChanged: true });
    expect(await as(admin, (c) => publishDraft(c, actor(admin), made.proposalId, { withMissing: true }))).toEqual({ ok: false, reason: 'rules_changed' });
    await setTt({ periods_per_day: 4, max_consecutive: 3 });
    expect(await as(admin, (c) => draftView(c, A))).toMatchObject({ stale: false, rulesChanged: false });
    // Someone fills a free period of 6-A by hand.
    const free = [2, 3, 4].map((p) => ({ weekday: 1, period: p })).find((at) => !draftEntries.some((e) => e.teacherUserId === T3 && e.weekday === at.weekday && e.period === at.period))!;
    expect((await as(principal, (c) => putEntry(c, actor(principal), { classId: C6A, ...free, subjectId: HINDI, teacherUserId: T3 }))).ok).toBe(true);
    expect((await as(admin, (c) => draftView(c, A)))!.stale).toBe(true);
    const before = await timetable();
    expect(await as(admin, (c) => publishDraft(c, actor(admin), made.proposalId, { withMissing: true }))).toEqual({ ok: false, reason: 'timetable_changed' });
    sameSlots(await timetable(), before);
    expect(await as(admin, (c) => discardDraft(c, actor(admin), made.proposalId))).toBe(true);
    expect(await as(admin, (c) => draftView(c, A))).toBeNull();
    expect((await auditOf('timetable.plan.discarded')).at(-1)).toMatchObject({ actor_user_id: ADMIN, after_state: { discarded: true } });
  });

  it('the academic coordinator plans and publishes too; My Day tells the office a proposal waits', async () => {
    const card = TODAY_PROVIDERS.find((p) => p.type === 'timetable-draft')!;
    const load = (who: Who) => as(who, (c) => card.load(c, { schoolId: A, userId: who.user, role: who.role, sunday: false } as never));
    expect(await load(principal)).toEqual([]);
    const made = await as(coord, (c) => propose(c, actor(coord)));
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    for (const who of [principal, admin, coord]) expect(await load(who), who.role).toEqual([{ id: 'timetable-draft', type: 'timetable-draft', moduleId: 'timetable', state: 'todo', count: 1, href: '/app/timetable/generator' }]);
    expect(card.roles).toEqual(['principal', 'school_admin', 'academic_coordinator']);
    // On a plan without the generator, no card; the generator is not in the plan.
    await db.pg.query(`insert into school_subscriptions (school_id, plan_id) values ($1, 'starter')`, [A]);
    expect(await as(principal, (c) => generatorInPlan(c, A))).toBe(false);
    expect(await load(principal)).toEqual([]);
    await db.pg.query(`delete from school_subscriptions where school_id = $1`, [A]);
    expect(await as(principal, (c) => generatorInPlan(c, A))).toBe(true);
    const r = await as(coord, (c) => publishDraft(c, actor(coord), made.proposalId, { withMissing: true }));
    expect(r.ok).toBe(true);
    expect(await load(principal)).toEqual([]);
    expect(await as(principal, (c) => history(c, A))).toHaveLength(2);
  });

  it('the generator’s audit rows hold no names and are the office’s, or the actor’s, to read', async () => {
    const all = (await db.pg.query(`select before_state, after_state from audit_log where school_id = $1 and event_action like 'timetable.plan.%'`, [A])).rows;
    expect(all.length).toBeGreaterThan(8);
    const text = JSON.stringify(all);
    for (const name of ['Priya', 'Asif', 'Chitra', 'Tara', 'Tarun', 'Tanya', 'Tejas', '5-A', '5-B', '6-A', 'Maths', 'English', 'Hindi']) expect(text, name).not.toContain(name);
    expect(await rows(t1, `select 1 from audit_log where event_action like 'timetable.plan.%'`)).toEqual([]);
    expect(await rows(accountant, `select 1 from audit_log where event_action like 'timetable.plan.%'`)).toEqual([]);
    expect((await rows(coord, `select 1 from audit_log where event_action like 'timetable.plan.%'`)).length).toBe(all.length);
    await clearPlans();
  });
});
