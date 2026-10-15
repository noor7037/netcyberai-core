import type { PoolClient } from 'pg';
import { writeAuditLog, writeAuditLogs } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { readSettings } from '@/lib/frameworks/settings-store';
import { planHasFeature } from '@/lib/frameworks/plans';
import { schoolCalendar } from '@/lib/payments/upi';
import { diffWeeks, generateTimetable, MAX_WEEK_PERIODS, swapInWeek, weekProblems, type Change, type Unavailable, type Unplaced, type WeekProblem } from './generator';
import { MAX_PERIODS, type Slot } from './plan';
import { ENTRY_SELECT, periodsPerDay, planLockKey, type Entry } from './timetable';

// The timetable generator in the database (docs/28 slice 10f, C229). Every function runs in the caller's own tenant
// transaction, as the app's role: row level security decides that only the office (PLANNERS) reads or writes the
// constraints, drafts and versions, and only in their own name (the migration p7_timetable_generator).
//
//   - The CONSTRAINTS: each class's periods a week per subject and its teacher (timetable_loads), the periods each
//     teacher cannot teach (timetable_unavailable), and the school's rules (its working days from Setup, its periods
//     a day and the most periods in a row for one teacher, settings of the module).
//   - PROPOSE runs the generator (./generator.ts, rules only) and keeps its week as the school's one DRAFT. It
//     writes nothing to timetable_entries.
//   - A person may SWAP two periods of a class in the draft; the swap is checked against the rules as they are now.
//   - PUBLISH is a person's decision: in one transaction (a savepoint, so a refusal leaves nothing behind), every
//     period that changes is written as the timetable's own entry path writes it, with the checks of putEntry() (the
//     class, subject and an active teacher are the school's; no teacher in two classes at once) and an audit row for
//     each period as putEntry() and clearEntry() write them, and the database's unique constraints behind them; in
//     a few statements for all the periods, not one at a time (review of C229). The version is kept
//     (timetable_versions) with the whole timetable before and after. A draft made against a timetable that has
//     changed since is refused: it would not be what the person reviewed.
//   - Audit rows ('timetable.plan.%') hold ids, counts, codes and dates only.
//
// The generator is a part of the plan (C223-A answer 1, C226: 'timetable-generator', Growth and Compass). Entering
// the timetable by hand and its CSV import are not.

type Sql = Pick<PoolClient, 'query'>;
type Actor = { schoolId: string; userId: string; role: StaffRole };

export const GENERATOR_FEATURE = 'timetable-generator' as const;
// Who plans and publishes: the roles that write the timetable (C146).
export const PLANNERS: readonly string[] = ['principal', 'school_admin', 'academic_coordinator'];
export const generatorInPlan = (db: Sql, schoolId: string): Promise<boolean> => planHasFeature(db as never, schoolId, GENERATOR_FEATURE);

export type Rules = { days: number[]; periods: number; maxConsecutive: number };
export type LoadRow = { classId: string; subjectId: string; periods: number; teacherUserId: string };
export type Names = { classes: { id: string; name: string }[]; subjects: { id: string; name: string }[]; teachers: { id: string; name: string; active: boolean }[] };

// Two people planning at the same moment are taken one after the other; a period filled or emptied by hand (which
// holds this lock shared, ./timetable.ts) waits too.
const lockPlan = (db: Sql, schoolId: string) => db.query(`select pg_advisory_xact_lock(hashtext($1))`, [planLockKey(schoolId)]);

export async function generatorRules(db: Sql, schoolId: string): Promise<Rules> {
  const schema = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'timetable');
  const raw = schema ? (await readSettings(db, schoolId, schema)).effective.max_consecutive : undefined;
  // A whole number from 1 to 12; a fraction is taken down (3.5 is 3), never read as no limit.
  const maxConsecutive = typeof raw === 'number' && Number.isFinite(raw) ? Math.min(MAX_PERIODS, Math.max(1, Math.floor(raw))) : MAX_PERIODS;
  // The one working calendar (Setup's working days), as attendance and Proxy Auto read it.
  const calendar = await schoolCalendar(db, schoolId);
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => calendar.weekdays.has(d % 7));
  return { days, periods: await periodsPerDay(db as PoolClient, schoolId), maxConsecutive };
}

