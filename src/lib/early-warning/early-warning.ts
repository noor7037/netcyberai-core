import type { PoolClient } from 'pg';
import { inSchoolRate } from '@/lib/attendance/day';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { classLabel } from '@/lib/frameworks/class-label';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { readSettings } from '@/lib/frameworks/settings-store';
import { findCandidates } from '@/lib/recovery/recovery';
import { indiaDate } from '@/lib/time/india';
import { findMarks } from './marks';
import {
  ACTION_TEXT_MAX,
  CHECK_ROLES,
  CLOSED_SHOWN_DAYS,
  DEFAULT_SETTINGS,
  EARLY_WARNING_RULE_VERSION,
  FLAG_ROLES,
  NEEDS_HELP_KINDS,
  NIGHTLY_CHECK_JOB,
  isActionKind,
  reasonsOf,
  type AttendanceEvidence,
  type AttendanceSettings,
  type ClassCount,
  type EarlyWarningSettings,
  type Evidence,
  type Flag,
  type LastCheck,
  type NeedsHelpKind,
} from './rules';

// Early Warning (v1: docs/26 slice 8j, C209; v2: docs/27 row 9f, C218): flags for staff, by rules, from
// attendance, homework, the needs-help queue and, from rule version 2, marks.
//
//   - runCheck is ONE PERSON'S TAP ("Check now"), in that person's own session: the principal, the school admin
//     or the academic coordinator; or THE NIGHTLY CHECK (C210, src/lib/jobs/school-checks.ts), the same function run in the school's
//     own session as its office sees it (the role 'principal', no person), whose flags say the nightly check opened
//     or closed them. Every read is under the caller's own row level security. For every active student of a
//     class it works out the signals, opens a flag where there is none, brings an open flag's evidence up to date,
//     and closes a flag when no signal remains.
//   - ATTENDANCE: in school on fewer than the school's number in every 100 days over the last days (both school
//     settings), counted only when enough days were marked. A day on recorded leave is left out of both sides:
//     inSchoolRate in src/lib/attendance/day.ts is the one place that says so.
//   - "CANNOT BE JUDGED" IS NOT "CLEARED". With too few days marked, attendance says nothing: it opens no flag,
//     and it closes none. An attendance reason already on a flag is held, with its last numbers and a note of
//     what the later check found, until attendance can be judged again. Every check also counts for how many
//     students attendance could be used at all, and the screen says that number instead of an all-clear.
//   - HOMEWORK: exactly the students Homework Recovery lists (findCandidates), with its own two settings. There
//     is no second rule here. A student whose catch-up plan has been decided is no longer on that list, so the
//     signal clears with the teacher's decision.
//   - NEEDS HELP: an open follow-up of kind "did not understand" or "homework help".
//   - MARKS (rule version 2, C218): the child's own percent in their latest exam with every paper entered fell by
//     at least the school's points against their own exam before, or is below the pass mark in at least the
//     school's number of subjects (findMarks, ./marks.ts). Both the nightly check and "Check now" run this.
//   - FEES ARE NEVER A SIGNAL, and a student waiting for consent is not flagged.
//   - NOTHING REACHES A PARENT. This file queues no message and no job, reads no template and never reads the
//     school's parent-dispatch switch. The database holds notified_parent at false (the migration).
//   - No ranking: every list is in the order of the class's name, then the child's name.
//   - A TEACHER READS THE FLAGS OF THE CHILDREN WHO ARE IN THEIR CLASSES NOW, which the database decides from the
//     child's own row (the migration). The list, the count a class and the cards on My Day all go through that
//     same row, so they agree from the moment a child is moved, before any check is run.
//   - A CHECK AND A STEP ARE KEPT AGAINST A PERSON OF THIS SCHOOL'S OWN STAFF LIST (a `users` row of the school), as
//     leave and covers are. An account made at another school and signed in here through a membership reads what
//     its role reads, but is refused in plain words ('elsewhere') before the database is asked to hold a row in a
//     name it would refuse.

type Actor = { schoolId: string; userId: string; role: StaffRole };
// The nightly check (C210): no person, and no role of its own (its session is the principal's).
export type NightlyCheck = { schoolId: string; job: typeof NIGHTLY_CHECK_JOB };
export type CheckActor = Actor | NightlyCheck;
const ofThisSchool = async (db: PoolClient, schoolId: string, userId: string) => Boolean((await db.query(`select 1 from users where school_id = $1 and user_id = $2`, [schoolId, userId])).rows[0]);

