import type { PoolClient } from 'pg';
import type { StaffRole } from '@/lib/auth/types';
import { writeAuditLog } from '@/lib/audit/log';
import { assertRowsAffected } from '@/lib/db/rows';

// 04_SYSTEM_DESIGN_PRD.md Sec3.2's own state machine:
//   Capture -> same-day correction window (10 min, no note) ->
//   correction with mandatory audit note -> Period Lock (immutable).
// "Period Lock" is never given an exact trigger anywhere in the PRD
// (no term/semester concept exists in this schema); the only clean,
// defensible reading that doesn't invent a new "period" concept is
// calendar-day: today's attendance can still be corrected (freely for
// the first 10 minutes, with a mandatory note after), but a row for
// any earlier date is immutable outright. Recorded as a design decision
// in the Decision Log, not silently assumed.
export const ATTENDANCE_STATUSES = ['present', 'absent', 'late'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const FREE_EDIT_WINDOW_MINUTES = 10;

export class PeriodLockedError extends Error {}
export class CorrectionNoteRequiredError extends Error {}
export class AttendanceNotFoundError extends Error {}

export interface AttendanceRosterRow {
  student_id: string;
  name: string;
  admission_no: string;
  attendance_id: string | null;
  status: AttendanceStatus | null;
  marked_by: string | null;
  created_at: string | null;
  editable_without_note: boolean;
  locked: boolean;
}

// Roster + today's (or any date's) marks in one query -- the teacher
// screen needs both to render present-all/tap-absent against the
// actual current state, not just the roster.
export async function getAttendanceRoster(
  client: PoolClient,
  params: { schoolId: string; classId: string; date: string }
): Promise<AttendanceRosterRow[]> {
  const { rows } = await client.query(
    `select
       s.student_id, s.name, s.admission_no,
       a.attendance_id, a.status, a.marked_by, a.created_at,
       (a.created_at is not null and now() - a.created_at <= interval '${FREE_EDIT_WINDOW_MINUTES} minutes') as editable_without_note,
       ($2::date < current_date) as locked
     from students s
     left join attendance a
       on a.school_id = s.school_id and a.student_id = s.student_id and a.date = $2
     where s.school_id = $1 and s.class_id = $3 and s.status = 'active'
     order by s.name asc`,
    [params.schoolId, params.date, params.classId]
  );
  return rows;
}

export interface MarkAttendanceResult {
  inserted: string[]; // student_ids newly marked
  alreadyMarked: string[]; // student_ids that already had a row for this date -- use correctAttendance instead
}

// Daily marking only ever INSERTs -- a student already marked for this
// date must go through correctAttendance, which is the one path that
// carries the edit-window/audit-note rules. Marking is restricted to
// today's date: backdating an initial mark isn't "daily attendance
// marking," it's a correction of a day nobody marked, which this
// prompt doesn't scope a workflow for (the route enforces this; this
// function trusts its caller).
export async function markAttendance(
  client: PoolClient,
  params: {
    schoolId: string;
    classId: string;
    date: string;
    markedBy: string;
    entries: { studentId: string; status: AttendanceStatus }[];
  }
): Promise<MarkAttendanceResult> {
  if (params.entries.length === 0) {
    return { inserted: [], alreadyMarked: [] };
  }

  const { rows: existing } = await client.query(
    `select student_id from attendance where school_id = $1 and date = $2 and student_id = any($3::uuid[])`,
    [params.schoolId, params.date, params.entries.map((e) => e.studentId)]
  );
  const alreadyMarked = new Set(existing.map((r) => r.student_id as string));
  const toInsert = params.entries.filter((e) => !alreadyMarked.has(e.studentId));

  if (toInsert.length > 0) {
    const values: string[] = [];
    const args: unknown[] = [params.schoolId, params.classId, params.date, params.markedBy];
    for (const entry of toInsert) {
      args.push(entry.studentId, entry.status);
      values.push(`($1, $2, $3, $${args.length - 1}, $${args.length}, $4)`);
    }
    await client.query(
      `insert into attendance (school_id, class_id, date, student_id, status, marked_by)
       values ${values.join(', ')}`,
      args
    );
  }

  return {
    inserted: toInsert.map((e) => e.studentId),
    alreadyMarked: [...alreadyMarked],
  };
}

export async function correctAttendance(
  client: PoolClient,
  params: {
    schoolId: string;
    attendanceId: string;
    newStatus: AttendanceStatus;
    note: string | null;
    actorUserId: string;
    actorRole: StaffRole;
  }
): Promise<{ attendance_id: string; status: AttendanceStatus }> {
  const { rows } = await client.query(
    `select attendance_id, date, status, created_at from attendance where school_id = $1 and attendance_id = $2`,
    [params.schoolId, params.attendanceId]
  );
  const before = rows[0];
  if (!before) {
    throw new AttendanceNotFoundError('attendance row not found for this school');
  }

  const { rows: lockCheck } = await client.query(`select ($1::date < current_date) as locked`, [before.date]);
  if (lockCheck[0].locked) {
    throw new PeriodLockedError('attendance for a past date is immutable (period lock)');
  }

  const { rows: windowCheck } = await client.query(
    `select (now() - $1::timestamptz <= interval '${FREE_EDIT_WINDOW_MINUTES} minutes') as editable_without_note`,
    [before.created_at]
  );
  if (!windowCheck[0].editable_without_note && !params.note?.trim()) {
    throw new CorrectionNoteRequiredError(
      `a correction more than ${FREE_EDIT_WINDOW_MINUTES} minutes after marking requires a note`
    );
  }

  const result = await client.query(
    `update attendance set status = $3 where school_id = $1 and attendance_id = $2 returning attendance_id, status`,
    [params.schoolId, params.attendanceId, params.newStatus]
  );
  assertRowsAffected(result, 'attendance correction affected 0 rows -- RLS likely denied it silently');

  await writeAuditLog(client, {
    schoolId: params.schoolId,
    actorUserId: params.actorUserId,
    actorRole: params.actorRole,
    eventAction: 'attendance.correct',
    targetType: 'attendance',
    targetId: params.attendanceId,
    beforeState: { status: before.status },
    afterState: { status: params.newStatus, note: params.note?.trim() || null },
  });

  return result.rows[0];
}