// The names a screen shows beside the ids: the school's classes and subjects, and its teachers (those no longer
// active too, as an earlier timetable may name them).
export async function generatorNames(db: Sql, schoolId: string): Promise<Names> {
  const [classes, subjects, teachers] = await Promise.all([
    db.query(`select class_id as id, name from classes where school_id = $1 order by name, class_id`, [schoolId]),
    db.query(`select subject_id as id, name from subjects where school_id = $1 order by name, subject_id`, [schoolId]),
    db.query(`select user_id as id, display_name as name, is_active as active from users where school_id = $1 and role = 'teacher' order by display_name, user_id`, [schoolId]),
  ]);
  return { classes: classes.rows, subjects: subjects.rows, teachers: teachers.rows };
}

export type Constraints = {
  rules: Rules;
  loads: LoadRow[];
  unavailable: Unavailable[];
  // Who teaches which subject in which class, as Setup keeps it (teacher_subjects): offered first for a load.
  assigned: { classId: string; subjectId: string; teacherUserId: string }[];
};

export async function readConstraints(db: Sql, schoolId: string): Promise<Constraints> {
  const [loads, unavailable, assigned] = await Promise.all([
    db.query(`select class_id as "classId", subject_id as "subjectId", periods_per_week::int as periods, teacher_user_id as "teacherUserId" from timetable_loads where school_id = $1 order by class_id, subject_id`, [schoolId]),
    db.query(`select teacher_user_id as "teacherUserId", weekday::int as weekday, period::int as period from timetable_unavailable where school_id = $1 order by teacher_user_id, weekday, period nulls first`, [schoolId]),
    db.query(
      `select distinct ts.class_id as "classId", ts.subject_id as "subjectId", t.user_id as "teacherUserId"
         from teacher_subjects ts join teachers t on t.school_id = ts.school_id and t.teacher_id = ts.teacher_id
        where ts.school_id = $1 order by 1, 2, 3`,
      [schoolId]
    ),
  ]);
  return { rules: await generatorRules(db, schoolId), loads: loads.rows, unavailable: unavailable.rows, assigned: assigned.rows };
}

// ---- The constraints --------------------------------------------------------------------------------------------

export type LoadInput = { classId: string; subjectId: string; periods: number; teacherUserId: string };
export type LoadResult = { ok: true } | { ok: false; reason: 'unknown_class' | 'unknown_subject' | 'unknown_teacher' | 'bad_periods' };

export async function setLoad(db: Sql, actor: Actor, input: LoadInput): Promise<LoadResult> {
  if (!Number.isInteger(input.periods) || input.periods < 1 || input.periods > MAX_WEEK_PERIODS) return { ok: false, reason: 'bad_periods' };
  const known = (
    await db.query(
      `select exists (select 1 from classes where school_id = $1 and class_id = $2) as class,
              exists (select 1 from subjects where school_id = $1 and subject_id = $3) as subject,
              exists (select 1 from users where school_id = $1 and user_id = $4 and role = 'teacher' and is_active) as teacher`,
      [actor.schoolId, input.classId, input.subjectId, input.teacherUserId]
    )
  ).rows[0];
  if (!known.class) return { ok: false, reason: 'unknown_class' };
  if (!known.subject) return { ok: false, reason: 'unknown_subject' };
  if (!known.teacher) return { ok: false, reason: 'unknown_teacher' };
  const before = (await db.query(`select periods_per_week::int as periods, teacher_user_id as "teacherUserId" from timetable_loads where school_id = $1 and class_id = $2 and subject_id = $3`, [actor.schoolId, input.classId, input.subjectId])).rows[0] ?? null;
  await db.query(
    `insert into timetable_loads (school_id, class_id, subject_id, periods_per_week, teacher_user_id, updated_by) values ($1, $2, $3, $4, $5, $6)
     on conflict (school_id, class_id, subject_id) do update set periods_per_week = excluded.periods_per_week, teacher_user_id = excluded.teacher_user_id, updated_by = excluded.updated_by`,
    [actor.schoolId, input.classId, input.subjectId, input.periods, input.teacherUserId, actor.userId]
  );
  await writeAuditLog(db, {
    schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'timetable.plan.load_set', targetType: 'timetable_loads', targetId: input.classId,
    beforeState: before ? { periods: before.periods, teacherUserId: before.teacherUserId } : null,
    afterState: { classId: input.classId, subjectId: input.subjectId, periods: input.periods, teacherUserId: input.teacherUserId },
  });
  return { ok: true };
}