const DAY_MS = 86_400_000;
// The first day of a window of `days` calendar days that ends on `today` (both ends counted).
export function windowFrom(today: string, days: number): string {
  return new Date(Date.parse(`${today}T00:00:00Z`) - (days - 1) * DAY_MS).toISOString().slice(0, 10);
}

// What a child's marks say about the attendance rule, rule version 1. Three answers, and the third is not the
// second:
//   'below'      the signal is there: in school on fewer days than the school's line. With its evidence.
//   'not_below'  judged, and on the line or above it: no signal. On the line is not below it.
//   'too_few'    CANNOT BE JUDGED: fewer counted days than the school's minimum, whatever they hold. Two absences
//                in three days say nothing yet. No flag is opened on it, and none is closed on it either: marks
//                that stopped coming in are not attendance that got better.
//   - A day on leave is left out of both sides (a child on recorded leave is not away from school).
//   - The line is compared on the days themselves, never on the rounded rate: 59 days of 82 is below 72 in
//     every 100, though it rounds to 72.0. The rate kept for the words is then cut to the decimal under the line.
type Marks = { present: number; late: number; absent: number; leave: number; absentDates: readonly string[] };
export type AttendanceReading = { is: 'below'; evidence: AttendanceEvidence } | { is: 'not_below' } | { is: 'too_few'; counted: number };
export function readAttendance(marks: Marks, window: { from: string; to: string }, settings: AttendanceSettings): AttendanceReading {
  const counted = marks.present + marks.late + marks.absent;
  if (counted < settings.minMarkedDays || counted === 0) return { is: 'too_few', counted };
  const inSchool = marks.present + marks.late;
  if (inSchool * 100 >= settings.attendanceBelow * counted) return { is: 'not_below' };
  const rounded = inSchoolRate(marks) ?? 0;
  return {
    is: 'below',
    evidence: {
      from: window.from,
      to: window.to,
      present: marks.present,
      late: marks.late,
      absent: marks.absent,
      leave: marks.leave,
      counted,
      rate: rounded < settings.attendanceBelow ? rounded : Math.floor((inSchool * 1000) / counted) / 10,
      below: settings.attendanceBelow,
      minDays: settings.minMarkedDays,
      absentDates: [...marks.absentDates].sort(),
    },
  };
}

// The attendance signal alone: the evidence when it is there, null when it is not or cannot be judged.
export function attendanceSignal(marks: Marks, window: { from: string; to: string }, settings: AttendanceSettings): AttendanceEvidence | null {
  const read = readAttendance(marks, window, settings);
  return read.is === 'below' ? read.evidence : null;
}

// The school's thresholds: its own settings, or the defaults (docs/26 section 5; the marks numbers C218's).
export async function earlyWarningSettings(db: PoolClient, schoolId: string): Promise<EarlyWarningSettings> {
  const schema = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'early-warning');
  const set = schema ? (await readSettings(db, schoolId, schema)).effective : {};
  const num = (v: unknown, fallback: number, min: number, max: number) => (typeof v === 'number' && Math.floor(v) >= min && Math.floor(v) <= max ? Math.floor(v) : fallback);
  return {
    attendanceBelow: num(set.attendance_below, DEFAULT_SETTINGS.attendanceBelow, 1, 100),
    windowDays: num(set.window_days, DEFAULT_SETTINGS.windowDays, 7, 90),
    minMarkedDays: num(set.min_marked_days, DEFAULT_SETTINGS.minMarkedDays, 1, 60),
    marksDropPoints: num(set.marks_drop_points, DEFAULT_SETTINGS.marksDropPoints, 1, 100),
    marksBelowPassSubjects: num(set.marks_below_pass_subjects, DEFAULT_SETTINGS.marksBelowPassSubjects, 1, 12),
  };
}

export type Signal = { studentId: string; classId: string; evidence: Evidence };

