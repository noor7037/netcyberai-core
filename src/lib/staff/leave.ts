import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { coversReleasedBy } from '@/lib/proxy/proxy';
import { indiaDate } from '@/lib/time/india';
import { addDays, isLeaveDate, LEAVE_AHEAD_DAYS, LEAVE_BACK_DAYS, LEAVE_KINDS, LEAVE_LIST_MAX, LEAVE_MAX_DAYS, LEAVE_OFFICE, LEAVE_ROLES, LEAVE_SELF_RECORDER, LEAVE_TEXT_MAX, leaveDays, type LeaveKind, type LeaveRow, type LeaveStatus } from './leave-rules';

export * from './leave-rules';

// Staff leave (docs/26 slice 8b, C201; C210).
//
//   - A member of staff puts in a request for whole days of leave on their own account page. The PRINCIPAL OR THE
//     SCHOOL ADMIN decides, and NEVER THE PERSON WHO ASKED: the principal's own request is the school admin's to
//     decide, and the other way round.
//   - ONE EXCEPTION (C210): a school with no active school admin has nobody to decide its principal's leave. There
//     the principal records their own leave: approved at once, in their own name, marked self-recorded on the row
//     and in the audit log ('leave.self_recorded'). The database refuses it once the school has an active school
//     admin, and for every other role (the p5 close-out migration, c210_leave_rules).
//   - The office can record leave for someone who phoned in. It is approved at once, in that office person's name.
//   - CANCELLED LEAVE RELEASES ITS COVERS (C210). When approved leave is withdrawn or cancelled, the database undoes
//     in the same transaction every cover still assigned for that person from India's today to the leave's last
//     day, in the canceller's name (staff_leave_releases_covers). withdrawLeave() writes an audit row for each
//     cover released and says how many; the covering teacher reads it on My Day. Nothing is sent.
//   - What was asked never changes. To change the dates, withdraw the request and put in a new one.
//   - A DAY IS "ON LEAVE" ONLY WHILE A REQUEST COVERING IT IS APPROVED. That rule is written once, in the database
//     (staff_on_leave, with Proxy Auto's migration, C202), and it reads nothing but approved rows. onLeave() below
//     asks it; so do Proxy Auto's list of who is away and the database's guard on a new cover.
//   - Only the person and the office read a request. That is the database's rule (the staff_leave policies); this
//     file never works around it, and every query here runs in the caller's own session.
//   - Leave is for running the day. Nothing here counts leave by person, orders people by it or compares them, and
//     no other part of the app may read it to judge a member of staff (docs/26 section 3 rule 4).
//   - Whole days only. No balances.
//   - LEAVE IS KEPT AGAINST A PERSON OF THIS SCHOOL'S OWN STAFF LIST (a `users` row of the school, as the timetable
//     keeps its teachers): the person on leave, and whoever records, decides or cancels. An account made at another
//     school and signed in here through a membership is not on that list. It is refused in plain words
//     ('elsewhere') before the database is asked to hold a row it would refuse.

type Sql = Pick<PoolClient, 'query'>;
type Actor = { schoolId: string; userId: string; role: StaffRole };

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();
const isKind = (v: unknown): v is LeaveKind => (LEAVE_KINDS as readonly unknown[]).includes(v);

export type LeaveInput = { fromDate: string; toDate: string; kind: string; reason: string };
type InputProblem = 'dates' | 'past' | 'too_far' | 'too_long' | 'kind' | 'reason';
export type LeaveMade = { ok: true; leaveId: string } | { ok: false; reason: 'not_allowed' | 'person' | 'elsewhere' | 'own' | 'overlap' | 'has_admin' | InputProblem };
// How a row comes to be: asked (it waits), recorded by the office for someone else, or recorded by a principal for
// themself in a school with no school admin. The last two are approved at once.
type Made = 'asked' | 'recorded' | 'self';
const AUDIT_OF: Record<Made, string> = { asked: 'leave.asked', recorded: 'leave.recorded', self: 'leave.self_recorded' };