export async function removeLoad(db: Sql, actor: Actor, at: { classId: string; subjectId: string }): Promise<boolean> {
  const gone = await db.query(`delete from timetable_loads where school_id = $1 and class_id = $2 and subject_id = $3 returning periods_per_week::int as periods, teacher_user_id`, [actor.schoolId, at.classId, at.subjectId]);
  if (!gone.rows[0]) return false;
  await writeAuditLog(db, {
    schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'timetable.plan.load_removed', targetType: 'timetable_loads', targetId: at.classId,
    beforeState: { classId: at.classId, subjectId: at.subjectId, periods: gone.rows[0].periods, teacherUserId: gone.rows[0].teacher_user_id }, afterState: null,
  });
  return true;
}

export type UnavailableInput = { weekday: number; period: number | null };

// A teacher's unavailable periods, replaced as a set. A whole day takes the place of that day's single periods.
export async function setUnavailable(db: Sql, actor: Actor, teacherUserId: string, slots: readonly UnavailableInput[]): Promise<{ ok: true; periods: number } | { ok: false; reason: 'unknown_teacher' | 'bad_period' }> {
  if (slots.some((s) => !Number.isInteger(s.weekday) || s.weekday < 1 || s.weekday > 7 || (s.period !== null && (!Number.isInteger(s.period) || s.period < 1 || s.period > MAX_PERIODS)))) return { ok: false, reason: 'bad_period' };
  const teacher = (await db.query(`select 1 from users where school_id = $1 and user_id = $2 and role = 'teacher'`, [actor.schoolId, teacherUserId])).rows[0];
  if (!teacher) return { ok: false, reason: 'unknown_teacher' };
  const wholeDays = new Set(slots.filter((s) => s.period === null).map((s) => s.weekday));
  const kept = [...new Map(slots.filter((s) => s.period === null || !wholeDays.has(s.weekday)).map((s) => [`${s.weekday}:${s.period ?? 0}`, s])).values()];
  const before = (await db.query(`delete from timetable_unavailable where school_id = $1 and teacher_user_id = $2 returning 1`, [actor.schoolId, teacherUserId])).rows.length;
  if (kept.length)
    await db.query(
      `insert into timetable_unavailable (school_id, teacher_user_id, weekday, period, updated_by)
       select $1, $2, n.weekday, n.period, $3 from unnest($4::int[], $5::int[]) as n(weekday, period)`,
      [actor.schoolId, teacherUserId, actor.userId, kept.map((s) => s.weekday), kept.map((s) => s.period)]
    );
  await writeAuditLog(db, {
    schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'timetable.plan.unavailable_set', targetType: 'users', targetId: teacherUserId,
    beforeState: { periods: before }, afterState: { periods: kept.length, wholeDays: wholeDays.size },
  });
  return { ok: true, periods: kept.length };
}

// ---- The draft ----------------------------------------------------------------------------------------------------

