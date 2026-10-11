import type { PoolClient } from 'pg';
import type { StaffRole } from '@/lib/auth/types';
import { writeAuditLog } from '@/lib/audit/log';
import { assertRowsAffected } from '@/lib/db/rows';
import { sendWhatsAppMessage } from '@/lib/whatsapp/gate';

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
// The day is India's (C144): every "today" here is passed in by the caller
// from indiaDate(), never taken from the database's UTC date.
export const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'leave'] as const;
// Why a student is on leave (docs/20 §7). The column holds any short code,
// so a school's own list can come later without a migration.
export const LEAVE_CODES = ['sick', 'family', 'school_activity', 'other'] as const;
export type LeaveCode = (typeof LEAVE_CODES)[number];
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const FREE_EDIT_WINDOW_MINUTES = 10;

export class PeriodLockedError extends Error {}
export class CorrectionNoteRequiredError extends Error {}
export class AttendanceNotFoundError extends Error {}

export interface AttendanceRosterRow {
  student_id: string;
  name: string;
  admission_no: string;
  roll_no: string | null;
  // Not yet active (C143): marked like anyone else; no message goes to the family.
  consent_pending: boolean;
  attendance_id: string | null;
  status: AttendanceStatus | null;
  leave_code: string | null;
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
  params: { schoolId: string; classId: string; date: string; today: string }
): Promise<AttendanceRosterRow[]> {
  const { rows } = await client.query(
    `select
       s.student_id, s.name, s.admission_no, s.roll_no,
       (s.status = 'pending_consent') as consent_pending,
       a.attendance_id, a.status, a.leave_code, a.marked_by, a.created_at,
       (a.created_at is not null and now() - a.created_at <= interval '${FREE_EDIT_WINDOW_MINUTES} minutes') as editable_without_note,
       ($2::date < $4::date) as locked
     from students s
     left join attendance a
       on a.school_id = s.school_id and a.student_id = s.student_id and a.date = $2
     where s.school_id = $1 and s.class_id = $3 and s.status in ('active', 'pending_consent')
     order by s.name asc`,
    [params.schoolId, params.date, params.classId, params.today]
  );
  return rows;
}

export type AttendanceEntry = { studentId: string; status: AttendanceStatus; leaveCode?: string | null };

export interface MarkAttendanceResult {
  inserted: string[]; // student_ids newly marked
  alreadyMarked: string[]; // student_ids that already had a row for this date -- use correctAttendance instead
  // Already marked, and differently (docs/20 §4): the first saved mark stays;
  // the person is shown both and may save theirs as a correction.
  differences: { studentId: string; attendanceId: string; saved: AttendanceStatus; yours: AttendanceStatus }[];
  notInClass: string[]; // student_ids that are not this class's students: nothing is saved for them
}

