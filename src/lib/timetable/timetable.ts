import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { readSettings } from '@/lib/frameworks/settings-store';
import { INDIA_TODAY_SQL } from '@/lib/time/india';
import { activeAssignments, assignedTeachers } from '@/lib/academics/teacher-subjects';
import { assignedMap, lookupKey, notAssigned, notAssignedIn, parseTimetableCsv, periodsFromSetting, planImport, type ImportProblem, type Slot } from './plan';
import { classOrderSql } from '@/lib/classes/class-order';

// The timetable in the database (docs/20 5c, C145). Every function runs in
// the caller's own tenant transaction; RLS decides who reads what (a
// teacher: their own periods and their own classes') and that only the
// office writes.

export type Entry = {
  entry_id: string;
  class_id: string;
  class_name: string;
  weekday: number;
  period: number;
  subject_id: string;
  subject_name: string;
  teacher_user_id: string;
  teacher_name: string;
};

export const ENTRY_SELECT = `select e.entry_id, e.class_id, c.name as class_name, e.weekday::int as weekday, e.period::int as period,
         e.subject_id, s.name as subject_name, e.teacher_user_id, u.display_name as teacher_name
    from timetable_entries e
    join classes c on c.school_id = e.school_id and c.class_id = e.class_id
    join subjects s on s.school_id = e.school_id and s.subject_id = e.subject_id
    join users u on u.school_id = e.school_id and u.user_id = e.teacher_user_id`;

export async function periodsPerDay(db: PoolClient, schoolId: string): Promise<number> {
  const schema = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'timetable');
  if (!schema) return periodsFromSetting(undefined);
  return periodsFromSetting((await readSettings(db, schoolId, schema)).effective.periods_per_day);
}

export async function entriesForClass(db: PoolClient, schoolId: string, classId: string): Promise<Entry[]> {
  return (await db.query(`${ENTRY_SELECT} where e.school_id = $1 and e.class_id = $2 order by e.weekday, e.period`, [schoolId, classId])).rows;
}

export async function entriesForTeacher(db: PoolClient, schoolId: string, userId: string): Promise<Entry[]> {
  return (await db.query(`${ENTRY_SELECT} where e.school_id = $1 and e.teacher_user_id = $2 order by e.weekday, e.period`, [schoolId, userId])).rows;
}

// Today's periods of one teacher, in order (the day is India's).
export async function periodsToday(db: { query: PoolClient['query'] }, schoolId: string, userId: string): Promise<Entry[]> {
  return (await db.query(`${ENTRY_SELECT} where e.school_id = $1 and e.teacher_user_id = $2 and e.weekday = extract(isodow from ${INDIA_TODAY_SQL})::int order by e.period`, [schoolId, userId])).rows;
}

// What the office chooses from when filling a period.
export async function timetableChoices(db: PoolClient, schoolId: string) {
  const [classes, subjects, teachers] = await Promise.all([
    db.query(`select class_id, name from classes where school_id = $1 order by ${classOrderSql('')}, class_id`, [schoolId]),
    db.query(`select subject_id, name from subjects where school_id = $1 order by name`, [schoolId]),
    db.query(`select user_id, display_name as name, email from users where school_id = $1 and role = 'teacher' and is_active order by display_name`, [schoolId]),
  ]);
  return { classes: classes.rows as { class_id: string; name: string }[], subjects: subjects.rows as { subject_id: string; name: string }[], teachers: teachers.rows as { user_id: string; name: string; email: string | null }[] };
}

type Actor = { schoolId: string; userId: string; role: StaffRole };

// The database's own guard of who teaches what (C243, the trigger timetable_entries_assigned_teacher): a period of a
// class and subject with assigned teachers takes one of them. The app checks first; this answers the moment between
// (Setup changed by someone else after the check) with the app's own reason, 'not_assigned'.
export function isNotAssignedRefusal(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  return e?.code === '23514' && /one of the teachers assigned to its class and subject/.test(e.message ?? '');
}

// The timetable generator's lock (C229): it proposes, swaps and publishes holding it alone, so a period filled or
// emptied here, which holds it shared, waits for a publish to end, and a publish waits for this to end. A publish
// then sees the timetable exactly as it checked it.
export const planLockKey = (schoolId: string) => `timetable-plan:${schoolId}`;
const sharePlanLock = (db: Pick<PoolClient, 'query'>, schoolId: string) => db.query(`select pg_advisory_xact_lock_shared(hashtext($1))`, [planLockKey(schoolId)]);

export type PutResult =
  | { ok: true; entry: Entry }
  | { ok: false; reason: 'teacher_clash'; clash: Entry }
  | { ok: false; reason: 'unknown_class' | 'unknown_subject' | 'unknown_teacher' | 'bad_period' | 'not_assigned' };