// Every signal as things stand on `today`, for the students the caller's session may read. `active`: every active
// student of a class (the only students looked at); `signals`: those with at least one reason, by student;
// `tooFew`: the students whose attendance could not be judged, with the counted days each has; `from`: the first
// day attendance was looked at.
export type Found = { active: Map<string, string>; signals: Map<string, Signal>; tooFew: Map<string, number>; from: string };
export async function findSignals(db: PoolClient, schoolId: string, today: string, settings: EarlyWarningSettings): Promise<Found> {
  const from = windowFrom(today, settings.windowDays);
  const active = new Map<string, string>();
  const tooFew = new Map<string, number>();
  const evidence = new Map<string, Evidence>();
  const of = (studentId: string) => {
    const e = evidence.get(studentId) ?? {};
    evidence.set(studentId, e);
    return e;
  };

  // Attendance: each active student's own marks in the window, whichever class they were marked in.
  const marks = await db.query(
    `select s.student_id, s.class_id,
            (count(a.attendance_id) filter (where a.status = 'present'))::int as present,
            (count(a.attendance_id) filter (where a.status = 'late'))::int as late,
            (count(a.attendance_id) filter (where a.status = 'absent'))::int as absent,
            (count(a.attendance_id) filter (where a.status = 'leave'))::int as leave,
            coalesce(array_agg(a.date::text order by a.date) filter (where a.status = 'absent'), '{}'::text[]) as absent_dates
       from students s
       left join attendance a on a.school_id = s.school_id and a.student_id = s.student_id and a.date between $2::date and $3::date
      where s.school_id = $1 and s.status = 'active' and s.class_id is not null
      group by s.student_id, s.class_id
      order by s.student_id`,
    [schoolId, from, today]
  );
  for (const r of marks.rows as { student_id: string; class_id: string; present: number; late: number; absent: number; leave: number; absent_dates: string[] }[]) {
    active.set(r.student_id, r.class_id);
    const read = readAttendance({ present: r.present, late: r.late, absent: r.absent, leave: r.leave, absentDates: r.absent_dates }, { from, to: today }, settings);
    if (read.is === 'below') of(r.student_id).attendance = read.evidence;
    else if (read.is === 'too_few') tooFew.set(r.student_id, read.counted);
  }

  // Homework: Homework Recovery's own list, and nothing else.
  const recovery = await findCandidates(db, schoolId, today);
  for (const c of recovery.candidates) {
    if (!active.has(c.student_id)) continue;
    of(c.student_id).homework = {
      from: recovery.from,
      to: today,
      notDone: c.missed.length,
      threshold: recovery.settings.threshold,
      schoolDays: recovery.settings.windowDays,
      missed: c.missed.map((m) => ({ title: m.title, subject: m.subject, dueDate: m.dueDate })),
    };
  }

  // Needs help: the open follow-ups of the two kinds. What the follow-up says in words stays in the queue.
  const help = await db.query(
    `select f.student_id, f.kind, f.source, (f.created_at at time zone 'Asia/Kolkata')::date::text as since
       from pulse_followups f
      where f.school_id = $1 and f.status = 'open' and f.kind = any($2::text[])
      order by f.created_at, f.followup_id`,
    [schoolId, [...NEEDS_HELP_KINDS]]
  );
  for (const r of help.rows as { student_id: string; kind: NeedsHelpKind; source: 'staff' | 'parent_reply'; since: string }[]) {
    if (!active.has(r.student_id)) continue;
    const e = of(r.student_id);
    e.needs_help = { open: [...(e.needs_help?.open ?? []), { kind: r.kind, since: r.since, source: r.source }] };
  }

  // Marks (rule version 2): each child's own latest exam against their own exam before it, and the pass mark.
  for (const [studentId, m] of await findMarks(db, schoolId, [...active.keys()], settings)) of(studentId).marks = m;

  const signals = new Map<string, Signal>();
  for (const [studentId, e] of evidence) if (reasonsOf(e).length > 0) signals.set(studentId, { studentId, classId: active.get(studentId)!, evidence: e });
  return { active, signals, tooFew, from };
}

// The same value whatever order its keys are written in: the database gives a stored object back in its own order.
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// `attendanceUsed`: for how many of the students looked at attendance could be judged at all. The rest had fewer
// counted days than the school's minimum, and the check says nothing about their attendance, good or bad.
export type CheckResult = { ok: true; students: number; attendanceUsed: number; opened: number; changed: number; kept: number; closed: number; open: number } | { ok: false; reason: 'not_allowed' | 'elsewhere' };