type DraftRow = { proposal_id: string; days: number[]; periods: number; max_consecutive: number; class_ids: string[]; entries: Slot[]; unplaced: Unplaced[]; based_on: string; swaps: number; proposed_by: string; proposed_at: string };
const DRAFT_SELECT = `select proposal_id, days::int[] as days, periods::int as periods, max_consecutive::int as max_consecutive, class_ids::text[] as class_ids, entries, unplaced, based_on, swaps, proposed_by, proposed_at
                        from timetable_proposals`;

const fingerprint = async (db: Sql, schoolId: string): Promise<string> => (await db.query(`select md5(timetable_snapshot($1)::text) as f`, [schoolId])).rows[0].f as string;
const snapshot = async (db: Sql, schoolId: string): Promise<Slot[]> => (await db.query(`select timetable_snapshot($1) as s`, [schoolId])).rows[0].s as Slot[];
const openDraft = async (db: Sql, schoolId: string, lock = false): Promise<DraftRow | null> =>
  ((await db.query(`${DRAFT_SELECT} where school_id = $1 and state = 'draft'${lock ? ' for update' : ''}`, [schoolId])).rows[0] as DraftRow | undefined) ?? null;
// The school's rules now, around a draft: its own days and periods, the unavailable periods as they are today, and
// the periods of the classes it does not plan, which stay as they are.
async function rulesAround(db: Sql, schoolId: string, draft: DraftRow) {
  const [unavailable, current] = await Promise.all([readConstraints(db, schoolId).then((c) => c.unavailable), snapshot(db, schoolId)]);
  const planned = new Set(draft.class_ids);
  return { days: draft.days, periods: draft.periods, maxConsecutive: draft.max_consecutive, unavailable, fixed: current.filter((e) => !planned.has(e.classId)), current };
}

// The school day a draft was made for is no longer the school's: its working days, periods a day or most periods in
// a row were changed in Settings since.
async function rulesChanged(db: Sql, schoolId: string, draft: DraftRow): Promise<boolean> {
  const now = await generatorRules(db, schoolId);
  return now.periods !== draft.periods || now.maxConsecutive !== draft.max_consecutive || now.days.join() !== [...draft.days].sort((a, b) => a - b).join();
}

export type ProposeResult = { ok: true; proposalId: string; placed: number; notPlaced: number } | { ok: false; reason: 'nothing_to_plan' | 'no_working_days' };

// Runs the generator on the school's constraints and keeps its week as the school's draft, in place of any draft
// before it. Nothing is written to the timetable.
export async function propose(db: Sql, actor: Actor): Promise<ProposeResult> {
  await lockPlan(db, actor.schoolId);
  const constraints = await readConstraints(db, actor.schoolId);
  if (constraints.loads.length === 0) return { ok: false, reason: 'nothing_to_plan' };
  if (constraints.rules.days.length === 0) return { ok: false, reason: 'no_working_days' };
  const active = new Set(((await db.query(`select user_id from users where school_id = $1 and role = 'teacher' and is_active`, [actor.schoolId])).rows as { user_id: string }[]).map((r) => r.user_id));
  const current = await snapshot(db, actor.schoolId);
  const result = generateTimetable({
    ...constraints.rules,
    // A teacher no longer active teaches nothing: the load is said to have no teacher.
    loads: constraints.loads.map((l) => ({ ...l, teacherUserId: active.has(l.teacherUserId) ? l.teacherUserId : null })),
    unavailable: constraints.unavailable,
    fixed: current,
  });
  const classIds = [...new Set(constraints.loads.map((l) => l.classId))].sort();
  const replaced = await db.query(`update timetable_proposals set state = 'discarded', decided_by = $2 where school_id = $1 and state = 'draft' returning proposal_id`, [actor.schoolId, actor.userId]);
  const made = await db.query(
    `insert into timetable_proposals (school_id, days, periods, max_consecutive, class_ids, entries, unplaced, based_on, proposed_by)
     values ($1, $2::smallint[], $3, $4, $5::uuid[], $6::jsonb, $7::jsonb, md5(timetable_snapshot($1)::text), $8) returning proposal_id`,
    [actor.schoolId, constraints.rules.days, constraints.rules.periods, constraints.rules.maxConsecutive, classIds, JSON.stringify(result.entries), JSON.stringify(result.unplaced), actor.userId]
  );
  const proposalId = made.rows[0].proposal_id as string;
  const notPlaced = result.unplaced.reduce((n, u) => n + u.wanted - u.placed, 0);
  await writeAuditLog(db, {
    schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'timetable.plan.proposed', targetType: 'timetable_proposals', targetId: proposalId,
    beforeState: replaced.rows[0] ? { discardedProposalId: replaced.rows[0].proposal_id } : null,
    afterState: { classes: classIds.length, placed: result.entries.length, notPlaced, loadsShort: result.unplaced.length },
  });
  return { ok: true, proposalId, placed: result.entries.length, notPlaced };
}

