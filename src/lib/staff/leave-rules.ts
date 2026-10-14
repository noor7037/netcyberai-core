// Staff leave: the limits and the day arithmetic (C201). No database, no session: the screens and the server both
// read these, so a limit said on a screen is the limit the server holds.

export const LEAVE_KINDS = ['casual', 'sick', 'other'] as const;
export type LeaveKind = (typeof LEAVE_KINDS)[number];
export type LeaveStatus = 'waiting' | 'approved' | 'refused' | 'withdrawn';
// Who decides, and who may put in a request.
export const LEAVE_OFFICE: readonly string[] = ['principal', 'school_admin'];
// Who records their own leave, and only while the school has no active school admin to decide it (C210).
export const LEAVE_SELF_RECORDER = 'principal';
export const LEAVE_ROLES: readonly string[] = ['principal', 'school_admin', 'teacher', 'accountant', 'academic_coordinator'];
// The longest one request may be, in days (the database holds the same limit: staff_leave_dates).
export const LEAVE_MAX_DAYS = 60;
// How far back the office may record leave that was not written down at the time, and how far ahead anyone may plan.
export const LEAVE_BACK_DAYS = 31;
export const LEAVE_AHEAD_DAYS = 366;
// The reason and each note, in characters (the database holds the same limit).
export const LEAVE_TEXT_MAX = 300;
// The most requests one of the office's lists carries. A longer list says that it was cut, and how to reach the rest.
export const LEAVE_LIST_MAX = 500;

const DAY_MS = 86_400_000;
export const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
export const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
// A real day of the calendar, written YYYY-MM-DD (the thirty-first of February is not one).
export function isLeaveDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && addDays(value, 0) === value;
}
// How many days a request covers, the first and the last included.
export const leaveDays = (fromDate: string, toDate: string) => dayNumber(toDate) - dayNumber(fromDate) + 1;
// Approved leave as the office reads it: what is running today or still to come, and what has already ended. Both
// stay on the screen, because leave that ended can still be wrong and need cancelling. The order is kept.
export function leaveByToday<R extends { to_date: string }>(rows: R[], today: string): { ahead: R[]; ended: R[] } {
  return { ahead: rows.filter((r) => r.to_date >= today), ended: rows.filter((r) => r.to_date < today) };
}

// One request as a screen is given it: the person's own, or one of the office's lists.
export type LeaveRow = {
  leave_id: string; user_id: string; name: string; role: string; from_date: string; to_date: string; days: number; kind: LeaveKind; reason: string; status: LeaveStatus;
  // `selfRecorded`: the principal of a school with no school admin recorded it for themself, approved at once (C210).
  asked_at: string; byOffice: boolean; selfRecorded: boolean; recorded_by: string; decided_by: string | null; decided_at: string | null; decision_note: string | null;
  withdrawn_at: string | null; withdrawnByOffice: boolean; withdrawn_note: string | null;
  // What this person may do to it now: the same rules as the server's own steps.
  mine: boolean; mayDecide: boolean; mayWithdraw: boolean; mayCancel: boolean;
};