// Fills one period of one class. A teacher already teaching another class at
// that time is refused, and the answer names that entry. When Setup assigns
// the class's subject to teachers (teacher_subjects, C231), a teacher who is
// not one of them is refused too ('not_assigned'); with no assignment for that
// class and subject, any active teacher may take it, as before.
export async function putEntry(db: PoolClient, actor: Actor, slot: Slot): Promise<PutResult> {
  if (slot.period > (await periodsPerDay(db, actor.schoolId))) return { ok: false, reason: 'bad_period' };
  const known = (await db.query(
    `select exists (select 1 from classes where school_id = $1 and class_id = $2) as class,
            exists (select 1 from subjects where school_id = $1 and subject_id = $3) as subject,
            exists (select 1 from users where school_id = $1 and user_id = $4 and role = 'teacher' and is_active) as teacher`,
    [actor.schoolId, slot.classId, slot.subjectId, slot.teacherUserId]
  )).rows[0];
  if (!known.class) return { ok: false, reason: 'unknown_class' };
  if (!known.subject) return { ok: false, reason: 'unknown_subject' };
  if (!known.teacher) return { ok: false, reason: 'unknown_teacher' };

  await sharePlanLock(db, actor.schoolId);
  // Held until this transaction ends: two people filling the same teacher's
  // slot at the same moment are taken one after the other.
  await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`timetable:${actor.schoolId}:${slot.teacherUserId}:${slot.weekday}:${slot.period}`]);
  const clash = (await db.query(`${ENTRY_SELECT} where e.school_id = $1 and e.teacher_user_id = $2 and e.weekday = $3 and e.period = $4 and e.class_id <> $5`, [actor.schoolId, slot.teacherUserId, slot.weekday, slot.period, slot.classId])).rows[0] as Entry | undefined;
  if (clash) return { ok: false, reason: 'teacher_clash', clash };
  if (notAssigned(await assignedTeachers(db, actor.schoolId, slot.classId, slot.subjectId), slot.teacherUserId)) return { ok: false, reason: 'not_assigned' };

  const before = (await db.query(`select subject_id, teacher_user_id from timetable_entries where school_id = $1 and class_id = $2 and weekday = $3 and period = $4`, [actor.schoolId, slot.classId, slot.weekday, slot.period])).rows[0] ?? null;
  await db.query('savepoint timetable_put');
  let entryId: string;
  try {
    const saved = await db.query(
      `insert into timetable_entries (school_id, class_id, weekday, period, subject_id, teacher_user_id)
       values ($1, $2, $3, $4, $5, $6)
       on conflict on constraint timetable_class_slot do update set subject_id = excluded.subject_id, teacher_user_id = excluded.teacher_user_id, updated_at = now()
       returning entry_id`,
      [actor.schoolId, slot.classId, slot.weekday, slot.period, slot.subjectId, slot.teacherUserId]
    );
    entryId = saved.rows[0].entry_id as string;
    await db.query('release savepoint timetable_put');
  } catch (err) {
    await db.query('rollback to savepoint timetable_put');
    if (isNotAssignedRefusal(err)) return { ok: false, reason: 'not_assigned' };
    throw err;
  }
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'timetable.set', targetType: 'timetable_entries', targetId: entryId, beforeState: before, afterState: { classId: slot.classId, weekday: slot.weekday, period: slot.period, subjectId: slot.subjectId, teacherUserId: slot.teacherUserId } });
  const entry = (await db.query(`${ENTRY_SELECT} where e.school_id = $1 and e.entry_id = $2`, [actor.schoolId, entryId])).rows[0] as Entry;
  return { ok: true, entry };
}

export async function clearEntry(db: PoolClient, actor: Actor, at: { classId: string; weekday: number; period: number }): Promise<boolean> {
  await sharePlanLock(db, actor.schoolId);
  const gone = await db.query(`delete from timetable_entries where school_id = $1 and class_id = $2 and weekday = $3 and period = $4 returning entry_id, subject_id, teacher_user_id`, [actor.schoolId, at.classId, at.weekday, at.period]);
  if (!gone.rows[0]) return false;
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'timetable.clear', targetType: 'timetable_entries', targetId: gone.rows[0].entry_id, beforeState: { ...at, subjectId: gone.rows[0].subject_id, teacherUserId: gone.rows[0].teacher_user_id }, afterState: null });
  return true;
}

export type ImportResult = { ok: true; imported: number } | { ok: false; problems: ImportProblem[] };