// The periods a publish writes: those added or changed.
const written = (changes: readonly Change[]): Slot[] => changes.flatMap((c) => (c.kind === 'removed' ? [] : [c.after!]));

// What putEntry() asks of each period, asked once for all of them: the classes, subjects and teachers (active ones)
// that are not, or no longer, the school's.
async function goneFrom(db: Sql, schoolId: string, slots: readonly Slot[]): Promise<{ classes: string[]; subjects: string[]; teachers: string[] }> {
  if (slots.length === 0) return { classes: [], subjects: [], teachers: [] };
  const ids = (k: 'classId' | 'subjectId' | 'teacherUserId') => [...new Set(slots.map((s) => s[k]))].sort();
  const r = (
    await db.query(
      `select array(select x from unnest($2::uuid[]) as x where not exists (select 1 from classes c where c.school_id = $1 and c.class_id = x) order by x)::text[] as classes,
              array(select x from unnest($3::uuid[]) as x where not exists (select 1 from subjects s where s.school_id = $1 and s.subject_id = x) order by x)::text[] as subjects,
              array(select x from unnest($4::uuid[]) as x where not exists (select 1 from users u where u.school_id = $1 and u.user_id = x and u.role = 'teacher' and u.is_active) order by x)::text[] as teachers`,
      [schoolId, ids('classId'), ids('subjectId'), ids('teacherUserId')]
    )
  ).rows[0];
  return { classes: r.classes, subjects: r.subjects, teachers: r.teachers };
}

export type DraftView = {
  proposalId: string;
  proposedBy: string;
  proposedByName: string;
  proposedAt: string;
  rules: Rules;
  classIds: string[];
  entries: Slot[];
  unplaced: Unplaced[];
  swaps: number;
  // The timetable in force, for the classes beside it.
  current: Slot[];
  changes: Change[];
  // The timetable has changed since the draft was made: it can no longer be published.
  stale: boolean;
  // The school day (its days, periods a day or most periods in a row) has changed since: nor can it.
  rulesChanged: boolean;
  // What breaks a rule now (a teacher's unavailable periods changed since, say): publishing refuses it.
  problems: WeekProblem[];
  // The teachers of periods it would write who are no longer active (they left after it was made): nor can it.
  teachersGone: string[];
};

export async function draftView(db: Sql, schoolId: string): Promise<DraftView | null> {
  const draft = await openDraft(db, schoolId);
  if (!draft) return null;
  const around = await rulesAround(db, schoolId, draft);
  const planned = new Set(draft.class_ids);
  const by = (await db.query(`select display_name from users where school_id = $1 and user_id = $2`, [schoolId, draft.proposed_by])).rows[0];
  const changes = diffWeeks(around.current, draft.entries, draft.class_ids);
  return {
    proposalId: draft.proposal_id,
    proposedBy: draft.proposed_by,
    proposedByName: (by?.display_name as string | undefined) ?? '',
    proposedAt: new Date(draft.proposed_at).toISOString(),
    rules: { days: draft.days, periods: draft.periods, maxConsecutive: draft.max_consecutive },
    classIds: draft.class_ids,
    entries: draft.entries,
    unplaced: draft.unplaced,
    swaps: draft.swaps,
    current: around.current.filter((e) => planned.has(e.classId)),
    changes,
    stale: (await fingerprint(db, schoolId)) !== draft.based_on,
    rulesChanged: await rulesChanged(db, schoolId, draft),
    problems: weekProblems(draft.entries, around),
    teachersGone: (await goneFrom(db, schoolId, written(changes))).teachers,
  };
}

