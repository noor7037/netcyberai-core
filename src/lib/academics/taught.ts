import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { prepareDraft } from '@/lib/pulse/drafts';
import type { SyllabusInput } from './syllabus';
import { classOrderSql } from '@/lib/classes/class-order';

// One tap "taught today" (D5, docs/20 5d, C147). The tap writes the
// classwork log (one row per class, subject and day in syllabus_progress),
// prepares that lesson's Pulse draft, and counts once for the "taught tap"
// measurement. A second tap for the same class, subject and day changes the
// same row and the same draft; it never adds another.
//
// Every function runs in the caller's own tenant transaction. RLS decides
// what a teacher may record (teacher_scope_syllabus_progress: their own
// class and subject pairs) and see.

export const MAX_NOTE = 500;
export const MAX_UNITS_PER_ADD = 200;

export type Unit = { unit_id: string; class_id: string; subject_id: string; position: number; chapter: string; topic: string; taught: boolean };
export type TaughtInput = SyllabusInput & { unitId: string | null; note: string | null };
export type Actor = { schoolId: string; userId: string; role: StaffRole };

export type TaughtResult =
  | { kind: 'ok'; created: boolean; entry: { progress_id: string; date: string; topic: string; status: string; class_id: string; subject_id: string; teacher_id: string; unit_id: string | null; note: string | null }; pulseId: string | null }
  | { kind: 'no_teacher_profile' }
  | { kind: 'unknown_unit' };

export async function recordTaught(db: PoolClient, actor: Actor, input: TaughtInput): Promise<TaughtResult> {
  // A teacher always records as themselves; the id is never taken from the request for this role.
  let teacherId = input.teacherId;
  if (actor.role === 'teacher') {
    const { rows } = await db.query(`select teacher_id from teachers where school_id = $1 and user_id = $2`, [actor.schoolId, actor.userId]);
    if (!rows[0]) return { kind: 'no_teacher_profile' };
    teacherId = rows[0].teacher_id;
  }
  if (input.unitId) {
    const unit = await db.query(`select 1 from syllabus_units where school_id = $1 and unit_id = $2 and class_id = $3 and subject_id = $4`, [actor.schoolId, input.unitId, input.classId, input.subjectId]);
    if (!unit.rows[0]) return { kind: 'unknown_unit' };
  }

  const { rows: before } = await db.query(
    `select progress_id, topic, status, teacher_id, unit_id, note from syllabus_progress where school_id = $1 and class_id = $2 and subject_id = $3 and date = $4`,
    [actor.schoolId, input.classId, input.subjectId, input.date]
  );
  const { rows } = await db.query(
    `insert into syllabus_progress (school_id, teacher_id, class_id, subject_id, topic, status, date, unit_id, note)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (school_id, class_id, subject_id, date)
     do update set topic = excluded.topic, status = excluded.status, teacher_id = excluded.teacher_id, unit_id = excluded.unit_id, note = excluded.note
     returning progress_id, date::text as date, topic, status, class_id, subject_id, teacher_id, unit_id, note`,
    [actor.schoolId, teacherId, input.classId, input.subjectId, input.topic, input.status, input.date, input.unitId, input.note]
  );
  if (!rows[0]) throw new Error('syllabus upsert affected no rows');
  const entry = rows[0];

  // The lesson's Pulse draft: one per log row, in three languages, with the
  // day's homework (src/lib/pulse/drafts.ts). A lesson not taught has none.
  const pulseId = await prepareDraft(db, actor, entry.progress_id);

  // Measured once per lesson, on the first tap: class and day, nobody's name.
  if (!before[0]) await db.query(`insert into usage_events (school_id, kind, class_id, day, value) values ($1, 'taught.tap', $2, $3, 1)`, [actor.schoolId, input.classId, input.date]);

  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: before[0] ? 'syllabus.update' : 'syllabus.record',
    targetType: 'syllabus_progress',
    targetId: entry.progress_id,
    // The lesson's ids, day and state; never the topic's or the note's words (C224).
    beforeState: before[0] ? { status: before[0].status, unitId: before[0].unit_id, noted: before[0].note !== null } : undefined,
    afterState: { date: entry.date, classId: entry.class_id, subjectId: entry.subject_id, teacherId: entry.teacher_id, status: entry.status, unitId: entry.unit_id, noted: entry.note !== null },
  });
  return { kind: 'ok', created: !before[0], entry, pulseId };
}

// ---- The syllabus map -------------------------------------------------