// "Check now", or the nightly check. Safe to run twice: a second run on the same rows opens nothing, closes nothing
// and rewrites no evidence; it only records that the flags were checked again.
export async function runCheck(db: PoolClient, actor: CheckActor, now: Date = new Date()): Promise<CheckResult> {
  // Who the flags it opens and closes are put down to: the person, or the nightly check (exactly one of the two,
  // which the database holds, and the database admits the job's name only inside the job's own transaction).
  let by: { user: string; job: null; role: StaffRole } | { user: null; job: typeof NIGHTLY_CHECK_JOB; role: null };
  if ('job' in actor) {
    if (actor.job !== NIGHTLY_CHECK_JOB) return { ok: false, reason: 'not_allowed' };
    by = { user: null, job: NIGHTLY_CHECK_JOB, role: null };
  } else {
    if (!CHECK_ROLES.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
    if (!(await ofThisSchool(db, actor.schoolId, actor.userId))) return { ok: false, reason: 'elsewhere' };
    by = { user: actor.userId, job: null, role: actor.role };
  }
  // Two people pressing at once take turns, so neither opens a second flag for a child.
  await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`early-warning:${actor.schoolId}`]);
  const today = indiaDate(now);
  const settings = await earlyWarningSettings(db, actor.schoolId);
  const { active, signals, tooFew, from } = await findSignals(db, actor.schoolId, today, settings);
  const open = (await db.query(`select flag_id, student_id, class_id, evidence, rule_version from early_warning_flags where school_id = $1 and resolved_at is null order by flag_id for update`, [actor.schoolId])).rows as { flag_id: string; student_id: string; class_id: string; evidence: Evidence; rule_version: number }[];

  let opened = 0;
  let changed = 0;
  let kept = 0;
  let closed = 0;
  const flagged = new Set<string>();
  const close = async (flagId: string, why: 'signals_cleared' | 'not_active') => {
    await db.query(`update early_warning_flags set resolved_at = $3, closed_reason = $4, closed_by = $5, closed_by_job = $6, checked_at = $3 where school_id = $1 and flag_id = $2`, [actor.schoolId, flagId, now, why, by.user, by.job]);
    closed += 1;
  };
  for (const f of open) {
    flagged.add(f.student_id);
    const classId = active.get(f.student_id);
    if (classId === undefined) {
      // The child is no longer an active student of a class, and is not looked at.
      await close(f.flag_id, 'not_active');
      continue;
    }
    // The signals as they are now. An attendance reason already on the flag is HELD when attendance cannot be
    // judged today (too few days marked): its numbers stay as they last stood, with what today's check found
    // instead. It leaves the flag only when attendance is judged again and is not below the line.
    let evidence: Evidence = signals.get(f.student_id)?.evidence ?? {};
    const counted = tooFew.get(f.student_id);
    if (counted !== undefined && f.evidence.attendance) {
      const { held: _before, ...last } = f.evidence.attendance;
      evidence = { ...evidence, attendance: { ...last, held: { on: today, from, counted, minDays: settings.minMarkedDays } } };
    }
    if (reasonsOf(evidence).length === 0) {
      // Every reason was worked out again and none remains.
      await close(f.flag_id, 'signals_cleared');
      continue;
    }
    const same = f.class_id === classId && Number(f.rule_version) === EARLY_WARNING_RULE_VERSION && stable(f.evidence) === stable(evidence);
    await db.query(`update early_warning_flags set class_id = $3, reasons = $4::text[], evidence = $5::jsonb, rule_version = $6, checked_at = $7 where school_id = $1 and flag_id = $2`, [actor.schoolId, f.flag_id, classId, reasonsOf(evidence), JSON.stringify(evidence), EARLY_WARNING_RULE_VERSION, now]);
    if (same) kept += 1;
    else changed += 1;
  }
  for (const s of signals.values()) {
    if (flagged.has(s.studentId)) continue;
    await db.query(
      `insert into early_warning_flags (school_id, student_id, class_id, reasons, evidence, rule_version, opened_by, opened_by_job, detected_at, checked_at) values ($1, $2, $3, $4::text[], $5::jsonb, $6, $7, $9, $8, $8)`,
      [actor.schoolId, s.studentId, s.classId, reasonsOf(s.evidence), JSON.stringify(s.evidence), EARLY_WARNING_RULE_VERSION, by.user, now, by.job]
    );
    opened += 1;
  }
  const result = { students: active.size, attendanceUsed: active.size - tooFew.size, opened, changed, kept, closed, open: opened + changed + kept };
  // The check is a person's act, or the nightly check's: who (or `by` the job, with no person), when, under which
  // rule and settings, and what it did. No child is named here.
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: by.user, actorRole: by.role, eventAction: 'early_warning.checked', targetType: 'early_warning_flags', beforeState: undefined, afterState: { at: now.toISOString(), date: today, ruleVersion: EARLY_WARNING_RULE_VERSION, settings, ...result, ...(by.job ? { by: by.job } : {}) } });
  return { ok: true, ...result };
}