type At = { weekday: number; period: number };
export type SwapDraftResult = { ok: true } | { ok: false; reason: 'not_found' | 'outside_week' | 'same_slot' | 'nothing_to_move' | 'teacher_clash' | 'unavailable' | 'consecutive_limit'; with?: Slot };

export async function swapInDraft(db: Sql, actor: Actor, proposalId: string, classId: string, a: At, b: At): Promise<SwapDraftResult> {
  await lockPlan(db, actor.schoolId);
  const draft = await openDraft(db, actor.schoolId, true);
  if (!draft || draft.proposal_id !== proposalId || !draft.class_ids.includes(classId)) return { ok: false, reason: 'not_found' };
  const result = swapInWeek(draft.entries, classId, a, b, await rulesAround(db, actor.schoolId, draft));
  if (!result.ok) return result;
  await db.query(`update timetable_proposals set entries = $3::jsonb, swaps = swaps + 1 where school_id = $1 and proposal_id = $2 and state = 'draft'`, [actor.schoolId, proposalId, JSON.stringify(result.entries)]);
  await writeAuditLog(db, {
    schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'timetable.plan.swapped', targetType: 'timetable_proposals', targetId: proposalId,
    afterState: { classId, from: { weekday: a.weekday, period: a.period }, to: { weekday: b.weekday, period: b.period } },
  });
  return { ok: true };
}

export type PublishResult =
  | { ok: true; versionId: string; added: number; removed: number; changed: number }
  | { ok: false; reason: 'not_found' | 'missing_not_accepted' | 'timetable_changed' | 'rules_changed' | 'week_problem'; problems?: WeekProblem[] }
  | { ok: false; reason: 'teacher_clash'; clash: Entry }
  | { ok: false; reason: 'unknown_class' | 'unknown_subject' | 'unknown_teacher' };