// A CSV of periods (class,day,period,subject,teacher). With any problem,
// a clash included, nothing is imported and every problem is listed.
export async function importTimetable(db: PoolClient, actor: Actor, csv: string): Promise<ImportResult> {
  const parsed = parseTimetableCsv(csv);
  if (parsed.problems.some((p) => p.code === 'header')) return { ok: false, problems: parsed.problems };
  await sharePlanLock(db, actor.schoolId);
  const choices = await timetableChoices(db, actor.schoolId);
  const existing = (await db.query(`select class_id as "classId", weekday::int as weekday, period::int as period, subject_id as "subjectId", teacher_user_id as "teacherUserId" from timetable_entries where school_id = $1`, [actor.schoolId])).rows as Slot[];
  const plan = planImport(
    existing,
    parsed.rows,
    {
      classes: new Map(choices.classes.map((c) => [lookupKey(c.name), c.class_id])),
      subjects: new Map(choices.subjects.map((s) => [lookupKey(s.name), s.subject_id])),
      teachers: new Map(choices.teachers.filter((t) => t.email).map((t) => [lookupKey(t.email!), t.user_id])),
    },
    await periodsPerDay(db, actor.schoolId),
    assignedMap(await activeAssignments(db, actor.schoolId))
  );
  const problems = [...parsed.problems, ...(plan.ok ? [] : plan.problems)].sort((a, b) => a.line - b.line);
  if (!plan.ok || problems.length) return { ok: false, problems };
  if (plan.slots.length === 0) return { ok: true, imported: 0 };

  // The lines' own class slots are emptied first, then filled: a teacher
  // swapped between two classes in one file never trips the unique constraint.
  await db.query('savepoint timetable_import');
  try {
    await db.query(
      `delete from timetable_entries e using unnest($2::uuid[], $3::int[], $4::int[]) as n(class_id, weekday, period)
        where e.school_id = $1 and e.class_id = n.class_id and e.weekday = n.weekday and e.period = n.period`,
      [actor.schoolId, plan.slots.map((s) => s.classId), plan.slots.map((s) => s.weekday), plan.slots.map((s) => s.period)]
    );
    await db.query(
      `insert into timetable_entries (school_id, class_id, weekday, period, subject_id, teacher_user_id)
       select $1, n.class_id, n.weekday, n.period, n.subject_id, n.teacher_user_id
         from unnest($2::uuid[], $3::int[], $4::int[], $5::uuid[], $6::uuid[]) as n(class_id, weekday, period, subject_id, teacher_user_id)`,
      [actor.schoolId, plan.slots.map((s) => s.classId), plan.slots.map((s) => s.weekday), plan.slots.map((s) => s.period), plan.slots.map((s) => s.subjectId), plan.slots.map((s) => s.teacherUserId)]
    );
    await db.query('release savepoint timetable_import');
  } catch (err) {
    await db.query('rollback to savepoint timetable_import');
    if (!isNotAssignedRefusal(err)) throw err;
    // Setup changed who teaches what between the check and the write (C243): nothing is imported, and the lines the
    // database refused are named by the same rule, as the check names them.
    const now = assignedMap(await activeAssignments(db, actor.schoolId));
    const teacherOf = new Map(parsed.rows.map((r) => [r.line, r.teacher]));
    const refused = plan.slots.filter((s) => notAssignedIn(now, s)).map((s): ImportProblem => ({ line: s.line, code: 'not_assigned', value: teacherOf.get(s.line) }));
    if (!refused.length) throw err;
    return { ok: false, problems: refused };
  }
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'timetable.import', targetType: 'timetable_entries', beforeState: null, afterState: { periods: plan.slots.length } });
  return { ok: true, imported: plan.slots.length };
}

// ---- Teacher workload (C231) -------------------------------------------------------------------------------------

export type WorkloadLine = { teacherUserId: string; name: string; active: boolean; periods: number };

// Periods a week per teacher, counted from the published timetable (timetable_entries): only the periods inside the
// school's week (its working days and its periods a day), the ones a teacher actually teaches; a period left from
// before the setting was lowered is not taught, as the generator counts it (review of C229). The most loaded first,
// then by name. Every active teacher is listed, with 0 when they have no period; a teacher no longer active is listed
// only while the timetable still gives them periods. `teacherUserId`: one teacher's own line only.
export async function teacherWorkload(db: Pick<PoolClient, 'query'>, schoolId: string, opts: { days: readonly number[]; periods: number; teacherUserId?: string }): Promise<WorkloadLine[]> {
  const { rows } = await db.query(
    `select u.user_id, u.display_name, u.is_active, count(e.entry_id)::int as periods
       from users u
       left join timetable_entries e on e.school_id = u.school_id and e.teacher_user_id = u.user_id and e.weekday = any ($2::int[]) and e.period <= $3
      where u.school_id = $1 and u.role = 'teacher' and ($4::uuid is null or u.user_id = $4)
      group by u.user_id, u.display_name, u.is_active
     having u.is_active or count(e.entry_id) > 0
      order by count(e.entry_id) desc, u.display_name, u.user_id`,
    [schoolId, [...opts.days], opts.periods, opts.teacherUserId ?? null]
  );
  return rows.map((r) => ({ teacherUserId: r.user_id, name: r.display_name, active: r.is_active, periods: r.periods }));
}