// 04_SYSTEM_DESIGN_PRD.md Sec3.2's own flow: capture -> ... -> consent +
// eligibility gate -> 1-on-1 WhatsApp dispatch. Task 2's own
// consolidated text confirms operational_communication (not
// daily_pulse) is the purpose that applies here -- checked live
// against ConsentPanel.tsx's own purpose list, Prompt G:
// "operational_communication: Fee notices, receipts, absence alerts,
// notices." The dedupe key is scoped to the attendance row itself, not
// the specific status-change event, so a student corrected away from
// and back to absent on the same day still only ever notifies once.
// One send per linked guardian -- consent eligibility in this schema
// is a per-student, not per-guardian, property (Prompt G's
// isPurposeGranted checks (school, student, purpose) only), so once a
// student is eligible every linked guardian with a phone number on
// file is notified.
async function notifyGuardiansOfAbsence(
  client: PoolClient,
  params: { schoolId: string; attendanceId: string; studentId: string }
): Promise<void> {
  const { rows: guardians } = await client.query(
    `select p.parent_id, p.phone from parent_student_map psm
     join parents p on p.school_id = psm.school_id and p.parent_id = psm.parent_id
     where psm.school_id = $1 and psm.student_id = $2`,
    [params.schoolId, params.studentId]
  );
  for (const guardian of guardians) {
    await sendWhatsAppMessage(client, {
      schoolId: params.schoolId,
      studentId: params.studentId,
      purpose: 'operational_communication',
      toPhone: guardian.phone,
      templateName: 'attendance_absence_notification',
      templateParams: { studentId: params.studentId },
      dedupeKey: `attendance_absence:${params.attendanceId}:${guardian.parent_id}`,
    });
  }
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
    entries: AttendanceEntry[];
  }
): Promise<MarkAttendanceResult> {
  if (params.entries.length === 0) {
    return { inserted: [], alreadyMarked: [], differences: [], notInClass: [] };
  }

  // Only this class's own students are marked under this class: the
  // attendance policy trusts the row's class, so the row must tell the truth.
  const { rows: members } = await client.query(
    `select student_id from students where school_id = $1 and class_id = $2 and status in ('active', 'pending_consent') and student_id = any($3::uuid[])`,
    [params.schoolId, params.classId, params.entries.map((e) => e.studentId)]
  );
  const inClass = new Set(members.map((r) => r.student_id as string));
  const entries = params.entries.filter((e) => inClass.has(e.studentId));
  const notInClass = params.entries.filter((e) => !inClass.has(e.studentId)).map((e) => e.studentId);

  const { rows: existing } = await client.query(
    `select student_id, attendance_id, status from attendance where school_id = $1 and date = $2 and student_id = any($3::uuid[])`,
    [params.schoolId, params.date, entries.map((e) => e.studentId)]
  );
  const saved = new Map(existing.map((r) => [r.student_id as string, r as { attendance_id: string; status: AttendanceStatus }]));
  const alreadyMarked = new Set(saved.keys());
  const toInsert = entries.filter((e) => !alreadyMarked.has(e.studentId));
  const differences = entries
    .filter((e) => alreadyMarked.has(e.studentId) && saved.get(e.studentId)!.status !== e.status)
    .map((e) => ({ studentId: e.studentId, attendanceId: saved.get(e.studentId)!.attendance_id, saved: saved.get(e.studentId)!.status, yours: e.status }));

  // A student may already hold a mark for the day that this person cannot
  // see (marked in another class before moving): the insert leaves it alone
  // and the student counts as already marked.
  let inserted: string[] = [];
  if (toInsert.length > 0) {
    // unnest() zips the two arrays element-wise into one row per
    // student -- a single, static SQL string with real placeholders,
    // rather than hand-building a multi-row VALUES-tuple fragment with
    // its own arithmetic on args.length (fragile, and a separate
    // string check_claims.py's SQL-keyword exemption doesn't reach,
    // since that keyword lives in a different template literal).
    const { rows: insertedRows } = await client.query(
      `insert into attendance (school_id, class_id, date, student_id, status, leave_code, marked_by)
       select $1, $2, $3, s.student_id, s.status, case when s.status = 'leave' then s.leave_code end, $4
       from unnest($5::uuid[], $6::text[], $7::text[]) as s(student_id, status, leave_code)
       on conflict (school_id, student_id, date) do nothing
       returning attendance_id, student_id, status`,
      [
        params.schoolId,
        params.classId,
        params.date,
        params.markedBy,
        toInsert.map((e) => e.studentId),
        toInsert.map((e) => e.status),
        toInsert.map((e) => e.leaveCode ?? null),
      ]
    );
    inserted = insertedRows.map((r) => r.student_id as string);
    for (const row of insertedRows) {
      if (row.status === 'absent') {
        await notifyGuardiansOfAbsence(client, { schoolId: params.schoolId, attendanceId: row.attendance_id, studentId: row.student_id });
      }
    }
  }

  return {
    inserted,
    alreadyMarked: [...alreadyMarked, ...toInsert.map((e) => e.studentId).filter((id) => !inserted.includes(id))],
    differences,
    notInClass,
  };
}