// A person publishes the draft, in one transaction: if any period is refused, nothing of the draft is in the
// timetable and the answer says which rule refused it. A draft that could not place every period is published only
// when the person says so (`withMissing`).
export async function publishDraft(db: Sql, actor: Actor, proposalId: string, opts: { withMissing: boolean }): Promise<PublishResult> {
  await lockPlan(db, actor.schoolId);
  const draft = await openDraft(db, actor.schoolId, true);
  if (!draft || draft.proposal_id !== proposalId) return { ok: false, reason: 'not_found' };
  if (draft.unplaced.length > 0 && !opts.withMissing) return { ok: false, reason: 'missing_not_accepted' };
  if ((await fingerprint(db, actor.schoolId)) !== draft.based_on) return { ok: false, reason: 'timetable_changed' };
  if (await rulesChanged(db, actor.schoolId, draft)) return { ok: false, reason: 'rules_changed' };
  const around = await rulesAround(db, actor.schoolId, draft);
  const problems = weekProblems(draft.entries, around);
  if (problems.length) return { ok: false, reason: 'week_problem', problems };

  // Its periods are inside the school day: rulesChanged() and weekProblems() (outside_week) have asked that.
  const changes = diffWeeks(around.current, draft.entries, draft.class_ids);
  const puts = written(changes);
  const clears = changes.filter((c) => c.kind !== 'added');
  const gone = await goneFrom(db, actor.schoolId, puts);
  if (gone.classes.length) return { ok: false, reason: 'unknown_class' };
  if (gone.subjects.length) return { ok: false, reason: 'unknown_subject' };
  if (gone.teachers.length) return { ok: false, reason: 'unknown_teacher' };

  const of = (k: 'classId' | 'subjectId' | 'teacherUserId' | 'weekday' | 'period', xs: readonly { classId: string; weekday: number; period: number; subjectId?: string; teacherUserId?: string }[]) => xs.map((x) => x[k]);
  await db.query('savepoint timetable_publish');
  try {
    // Emptied first, then filled: a teacher who moves between two classes in one period never meets themselves.
    const cleared = clears.length
      ? (
          await db.query(
            `delete from timetable_entries e using unnest($2::uuid[], $3::int[], $4::int[]) as n(class_id, weekday, period)
              where e.school_id = $1 and e.class_id = n.class_id and e.weekday = n.weekday and e.period = n.period
             returning e.entry_id, e.class_id, e.weekday::int as weekday, e.period::int as period, e.subject_id, e.teacher_user_id`,
            [actor.schoolId, of('classId', clears), of('weekday', clears), of('period', clears)]
          )
        ).rows
      : [];
    // putEntry()'s clash guard, for every period at once: the teacher already teaching another class then.
    const clash = puts.length
      ? ((
          await db.query(
            `${ENTRY_SELECT}
               join unnest($2::uuid[], $3::int[], $4::int[], $5::uuid[]) as n(teacher_user_id, weekday, period, class_id)
                 on e.teacher_user_id = n.teacher_user_id and e.weekday = n.weekday and e.period = n.period and e.class_id <> n.class_id
              where e.school_id = $1 order by e.weekday, e.period, e.entry_id limit 1`,
            [actor.schoolId, of('teacherUserId', puts), of('weekday', puts), of('period', puts), of('classId', puts)]
          )
        ).rows[0] as Entry | undefined)
      : undefined;
    if (clash) {
      await db.query('rollback to savepoint timetable_publish');
      return { ok: false, reason: 'teacher_clash', clash };
    }
    const made = puts.length
      ? (
          await db.query(
            `insert into timetable_entries (school_id, class_id, weekday, period, subject_id, teacher_user_id)
             select $1, n.class_id, n.weekday, n.period, n.subject_id, n.teacher_user_id
               from unnest($2::uuid[], $3::int[], $4::int[], $5::uuid[], $6::uuid[]) as n(class_id, weekday, period, subject_id, teacher_user_id)
             returning entry_id, class_id, weekday::int as weekday, period::int as period, subject_id, teacher_user_id`,
            [actor.schoolId, of('classId', puts), of('weekday', puts), of('period', puts), of('subjectId', puts), of('teacherUserId', puts)]
          )
        ).rows
      : [];
    // One audit row for each period, as clearEntry() and putEntry() write them: ids only.
    await writeAuditLogs(
      db,
      cleared.map((r) => ({
        schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'timetable.clear', targetType: 'timetable_entries', targetId: r.entry_id,
        beforeState: { classId: r.class_id, weekday: r.weekday, period: r.period, subjectId: r.subject_id, teacherUserId: r.teacher_user_id }, afterState: null,
      }))
    );
    await writeAuditLogs(
      db,
      made.map((r) => ({
        schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'timetable.set', targetType: 'timetable_entries', targetId: r.entry_id,
        beforeState: null, afterState: { classId: r.class_id, weekday: r.weekday, period: r.period, subjectId: r.subject_id, teacherUserId: r.teacher_user_id },
      }))
    );
    const version = (
      await db.query(
        `insert into timetable_versions (school_id, proposal_id, class_ids, before_entries, published_by) values ($1, $2, $3::uuid[], $4::jsonb, $5) returning version_id, added, removed, changed`,
        [actor.schoolId, proposalId, draft.class_ids, JSON.stringify(around.current), actor.userId]
      )
    ).rows[0];
    await db.query(`update timetable_proposals set state = 'published', decided_by = $3 where school_id = $1 and proposal_id = $2`, [actor.schoolId, proposalId, actor.userId]);
    await writeAuditLog(db, {
      schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'timetable.plan.published', targetType: 'timetable_versions', targetId: version.version_id,
      afterState: { proposalId, classes: draft.class_ids.length, added: version.added, removed: version.removed, changed: version.changed, withMissing: draft.unplaced.length > 0 },
    });
    await db.query('release savepoint timetable_publish');
    return { ok: true, versionId: version.version_id, added: version.added, removed: version.removed, changed: version.changed };
  } catch (err) {
    await db.query('rollback to savepoint timetable_publish');
    // The database's own guards: a period filled at the same moment (a unique constraint), or the classes no longer
    // holding exactly the proposal when it is marked published (the publish trigger). Either way the timetable
    // changed under it.
    const e = err as { code?: string; message?: string };
    if (e.code === '23505' || (e.code === '23514' && /exactly what its classes hold/.test(e.message ?? ''))) return { ok: false, reason: 'timetable_changed' };
    throw err;
  }
}