// What is wrong with a request, or null. `backDays`: how many days before today the first day may be.
function inputProblem(input: LeaveInput, today: string, backDays: number): InputProblem | null {
  if (!isLeaveDate(input.fromDate) || !isLeaveDate(input.toDate) || input.toDate < input.fromDate) return 'dates';
  if (input.fromDate < addDays(today, -backDays)) return 'past';
  if (input.fromDate > addDays(today, LEAVE_AHEAD_DAYS)) return 'too_far';
  if (leaveDays(input.fromDate, input.toDate) > LEAVE_MAX_DAYS) return 'too_long';
  if (!isKind(input.kind)) return 'kind';
  const reason = oneLine(input.reason);
  if (!reason || reason.length > LEAVE_TEXT_MAX) return 'reason';
  return null;
}

// Is this person on this school's own staff list? (The header says why it is asked.)
const ofThisSchool = async (db: Sql, schoolId: string, userId: string) => Boolean((await db.query(`select 1 from users where school_id = $1 and user_id = $2`, [schoolId, userId])).rows[0]);

// One person's requests are taken one at a time (the same lock the database's own rule takes), so the look for an
// overlap and the insert cannot be passed by a second request made at the same moment.
async function insertLeave(db: Sql, actor: Actor, forUser: string, input: LeaveInput, made: Made): Promise<LeaveMade> {
  const approvedNow = made !== 'asked';
  await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`staff_leave:${actor.schoolId}:${forUser}`]);
  const person = (await db.query(`select 1 from users where school_id = $1 and user_id = $2 and is_active and role::text = any($3::text[])`, [actor.schoolId, forUser, [...LEAVE_ROLES]])).rows[0];
  // One's own request from an account made at another school is told so; anyone else is "not on this school's staff".
  if (!person) return { ok: false, reason: forUser === actor.userId && !(await ofThisSchool(db, actor.schoolId, forUser)) ? 'elsewhere' : 'person' };
  const clash = (await db.query(
    `select 1 from staff_leave where school_id = $1 and user_id = $2 and status in ('waiting', 'approved') and from_date <= $4::date and to_date >= $3::date limit 1`,
    [actor.schoolId, forUser, input.fromDate, input.toDate]
  )).rows[0];
  if (clash) return { ok: false, reason: 'overlap' };
  const leaveId = (await db.query(
    `insert into staff_leave (school_id, user_id, from_date, to_date, kind, reason, status, recorded_by, decided_by, decided_at, self_recorded)
     values ($1, $2, $3::date, $4::date, $5, $6, $7, $8, case when $9::boolean then $8::uuid end, case when $9::boolean then now() end, $10) returning leave_id`,
    [actor.schoolId, forUser, input.fromDate, input.toDate, input.kind, oneLine(input.reason), approvedNow ? 'approved' : 'waiting', actor.userId, approvedNow, made === 'self']
  )).rows[0].leave_id as string;
  // The audit row says who, which days and what happened. Never the kind or the reason: those stay on the request.
  // Leave a principal recorded for themself says so here too ('leave.self_recorded', selfRecorded).
  await writeAuditLog(db, {
    schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: AUDIT_OF[made], targetType: 'staff_leave', targetId: leaveId, beforeState: undefined,
    afterState: { userId: forUser, fromDate: input.fromDate, toDate: input.toDate, status: approvedNow ? 'approved' : 'waiting', ...(made === 'self' ? { selfRecorded: true } : {}) },
  });
  return { ok: true, leaveId };
}