// The most flags one screen lists. A school with more sees the first and is told so; the counts stay whole.
export const FLAG_ROWS_MAX = 500;

// The flags this session may read: the open ones, and those closed in the last days. By class, then by the child's
// name: never by how many reasons, how low a rate or how long open. The class is the one the child is in now (the
// flag's own copy is the class at the last check, and stands in only for a child who is in no class any more).
export async function listFlags(db: PoolClient, actor: Actor, now: Date = new Date()): Promise<{ open: Flag[]; closed: Flag[]; truncated: boolean }> {
  if (!FLAG_ROLES.includes(actor.role)) return { open: [], closed: [], truncated: false };
  const since = new Date(now.getTime() - CLOSED_SHOWN_DAYS * DAY_MS);
  const { rows } = await db.query(
    `select f.flag_id, f.student_id, s.name as student_name, c.class_id, c.name as class_name, c.section, f.reasons, f.evidence, f.rule_version,
            f.detected_at, f.checked_at, f.resolved_at, f.closed_reason, o.display_name as opened_by, f.opened_by_job, f.closed_by_job,
            coalesce((select jsonb_agg(jsonb_build_object('action_id', a.action_id, 'kind', a.kind, 'note', a.note, 'outcome', a.outcome, 'by', u.display_name, 'at', a.at) order by a.at, a.action_id)
                        from early_warning_actions a
                        left join users u on u.school_id = a.school_id and u.user_id = a.by_user
                       where a.school_id = f.school_id and a.flag_id = f.flag_id), '[]'::jsonb) as actions
       from early_warning_flags f
       join students s on s.school_id = f.school_id and s.student_id = f.student_id
       join classes c on c.school_id = f.school_id and c.class_id = coalesce(s.class_id, f.class_id)
       left join users o on o.school_id = f.school_id and o.user_id = f.opened_by
      where f.school_id = $1 and (f.resolved_at is null or f.resolved_at >= $2)
      order by (f.resolved_at is not null), c.name, c.section, c.class_id, s.name, s.student_id, f.detected_at desc, f.flag_id
      limit $3`,
    [actor.schoolId, since, FLAG_ROWS_MAX + 1]
  );
  const flags = rows.slice(0, FLAG_ROWS_MAX).map((r): Flag => ({
    flag_id: r.flag_id,
    student_id: r.student_id,
    student_name: r.student_name,
    class_id: r.class_id,
    class_name: classLabel(r.class_name, r.section) ?? '',
    reasons: r.reasons,
    evidence: r.evidence,
    rule_version: Number(r.rule_version),
    detected_at: new Date(r.detected_at).toISOString(),
    checked_at: new Date(r.checked_at).toISOString(),
    opened_by: r.opened_by ?? null,
    opened_by_nightly: r.opened_by_job === NIGHTLY_CHECK_JOB,
    closed_by_nightly: r.closed_by_job === NIGHTLY_CHECK_JOB,
    resolved_at: r.resolved_at ? new Date(r.resolved_at).toISOString() : null,
    closed_reason: r.closed_reason ?? null,
    actions: (r.actions as Flag['actions']).map((a) => ({ ...a, at: new Date(a.at).toISOString() })),
  }));
  return { open: flags.filter((f) => !f.resolved_at), closed: flags.filter((f) => f.resolved_at), truncated: rows.length > FLAG_ROWS_MAX };
}

// How many flags are open in each class, for the classes that have one. In the order of the class's name: a
// count for running the day, never a ranking of classes or of their teachers. Through the same rows as the list:
// a child is counted under the class they are in now.
export async function classSummary(db: PoolClient, actor: Actor): Promise<ClassCount[]> {
  if (!FLAG_ROLES.includes(actor.role)) return [];
  const { rows } = await db.query(
    `select c.class_id, c.name, c.section, count(*)::int as open
       from early_warning_flags f
       join students s on s.school_id = f.school_id and s.student_id = f.student_id
       join classes c on c.school_id = f.school_id and c.class_id = coalesce(s.class_id, f.class_id)
      where f.school_id = $1 and f.resolved_at is null
      group by c.class_id, c.name, c.section
      order by c.name, c.section, c.class_id`,
    [actor.schoolId]
  );
  return rows.map((r) => ({ class_id: r.class_id, class_name: classLabel(r.name, r.section) ?? '', open: Number(r.open) }));
}