export async function discardDraft(db: Sql, actor: Actor, proposalId: string): Promise<boolean> {
  await lockPlan(db, actor.schoolId);
  const gone = await db.query(`update timetable_proposals set state = 'discarded', decided_by = $3 where school_id = $1 and proposal_id = $2 and state = 'draft' returning 1`, [actor.schoolId, proposalId, actor.userId]);
  if (!gone.rows[0]) return false;
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'timetable.plan.discarded', targetType: 'timetable_proposals', targetId: proposalId, afterState: { discarded: true } });
  return true;
}

// ---- Change history -----------------------------------------------------------------------------------------------

export type VersionLine = { versionId: string; publishedAt: string; publishedBy: string; publishedByName: string; classes: number; added: number; removed: number; changed: number };
export const HISTORY_MAX = 50;

export async function history(db: Sql, schoolId: string, limit: number = HISTORY_MAX): Promise<VersionLine[]> {
  const { rows } = await db.query(
    `select v.version_id, v.published_at, v.published_by, u.display_name, cardinality(v.class_ids) as classes, v.added, v.removed, v.changed
       from timetable_versions v join users u on u.school_id = v.school_id and u.user_id = v.published_by
      where v.school_id = $1 order by v.published_at desc, v.version_id limit $2`,
    [schoolId, limit]
  );
  return rows.map((r) => ({ versionId: r.version_id, publishedAt: new Date(r.published_at).toISOString(), publishedBy: r.published_by, publishedByName: r.display_name, classes: Number(r.classes), added: r.added, removed: r.removed, changed: r.changed }));
}

export type VersionDetail = VersionLine & { classIds: string[]; before: Slot[]; after: Slot[]; changes: Change[] };

// One publish read back: the whole timetable before it and after it, and what it changed.
export async function versionDetail(db: Sql, schoolId: string, versionId: string): Promise<VersionDetail | null> {
  const { rows } = await db.query(
    `select v.version_id, v.published_at, v.published_by, u.display_name, v.class_ids::text[] as class_ids, v.before_entries, v.after_entries, v.added, v.removed, v.changed
       from timetable_versions v join users u on u.school_id = v.school_id and u.user_id = v.published_by
      where v.school_id = $1 and v.version_id = $2`,
    [schoolId, versionId]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    versionId: r.version_id, publishedAt: new Date(r.published_at).toISOString(), publishedBy: r.published_by, publishedByName: r.display_name, classes: r.class_ids.length,
    added: r.added, removed: r.removed, changed: r.changed, classIds: r.class_ids, before: r.before_entries, after: r.after_entries, changes: diffWeeks(r.before_entries, r.after_entries, r.class_ids),
  };
}

// For My Day: is a proposed timetable waiting for a person to review it?
export async function draftsWaiting(db: Sql, schoolId: string): Promise<number> {
  const { rows } = await db.query(`select count(*)::int as n from timetable_proposals where school_id = $1 and state = 'draft'`, [schoolId]);
  return rows[0]?.n ?? 0;
}