// A person puts in their own request: from today on. It waits for the office.
export async function askLeave(db: Sql, actor: Actor, input: LeaveInput, today: string = indiaDate()): Promise<LeaveMade> {
  if (!LEAVE_ROLES.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const problem = inputProblem(input, today, 0);
  if (problem) return { ok: false, reason: problem };
  return insertLeave(db, actor, actor.userId, input, 'asked');
}

// Does the school have an active school admin on its own staff list (the one who decides the principal's leave)?
const hasActiveAdmin = async (db: Sql, schoolId: string) => Boolean((await db.query(`select 1 from users where school_id = $1 and is_active and role::text = 'school_admin' limit 1`, [schoolId])).rows[0]);

// May this person record their own leave (C210)? A principal of this school's own staff list, while the school has
// no active school admin: nobody else can decide their leave then. The database holds the same rule.
export async function selfRecordAllowed(db: Sql, actor: Actor): Promise<boolean> {
  if (actor.role !== LEAVE_SELF_RECORDER) return false;
  return (await ofThisSchool(db, actor.schoolId, actor.userId)) && !(await hasActiveAdmin(db, actor.schoolId));
}

// The principal of a school with no school admin records their own leave: approved at once, in their own name, and
// marked self-recorded, on the row and in the audit log. From as far back as the office may record leave: it may be
// written down after the day, as the office's is.
export async function recordOwnLeave(db: Sql, actor: Actor, input: LeaveInput, today: string = indiaDate()): Promise<LeaveMade> {
  if (actor.role !== LEAVE_SELF_RECORDER) return { ok: false, reason: 'not_allowed' };
  if (!(await ofThisSchool(db, actor.schoolId, actor.userId))) return { ok: false, reason: 'elsewhere' };
  if (await hasActiveAdmin(db, actor.schoolId)) return { ok: false, reason: 'has_admin' };
  const problem = inputProblem(input, today, LEAVE_BACK_DAYS);
  if (problem) return { ok: false, reason: problem };
  return insertLeave(db, actor, actor.userId, input, 'self');
}

// The office records leave for a member of staff who phoned in: approved at once by that office person, who is
// never the person on leave (their own leave is requested like anyone's, and decided by the other).
export async function recordLeave(db: Sql, actor: Actor, input: LeaveInput & { userId: string }, today: string = indiaDate()): Promise<LeaveMade> {
  if (!LEAVE_OFFICE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  if (input.userId === actor.userId) return { ok: false, reason: 'own' };
  if (!(await ofThisSchool(db, actor.schoolId, actor.userId))) return { ok: false, reason: 'elsewhere' };
  const problem = inputProblem(input, today, LEAVE_BACK_DAYS);
  if (problem) return { ok: false, reason: problem };
  return insertLeave(db, actor, input.userId, input, 'recorded');
}

export type LeaveStep = { ok: true } | { ok: false; reason: 'not_allowed' | 'not_found' | 'elsewhere' | 'own' | 'decided' | 'note' | 'begun' | 'not_approved' | 'closed' };
type Held = { user_id: string; status: LeaveStatus; from_date: string; to_date: string };
// The request as this session may see it (row level security: the person and the office), held for the change.
async function held(db: Sql, actor: Actor, leaveId: string): Promise<Held | undefined> {
  return (await db.query(`select user_id, status, from_date::text as from_date, to_date::text as to_date from staff_leave where school_id = $1 and leave_id = $2 for update`, [actor.schoolId, leaveId])).rows[0] as Held | undefined;
}

// The principal or the school admin approves, or refuses with a note the person reads. Never their own request.
export async function decideLeave(db: Sql, actor: Actor, leaveId: string, decision: 'approve' | 'refuse', note: string): Promise<LeaveStep> {
  if (!LEAVE_OFFICE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  if (!(await ofThisSchool(db, actor.schoolId, actor.userId))) return { ok: false, reason: 'elsewhere' };
  const text = oneLine(note);
  if (text.length > LEAVE_TEXT_MAX || (decision === 'refuse' && !text)) return { ok: false, reason: 'note' };
  const row = await held(db, actor, leaveId);
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.user_id === actor.userId) return { ok: false, reason: 'own' };
  if (row.status !== 'waiting') return { ok: false, reason: 'decided' };
  const status: LeaveStatus = decision === 'approve' ? 'approved' : 'refused';
  await db.query(`update staff_leave set status = $3, decided_by = $4, decided_at = now(), decision_note = $5 where school_id = $1 and leave_id = $2`, [actor.schoolId, leaveId, status, actor.userId, text || null]);
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: decision === 'approve' ? 'leave.approved' : 'leave.refused', targetType: 'staff_leave', targetId: leaveId, beforeState: { status: 'waiting' }, afterState: { userId: row.user_id, fromDate: row.from_date, toDate: row.to_date, status } });
  return { ok: true };
}