// A submission from the attendance screen, online or sent later from a
// phone's outbox (docs/20 §4, C144).
//
//   - With an operation id, the same submission arriving twice is applied
//     once: the second is answered with what the first one did.
//   - A mark is saved only for today (India). A submission for another day
//     saves nothing and says so; it is never applied to the wrong day.
//   - How long the class took to mark is recorded once, with no student or
//     staff detail (17 §3b).
export type SubmitAttendanceResult =
  | ({ outcome: 'saved'; replayed: boolean } & MarkAttendanceResult)
  | { outcome: 'day_passed'; replayed: boolean; forDate: string; today: string }
  | { outcome: 'not_yours' };

export const MAX_SECONDS_TO_MARK = 2 * 60 * 60;

export async function submitAttendance(
  client: PoolClient,
  params: {
    schoolId: string;
    classId: string;
    forDate: string;
    today: string;
    markedBy: string;
    entries: AttendanceEntry[];
    operationId?: string | null;
    secondsToMark?: number | null;
  }
): Promise<SubmitAttendanceResult> {
  if (params.operationId) {
    // Claiming the id first also makes a second copy arriving at the same
    // moment wait for this one, then read its answer.
    const claimed = await client.query(
      `insert into client_operations (school_id, operation_id, user_id, kind, for_date)
       values ($1, $2, $3, 'attendance.mark', $4) on conflict (school_id, operation_id) do nothing`,
      [params.schoolId, params.operationId, params.markedBy, params.forDate]
    );
    if (claimed.rowCount === 0) {
      const { rows } = await client.query(`select result from client_operations where school_id = $1 and operation_id = $2 and kind = 'attendance.mark'`, [params.schoolId, params.operationId]);
      // An id another person used (their rows are not visible here), or one still without an answer.
      if (!rows[0]?.result) return { outcome: 'not_yours' };
      return { ...(rows[0].result as Exclude<SubmitAttendanceResult, { outcome: 'not_yours' }>), replayed: true };
    }
  }

  let result: SubmitAttendanceResult;
  if (params.forDate !== params.today) {
    result = { outcome: 'day_passed', replayed: false, forDate: params.forDate, today: params.today };
  } else {
    const marked = await markAttendance(client, { schoolId: params.schoolId, classId: params.classId, date: params.today, markedBy: params.markedBy, entries: params.entries });
    result = { outcome: 'saved', replayed: false, ...marked };
    const seconds = params.secondsToMark;
    if (marked.inserted.length > 0 && typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0 && seconds <= MAX_SECONDS_TO_MARK) {
      await client.query(`insert into usage_events (school_id, kind, class_id, day, value) values ($1, 'attendance.seconds_to_mark', $2, $3, $4)`, [params.schoolId, params.classId, params.today, Math.round(seconds)]);
    }
  }

  if (params.operationId) {
    await client.query(`update client_operations set result = $3::jsonb where school_id = $1 and operation_id = $2`, [params.schoolId, params.operationId, JSON.stringify(result)]);
  }
  return result;
}

export async function correctAttendance(
  client: PoolClient,
  params: {
    schoolId: string;
    attendanceId: string;
    newStatus: AttendanceStatus;
    leaveCode?: string | null;
    today: string;
    note: string | null;
    actorUserId: string;
    actorRole: StaffRole;
  }
): Promise<{ attendance_id: string; status: AttendanceStatus }> {
  const { rows } = await client.query(
    `select attendance_id, student_id, date, status, created_at from attendance where school_id = $1 and attendance_id = $2`,
    [params.schoolId, params.attendanceId]
  );
  const before = rows[0];
  if (!before) {
    throw new AttendanceNotFoundError('attendance row not found for this school');
  }

  const { rows: lockCheck } = await client.query(`select ($1::date < $2::date) as locked`, [before.date, params.today]);
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
    `update attendance set status = $3, leave_code = case when $3 = 'leave' then $4::text end where school_id = $1 and attendance_id = $2 returning attendance_id, status`,
    [params.schoolId, params.attendanceId, params.newStatus, params.leaveCode ?? null]
  );
  assertRowsAffected(result, 'attendance correction affected 0 rows -- RLS likely denied it silently');

  if (params.newStatus === 'absent') {
    await notifyGuardiansOfAbsence(client, { schoolId: params.schoolId, attendanceId: params.attendanceId, studentId: before.student_id });
  }

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