// The units of the given class and subject pairs, in order, each with
// whether it has been taught (a log row for it with status "taught").
export async function unitsFor(db: PoolClient, schoolId: string, pairs: readonly { class_id: string; subject_id: string }[]): Promise<Unit[]> {
  if (pairs.length === 0) return [];
  const { rows } = await db.query(
    `select u.unit_id, u.class_id, u.subject_id, u.position, u.chapter, u.topic,
            exists (select 1 from syllabus_progress p where p.school_id = u.school_id and p.unit_id = u.unit_id and p.status = 'taught') as taught
       from syllabus_units u
       join unnest($2::uuid[], $3::uuid[]) as want(class_id, subject_id) on want.class_id = u.class_id and want.subject_id = u.subject_id
      where u.school_id = $1
      order by u.class_id, u.subject_id, u.position, u.created_at`,
    [schoolId, pairs.map((p) => p.class_id), pairs.map((p) => p.subject_id)]
  );
  return rows;
}

// Coverage is taught units over planned units.
export function coverage(units: readonly Pick<Unit, 'taught'>[]): { planned: number; taught: number; percent: number | null } {
  const planned = units.length;
  const taught = units.filter((u) => u.taught).length;
  return { planned, taught, percent: planned === 0 ? null : Math.round((taught / planned) * 100) };
}

// "Chapter | Topic" per line; a line with no bar is a topic under the last chapter named.
export function parseUnitLines(text: string): { chapter: string; topic: string }[] {
  const out: { chapter: string; topic: string }[] = [];
  let chapter = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/\s+/g, ' ');
    if (!line) continue;
    const bar = line.indexOf('|');
    const topic = (bar === -1 ? line : line.slice(bar + 1)).trim();
    if (bar !== -1) chapter = line.slice(0, bar).trim() || chapter;
    if (!topic) continue;
    out.push({ chapter: (chapter || topic).slice(0, 120), topic: topic.slice(0, 200) });
  }
  return out;
}

export async function addUnits(db: PoolClient, actor: Actor, at: { classId: string; subjectId: string }, lines: readonly { chapter: string; topic: string }[]): Promise<number> {
  const clean = lines.slice(0, MAX_UNITS_PER_ADD);
  if (clean.length === 0) return 0;
  const last = (await db.query(`select coalesce(max(position), 0)::int as n from syllabus_units where school_id = $1 and class_id = $2 and subject_id = $3`, [actor.schoolId, at.classId, at.subjectId])).rows[0].n as number;
  await db.query(
    `insert into syllabus_units (school_id, class_id, subject_id, position, chapter, topic, created_by)
     select $1, $2, $3, $4 + n.ord, n.chapter, n.topic, $5
       from unnest($6::text[], $7::text[]) with ordinality as n(chapter, topic, ord)`,
    [actor.schoolId, at.classId, at.subjectId, last, actor.userId, clean.map((l) => l.chapter), clean.map((l) => l.topic)]
  );
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'syllabus.units_added', targetType: 'syllabus_units', beforeState: undefined, afterState: { classId: at.classId, subjectId: at.subjectId, added: clean.length } });
  return clean.length;
}

// A unit already used by a lesson stays: the log refers to it.
export async function removeUnit(db: PoolClient, actor: Actor, unitId: string): Promise<'removed' | 'in_use' | 'not_found'> {
  const used = await db.query(`select 1 from syllabus_progress where school_id = $1 and unit_id = $2 limit 1`, [actor.schoolId, unitId]);
  if (used.rows[0]) return 'in_use';
  const gone = await db.query(`delete from syllabus_units where school_id = $1 and unit_id = $2 returning class_id, subject_id, chapter, topic`, [actor.schoolId, unitId]);
  if (!gone.rows[0]) return 'not_found';
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'syllabus.unit_removed', targetType: 'syllabus_units', targetId: unitId, beforeState: { classId: gone.rows[0].class_id, subjectId: gone.rows[0].subject_id }, afterState: undefined }); // never the words (C224)
  return 'removed';
}

// "Taught" tap coverage (17 §3b): for each class and day, the lessons on the
// timetable (a class and subject scheduled that weekday) and how many of
// them have a taught-today mark, whatever the mark says.
export type TapCoverage = { class_id: string; class_name: string; day: string; scheduled: number; marked: number };
export async function taughtTapCoverage(db: PoolClient, schoolId: string, from: string, to: string): Promise<TapCoverage[]> {
  const { rows } = await db.query(
    `select c.class_id, c.name as class_name, d.day::text as day,
            count(distinct e.subject_id)::int as scheduled, count(distinct p.subject_id)::int as marked
       from (select generate_series($2::date, $3::date, interval '1 day')::date as day) d
       join timetable_entries e on e.school_id = $1 and e.weekday = extract(isodow from d.day)::int
       join classes c on c.school_id = e.school_id and c.class_id = e.class_id
       left join syllabus_progress p on p.school_id = e.school_id and p.class_id = e.class_id and p.subject_id = e.subject_id and p.date = d.day
      group by c.class_id, c.name, d.day
      order by d.day, ${classOrderSql('c')}, c.class_id`,
    [schoolId, from, to]
  );
  return rows;
}