// The person withdraws their own request while it waits, or approved leave before its first day. The office cancels
// someone's approved leave, with a note that person reads. Either way those days are no longer "on leave".
// Withdrawing APPROVED leave releases its covers from today on (C210): the database undoes them in the same
// transaction, in this person's name; here each one gets its audit row ('cover.released'), and `coversReleased` says
// how many, so the screen can say so. Read in the caller's own session: the office and the coordinator read every
// cover, a teacher the covers of their own periods.
export type LeaveWithdrawn = { ok: true; coversReleased: number } | Extract<LeaveStep, { ok: false }>;
export async function withdrawLeave(db: Sql, actor: Actor, leaveId: string, note: string, today: string = indiaDate()): Promise<LeaveWithdrawn> {
  if (!LEAVE_ROLES.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const row = await held(db, actor, leaveId);
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.status === 'refused' || row.status === 'withdrawn') return { ok: false, reason: 'closed' };
  const own = row.user_id === actor.userId;
  let text: string | null = null;
  if (own) {
    if (row.status === 'approved' && row.from_date <= today) return { ok: false, reason: 'begun' };
  } else {
    if (!LEAVE_OFFICE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
    if (!(await ofThisSchool(db, actor.schoolId, actor.userId))) return { ok: false, reason: 'elsewhere' };
    if (row.status !== 'approved') return { ok: false, reason: 'not_approved' };
    text = oneLine(note);
    if (!text || text.length > LEAVE_TEXT_MAX) return { ok: false, reason: 'note' };
  }
  await db.query(`update staff_leave set status = 'withdrawn', withdrawn_by = $3, withdrawn_at = now(), withdrawn_note = $4 where school_id = $1 and leave_id = $2`, [actor.schoolId, leaveId, actor.userId, text]);
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: own ? 'leave.withdrawn' : 'leave.cancelled', targetType: 'staff_leave', targetId: leaveId, beforeState: { status: row.status }, afterState: { userId: row.user_id, fromDate: row.from_date, toDate: row.to_date, status: 'withdrawn' } });
  // A waiting request had no cover. The audit rows of a cover say who was away, never the kind or the reason.
  const released = row.status === 'approved' ? await coversReleasedBy(db, actor.schoolId, { absentUserId: row.user_id, fromDate: row.from_date, toDate: row.to_date, by: actor.userId }) : [];
  for (const x of released) {
    await writeAuditLog(db, {
      schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'cover.released', targetType: 'substitutions', targetId: x.substitution_id, beforeState: { status: 'assigned' },
      afterState: { date: x.on_date, period: x.period, classId: x.class_id, absentUserId: row.user_id, substituteUserId: x.substitute_user_id, status: 'undone', undoneReason: 'leave_cancelled', leaveId },
    });
  }
  return { ok: true, coversReleased: released.length };
}

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const ROWS = `select l.leave_id, l.user_id, u.display_name as name, u.role::text as role, l.from_date::text as from_date, l.to_date::text as to_date, l.kind, l.reason, l.status,
                     l.asked_at, l.self_recorded, l.recorded_by, r.display_name as recorded_by_name, d.display_name as decided_by, l.decided_at, l.decision_note, l.withdrawn_by, l.withdrawn_at, l.withdrawn_note
                from staff_leave l join users u on u.user_id = l.user_id join users r on r.user_id = l.recorded_by left join users d on d.user_id = l.decided_by`;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shape(r: any, actor: Actor, today: string): LeaveRow {
  const mine = r.user_id === actor.userId;
  const office = LEAVE_OFFICE.includes(actor.role);
  return {
    leave_id: r.leave_id, user_id: r.user_id, name: r.name, role: r.role, from_date: r.from_date, to_date: r.to_date, days: leaveDays(r.from_date, r.to_date), kind: r.kind, reason: r.reason, status: r.status,
    asked_at: iso(r.asked_at) as string, byOffice: r.recorded_by !== r.user_id, selfRecorded: Boolean(r.self_recorded), recorded_by: r.recorded_by_name, decided_by: r.decided_by, decided_at: iso(r.decided_at), decision_note: r.decision_note,
    withdrawn_at: iso(r.withdrawn_at), withdrawnByOffice: Boolean(r.withdrawn_by) && r.withdrawn_by !== r.user_id, withdrawn_note: r.withdrawn_note,
    mine, mayDecide: office && !mine && r.status === 'waiting', mayWithdraw: mine && (r.status === 'waiting' || (r.status === 'approved' && r.from_date > today)), mayCancel: office && !mine && r.status === 'approved',
  };
}