// When the school was last checked, by whom, and what that check did: read from the check's own audit row, which
// the database shows to the three roles that run the check (and to nobody else but the person who ran it).
export async function lastCheck(db: PoolClient, schoolId: string): Promise<LastCheck | null> {
  const row = (await db.query(
    `select a.occurred_at, a.after_state, u.display_name
       from audit_log a
       left join users u on u.school_id = a.school_id and u.user_id = a.actor_user_id
      where a.school_id = $1 and a.event_action = 'early_warning.checked'
      order by a.occurred_at desc limit 1`,
    [schoolId]
  )).rows[0];
  if (!row) return null;
  const s = (row.after_state ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' ? v : 0);
  // A number the record does not carry is not known, and is never made a zero.
  const known = (v: unknown) => (typeof v === 'number' ? v : null);
  const used = (s.settings ?? {}) as Record<string, unknown>;
  return {
    at: typeof s.at === 'string' ? s.at : new Date(row.occurred_at).toISOString(),
    by: row.display_name ?? null,
    ...(s.by === NIGHTLY_CHECK_JOB ? { nightly: true } : {}),
    ruleVersion: n(s.ruleVersion),
    students: n(s.students),
    attendanceUsed: known(s.attendanceUsed),
    minDays: known(used.minMarkedDays),
    windowDays: known(used.windowDays),
    opened: n(s.opened),
    closed: n(s.closed),
    open: n(s.open),
  };
}

export type ActionInput = { flagId: string; kind: unknown; note: unknown; outcome: unknown };
export type ActionResult = { ok: true; actionId: string } | { ok: false; reason: 'not_allowed' | 'not_found' | 'elsewhere' | 'kind' | 'note' | 'outcome' | 'say_what' };

// What a person did about a flag, and what came of it when that is known. Added to the log in the person's own
// name and never changed afterwards: an outcome learned later is a new entry. The flag must be one this session
// may read (a teacher: a child of their own classes), which the database decides.
export async function addAction(db: PoolClient, actor: Actor, input: ActionInput, now: Date = new Date()): Promise<ActionResult> {
  if (!FLAG_ROLES.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  if (!isActionKind(input.kind)) return { ok: false, reason: 'kind' };
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : v === null || v === undefined ? '' : null);
  const note = text(input.note);
  const outcome = text(input.outcome);
  if (note === null || note.length > ACTION_TEXT_MAX) return { ok: false, reason: 'note' };
  if (outcome === null || outcome.length > ACTION_TEXT_MAX) return { ok: false, reason: 'outcome' };
  if (input.kind === 'other' && !note) return { ok: false, reason: 'say_what' };
  if (!(await db.query(`select 1 from early_warning_flags where school_id = $1 and flag_id = $2`, [actor.schoolId, input.flagId])).rows[0]) return { ok: false, reason: 'not_found' };
  if (!(await ofThisSchool(db, actor.schoolId, actor.userId))) return { ok: false, reason: 'elsewhere' };
  const actionId = (await db.query(
    `insert into early_warning_actions (school_id, flag_id, kind, note, outcome, by_user, at) values ($1, $2, $3, $4, $5, $6, $7) returning action_id`,
    [actor.schoolId, input.flagId, input.kind, note || null, outcome || null, actor.userId, now]
  )).rows[0].action_id as string;
  // Which flag, what kind of step, and whether an outcome was given: never the words, and never the child's name.
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'early_warning.action_added', targetType: 'early_warning_flags', targetId: input.flagId, beforeState: undefined, afterState: { actionId, kind: input.kind, outcomeGiven: Boolean(outcome) } });
  return { ok: true, actionId };
}

export type Screen = {
  mayCheck: boolean;
  ruleVersion: number;
  // The thresholds in force now, for the people who run the check.
  settings: EarlyWarningSettings | null;
  lastCheck: LastCheck | null;
  summary: ClassCount[];
  open: Flag[];
  closed: Flag[];
  truncated: boolean;
};

// Everything the screen shows, read once, as this person.
export async function loadScreen(db: PoolClient, actor: Actor, now: Date = new Date()): Promise<Screen> {
  const mayCheck = CHECK_ROLES.includes(actor.role);
  const flags = await listFlags(db, actor, now);
  return {
    mayCheck,
    ruleVersion: EARLY_WARNING_RULE_VERSION,
    settings: mayCheck ? await earlyWarningSettings(db, actor.schoolId) : null,
    lastCheck: mayCheck ? await lastCheck(db, actor.schoolId) : null,
    summary: await classSummary(db, actor),
    ...flags,
  };
}
