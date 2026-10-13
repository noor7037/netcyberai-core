import type { PoolClient } from 'pg';
import type { StaffRole } from '@/lib/auth/types';
import { writeAuditLog } from '@/lib/audit/log';
import { assertRowsAffected } from '@/lib/db/rows';
import { sendWhatsAppMessage } from '@/lib/whatsapp/gate';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { readSettings } from '@/lib/frameworks/settings-store';

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
  if (guardians.length === 0) return;
  // What the message says (C184): the child's first name and the day, nothing more.
  const { rows: about } = await client.query(
    `select split_part(btrim(s.name), ' ', 1) as child, to_char(a.date, 'DD-MM-YYYY') as day from attendance a join students s on s.school_id = a.school_id and s.student_id = a.student_id where a.school_id = $1 and a.attendance_id = $2`,
    [params.schoolId, params.attendanceId]
  );
  for (const guardian of guardians) {
    await sendWhatsAppMessage(client, {
      schoolId: params.schoolId,
      studentId: params.studentId,
      purpose: 'operational_communication',
      toPhone: guardian.phone,
      templateName: 'attendance_absence_notification',
      templateParams: { child: about[0]?.child ?? '', date: about[0]?.day ?? '' },
      dedupeKey: `attendance_absence:${params.attendanceId}:${guardian.parent_id}`,
      parentId: guardian.parent_id,
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
  // The day ended before the marks arrived (C146): they wait for the office.
  | { outcome: 'sent_to_office'; replayed: boolean; forDate: string; requestId: string }
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
    // After its day, a submission is never applied as a mark. Within the
    // school's correction window it becomes a request in the office's queue;
    // older than that, or for a day that has not come, it is refused.
    const inClass = await client.query(`select 1 from classes where school_id = $1 and class_id = $2`, [params.schoolId, params.classId]);
    if (params.entries.length > 0 && inClass.rows[0] && withinCorrectionWindow(params.forDate, params.today, await correctionWindowDays(client, params.schoolId))) {
      const made = await client.query(
        `insert into attendance_correction_requests (school_id, class_id, for_date, requested_by, entries) values ($1, $2, $3, $4, $5::jsonb) returning request_id`,
        [params.schoolId, params.classId, params.forDate, params.markedBy, JSON.stringify(params.entries.map((e) => ({ studentId: e.studentId, status: e.status, leaveCode: e.status === 'leave' ? e.leaveCode ?? null : null })))]
      );
      result = { outcome: 'sent_to_office', replayed: false, forDate: params.forDate, requestId: made.rows[0].request_id };
    } else {
      result = { outcome: 'day_passed', replayed: false, forDate: params.forDate, today: params.today };
    }
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

// ---- The office's correction path (C146) ------------------------------
//
// A principal or school admin may enter or correct attendance for a day
// that has ended, with a reason, inside the school's correction window (a
// setting, 7 days unless the school changes it). Every such change is in
// the audit log with the reason. No message goes to a family about a past
// day: the absence notice is for the day itself.

export const DEFAULT_CORRECTION_WINDOW_DAYS = 7;
export const MAX_CORRECTION_WINDOW_DAYS = 60;
const OFFICE_ROLES: readonly string[] = ['principal', 'school_admin'];

export async function correctionWindowDays(client: PoolClient, schoolId: string): Promise<number> {
  const schema = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'attendance');
  const value = schema ? (await readSettings(client, schoolId, schema)).effective.correction_window_days : undefined;
  const n = typeof value === 'number' ? Math.floor(value) : DEFAULT_CORRECTION_WINDOW_DAYS;
  return n >= 0 && n <= MAX_CORRECTION_WINDOW_DAYS ? n : DEFAULT_CORRECTION_WINDOW_DAYS;
}

const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
// A past day, no further back than the window.
export function withinCorrectionWindow(date: string, today: string, windowDays: number): boolean {
  const back = dayNumber(today) - dayNumber(date);
  return back >= 1 && back <= windowDays;
}

type OfficeActor = { schoolId: string; userId: string; role: StaffRole };
export type OfficeCorrectionResult =
  | { ok: true; attendanceId: string; entered: boolean }
  | { ok: false; reason: 'not_allowed' | 'reason_required' | 'outside_window' | 'unknown_student' };

export async function officeCorrectAttendance(
  client: PoolClient,
  actor: OfficeActor,
  params: { studentId: string; date: string; status: AttendanceStatus; leaveCode?: string | null; reason: string; today: string }
): Promise<OfficeCorrectionResult> {
  if (!OFFICE_ROLES.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const reason = params.reason.trim();
  if (!reason) return { ok: false, reason: 'reason_required' };
  if (!withinCorrectionWindow(params.date, params.today, await correctionWindowDays(client, actor.schoolId))) return { ok: false, reason: 'outside_window' };
  const student = (await client.query(`select class_id from students where school_id = $1 and student_id = $2 and status in ('active', 'pending_consent') and class_id is not null`, [actor.schoolId, params.studentId])).rows[0];
  if (!student) return { ok: false, reason: 'unknown_student' };

  const before = (await client.query(`select attendance_id, status, leave_code from attendance where school_id = $1 and student_id = $2 and date = $3`, [actor.schoolId, params.studentId, params.date])).rows[0] ?? null;
  const leaveCode = params.status === 'leave' ? params.leaveCode ?? null : null;
  const saved = before
    ? await client.query(`update attendance set status = $3, leave_code = $4 where school_id = $1 and attendance_id = $2 returning attendance_id`, [actor.schoolId, before.attendance_id, params.status, leaveCode])
    : await client.query(`insert into attendance (school_id, class_id, date, student_id, status, leave_code, marked_by) values ($1, $2, $3, $4, $5, $6, $7) returning attendance_id`, [actor.schoolId, student.class_id, params.date, params.studentId, params.status, leaveCode, actor.userId]);
  assertRowsAffected(saved, 'office attendance correction affected 0 rows -- RLS likely denied it silently');
  const attendanceId = saved.rows[0].attendance_id as string;
  await writeAuditLog(client, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: before ? 'attendance.office_correct' : 'attendance.office_enter',
    targetType: 'attendance',
    targetId: attendanceId,
    beforeState: before ? { status: before.status, leaveCode: before.leave_code } : null,
    afterState: { status: params.status, leaveCode, date: params.date, reason },
  });
  return { ok: true, attendanceId, entered: !before };
}

export type CorrectionRequest = {
  request_id: string;
  class_id: string;
  class_name: string;
  for_date: string;
  requested_by_name: string;
  created_at: string;
  students: number;
  in_window: boolean;
};

export async function waitingCorrectionRequests(client: PoolClient, schoolId: string, today: string): Promise<CorrectionRequest[]> {
  const days = await correctionWindowDays(client, schoolId);
  const { rows } = await client.query(
    `select r.request_id, r.class_id, c.name as class_name, r.for_date::text as for_date, u.display_name as requested_by_name, r.created_at, jsonb_array_length(r.entries)::int as students
       from attendance_correction_requests r
       join classes c on c.school_id = r.school_id and c.class_id = r.class_id
       join users u on u.school_id = r.school_id and u.user_id = r.requested_by
      where r.school_id = $1 and r.status = 'waiting'
      order by r.for_date, r.created_at`,
    [schoolId]
  );
  return rows.map((r) => ({ ...r, in_window: withinCorrectionWindow(r.for_date, today, days) }));
}

export type DecideResult = { ok: true; applied: number; kept: number } | { ok: false; reason: 'not_allowed' | 'reason_required' | 'outside_window' | 'not_found' };

// Apply: each student of the request who has no mark for that day gets the
// requested one. A student already marked keeps the saved mark (the office
// changes that one by itself, on the day's roster). Dismiss: nothing is saved.
export async function decideCorrectionRequest(
  client: PoolClient,
  actor: OfficeActor,
  params: { requestId: string; action: 'apply' | 'dismiss'; reason: string; today: string }
): Promise<DecideResult> {
  if (!OFFICE_ROLES.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const reason = params.reason.trim();
  if (!reason) return { ok: false, reason: 'reason_required' };
  const request = (await client.query(`select request_id, class_id, for_date::text as for_date, requested_by, entries from attendance_correction_requests where school_id = $1 and request_id = $2 and status = 'waiting' for update`, [actor.schoolId, params.requestId])).rows[0];
  if (!request) return { ok: false, reason: 'not_found' };

  let applied = 0;
  let kept = 0;
  if (params.action === 'apply') {
    if (!withinCorrectionWindow(request.for_date, params.today, await correctionWindowDays(client, actor.schoolId))) return { ok: false, reason: 'outside_window' };
    const entries = (request.entries as { studentId?: unknown; status?: unknown; leaveCode?: unknown }[]).filter(
      (e): e is { studentId: string; status: AttendanceStatus; leaveCode: string | null } => typeof e.studentId === 'string' && ATTENDANCE_STATUSES.includes(e.status as AttendanceStatus)
    );
    const inserted = await client.query(
      `insert into attendance (school_id, class_id, date, student_id, status, leave_code, marked_by)
       select $1, $2, $3, s.student_id, n.status, case when n.status = 'leave' then n.leave_code end, $4
         from unnest($5::uuid[], $6::text[], $7::text[]) as n(student_id, status, leave_code)
         join students s on s.school_id = $1 and s.student_id = n.student_id and s.class_id = $2 and s.status in ('active', 'pending_consent')
       on conflict (school_id, student_id, date) do nothing
       returning student_id`,
      [actor.schoolId, request.class_id, request.for_date, request.requested_by, entries.map((e) => e.studentId), entries.map((e) => e.status), entries.map((e) => (typeof e.leaveCode === 'string' ? e.leaveCode : null))]
    );
    applied = inserted.rows.length;
    kept = entries.length - applied;
  }
  const decided = await client.query(
    `update attendance_correction_requests set status = $3, decided_by = $4, decided_at = now(), decision_reason = $5 where school_id = $1 and request_id = $2 and status = 'waiting'`,
    [actor.schoolId, params.requestId, params.action === 'apply' ? 'applied' : 'dismissed', actor.userId, reason.slice(0, 500)]
  );
  assertRowsAffected(decided, 'correction request decision affected 0 rows -- RLS likely denied it silently');
  await writeAuditLog(client, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: params.action === 'apply' ? 'attendance.request_applied' : 'attendance.request_dismissed',
    targetType: 'attendance_correction_requests',
    targetId: params.requestId,
    beforeState: { status: 'waiting', classId: request.class_id, date: request.for_date, requestedBy: request.requested_by },
    afterState: { applied, kept, reason },
  });
  return { ok: true, applied, kept };
}