// A person's own requests, the latest days first.
export async function myLeave(db: Sql, actor: Actor, today: string = indiaDate()): Promise<LeaveRow[]> {
  const { rows } = await db.query(`${ROWS} where l.school_id = $1 and l.user_id = $2 order by l.from_date desc, l.asked_at desc limit 50`, [actor.schoolId, actor.userId]);
  return rows.map((r) => shape(r, actor, today));
}

// The office: requests waiting for a decision, in the order they came in. At most LEAVE_WAITING_MAX rows: the
// dashboard's number counts this list, and /app/staff?show=leave-waiting says when it stops there (C203).
export const LEAVE_WAITING_MAX = 200;
export async function leaveWaiting(db: Sql, actor: Actor, today: string = indiaDate()): Promise<LeaveRow[]> {
  if (!LEAVE_OFFICE.includes(actor.role)) return [];
  const { rows } = await db.query(`${ROWS} where l.school_id = $1 and l.status = 'waiting' order by l.asked_at, l.leave_id limit ${LEAVE_WAITING_MAX}`, [actor.schoolId]);
  return rows.map((r) => shape(r, actor, today));
}

// The office: approved leave with a day on or after `from` (and, when `to` is given, not after it), by its first
// day and then by name. With no `to` nothing ahead is left out, however far: approved leave the office cannot find
// is leave it cannot cancel. At most `limit` rows: a caller that must say "there are more" reads one extra.
export async function leaveCalendar(db: Sql, actor: Actor, from: string, to: string | null, today: string = indiaDate(), limit: number = LEAVE_LIST_MAX): Promise<LeaveRow[]> {
  if (!LEAVE_OFFICE.includes(actor.role) || !isLeaveDate(from) || (to !== null && (!isLeaveDate(to) || to < from))) return [];
  const { rows } = await db.query(`${ROWS} where l.school_id = $1 and l.status = 'approved' and l.to_date >= $2::date and ($3::date is null or l.from_date <= $3::date) order by l.from_date, u.display_name, l.leave_id limit $4`, [actor.schoolId, from, to, limit]);
  return rows.map((r) => shape(r, actor, today));
}

// Who is on leave on a date: the people whose APPROVED leave covers it, and nobody else. A waiting, refused or
// withdrawn request never makes a day "on leave". THE RULE IS WRITTEN ONCE, in the database: staff_on_leave()
// (the p5_substitutions migration). This function, Proxy Auto's list of who is away (teachers_away_on) and the
// database's own guard on a new cover all ask it, so they cannot come to mean different things. It answers with
// the caller's own rights, so row level security still decides what comes back here (the office: everyone; a
// member of staff: themself; anyone else: nobody).
export async function onLeave(db: Sql, schoolId: string, date: string): Promise<{ user_id: string; name: string }[]> {
  if (!isLeaveDate(date)) return [];
  const { rows } = await db.query(
    `select u.user_id, u.display_name as name from users u
      where u.school_id = $1 and public.staff_on_leave(u.school_id, u.user_id, $2::date) order by u.display_name, u.user_id`,
    [schoolId, date]
  );
  return rows as { user_id: string; name: string }[];
}

// Is this person the only one in the school's office? Nobody decides their own request, so the request of a
// school's one principal (a new school, before it has a school admin) has nobody to decide it: the screens say so.
// Read from the same staff list a decision is written against.
export async function officeAlone(db: Sql, actor: Actor): Promise<boolean> {
  if (!LEAVE_OFFICE.includes(actor.role)) return false;
  const other = (await db.query(`select 1 from users where school_id = $1 and is_active and role::text = any($2::text[]) and user_id <> $3 limit 1`, [actor.schoolId, [...LEAVE_OFFICE], actor.userId])).rows[0];
  return !other;
}

// The staff the office can record leave for: everyone active but the person at the keyboard.
export async function leaveStaff(db: Sql, actor: Actor): Promise<{ user_id: string; name: string; role: string }[]> {
  if (!LEAVE_OFFICE.includes(actor.role)) return [];
  return (await db.query(`select user_id, display_name as name, role::text as role from users where school_id = $1 and is_active and role::text = any($2::text[]) and user_id <> $3 order by display_name, user_id`, [actor.schoolId, [...LEAVE_ROLES], actor.userId])).rows;
}
