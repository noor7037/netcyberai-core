// Early Warning: what a flag is made of (v1: docs/26 slice 8j, C209; v2: docs/27 row 9f, C218). No database and no
// session: the screen and the server both read this file, so the words a screen says about a flag are about the
// numbers the server stored.
//
//   - A flag is a reason to look at how a child is getting on, not a verdict about the child.
//   - It is made by rules only. No language model is called. Each rule has a version, stored with what it produced.
//   - Rule version 1: attendance, homework, an open needs-help follow-up. Rule version 2 adds marks (./marks.ts):
//     a child's own percent fell past the school's line against their own exam before, or is below the pass mark
//     in the school's number of subjects. A flag of version 1 stays as it was. Fees are never a signal.
//   - Children, classes and teachers are never ranked or compared: every list is in the order of the class's
//     name and then the child's name.
//   - Nothing here reaches a parent.

export const EARLY_WARNING_RULE_VERSION = 2;

// The nightly check (C210): the same check as "Check now", queued for every school with Early Warning on, run in
// the school's own session as its office sees it, with no person. The flags it opens or closes say so.
export const NIGHTLY_CHECK_JOB = 'early_warning.nightly';

// In the one order they are always written in. 'marks' is last, so a flag of version 1 keeps its order.
export const REASONS = ['attendance', 'homework', 'needs_help', 'marks'] as const;
export type Reason = (typeof REASONS)[number];

// What a person did. Each is something done in the school by that person: none is a message from the app.
export const ACTION_KINDS = ['talked_to_student', 'spoke_to_guardian', 'extra_help', 'other'] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];
export const isActionKind = (v: unknown): v is ActionKind => typeof v === 'string' && (ACTION_KINDS as readonly string[]).includes(v);

// Why a flag closed: no signal remained, or the child is no longer an active student of a class. "No signal
// remained" is said only of signals that were worked out again and found gone. Attendance that could not be
// worked out, because too few days were marked, closes nothing: the reason is held on the flag (see `held` below).
export const CLOSED_REASONS = ['signals_cleared', 'not_active'] as const;
export type ClosedReason = (typeof CLOSED_REASONS)[number];

// Who runs the check and reads every flag; and who opens the screen at all (a teacher: their own classes' flags,
// which is the database's own rule).
export const CHECK_ROLES: readonly string[] = ['principal', 'school_admin', 'academic_coordinator'];
export const FLAG_ROLES: readonly string[] = [...CHECK_ROLES, 'teacher'];

// The follow-ups that count as "needs help": the two kinds about understanding and homework.
export const NEEDS_HELP_KINDS = ['did_not_understand', 'homework_help'] as const;
export type NeedsHelpKind = (typeof NEEDS_HELP_KINDS)[number];

// The longest note or outcome.
export const ACTION_TEXT_MAX = 500;
// How far back the screen shows flags that have closed, in days.
export const CLOSED_SHOWN_DAYS = 30;

// The school's own settings (src/lib/frameworks/settings-schemas.ts, module 'early-warning'), with the defaults
// of docs/26 section 5: in school on fewer than 75 of every 100 days over the last 30 days, counted only when at
// least ten days were marked. Rule version 2 (C218) adds the two numbers of the marks signal: a fall of 15 points
// or more against the child's own exam before, or below the pass mark in 2 subjects or more (C218's defaults; the
// school changes them).
export type AttendanceSettings = { attendanceBelow: number; windowDays: number; minMarkedDays: number };
export type MarksSettings = { marksDropPoints: number; marksBelowPassSubjects: number };
export type EarlyWarningSettings = AttendanceSettings & MarksSettings;
export const DEFAULT_SETTINGS: EarlyWarningSettings = { attendanceBelow: 75, windowDays: 30, minMarkedDays: 10, marksDropPoints: 15, marksBelowPassSubjects: 2 };

// What each reason rests on: the numbers and the dates, as they were at the check. Stored on the flag.
export type AttendanceEvidence = {
  from: string;
  to: string;
  present: number;
  late: number;
  absent: number;
  // Days on recorded leave: left out of both sides of the rate.
  leave: number;
  // present + late + absent: the days the rate is worked out over.
  counted: number;
  // In school (present or late) in every 100 of the counted days, to one decimal. Always below `below`: the
  // rule compares the days themselves, and a rate that would round up to the line is cut to the decimal under it.
  rate: number;
  // The school's settings at the check.
  below: number;
  minDays: number;
  absentDates: string[];
  // Only while the reason is HELD. A later check could not work attendance out again: its days held fewer
  // counted days than the school's minimum. That is not the reason going away, so the numbers above stay as they
  // stood when attendance could last be judged, and this says what the later check found instead: India's date
  // of that check, the first day it looked at, the counted days it found and the days it needed.
  held?: { on: string; from: string; counted: number; minDays: number };
};
export type HomeworkEvidence = {
  from: string;
  to: string;
  notDone: number;
  // Homework Recovery's own two settings at the check.
  threshold: number;
  schoolDays: number;
  missed: { title: string; subject: string; dueDate: string }[];
};
export type NeedsHelpEvidence = { open: { kind: NeedsHelpKind; since: string; source: 'staff' | 'parent_reply' }[] };

// Marks (rule version 2, C218). An exam counts for a class once every paper of it for that class is entered (the
// report-card slice will make that "published"). The exams named are the child's latest such exam (the one sat
// last: its papers' latest date, or the day it was made) and their own exam before it; the percents are the class result's own (percent() and the grading scheme's rounding), never
// worked out a second way. A child is compared only with themselves.
export type MarksPaper = { paperId: string; subject: string; percent: number | null };
// `kind` and `session` label the exam (its type in both languages as the school names it, and its session) when the flags
// are read (C230-AJ part 2); they are not kept in the evidence, and no rule reads them.
export type MarksExam = { examId: string; name: string; className: string; percent: number; papers: MarksPaper[]; kind?: { key: string; en: string; hi: string }; session?: string | null };
export type BelowPass = { paperId: string; subject: string; part: string | null; percent: number; passMark: number };
export type MarksEvidence = {
  exam: MarksExam;
  // Their own exam before it; null for a child's first.
  previous: MarksExam | null;
  // The fall, when it is at least the school's line: by how many points, and the line at the check.
  fell: { by: number; points: number } | null;
  // The subjects (or their parts) below the scheme's pass mark, when there are at least the school's number.
  belowPass: { subjects: BelowPass[]; atLeast: number } | null;
  // The grading scheme version whose rounding and pass marks were used; null for a school with none yet.
  scheme: number | null;
};
export type Evidence = { attendance?: AttendanceEvidence; homework?: HomeworkEvidence; needs_help?: NeedsHelpEvidence; marks?: MarksEvidence };

// The reasons a set of evidence holds, in the one order they are always written in.
export function reasonsOf(evidence: Evidence): Reason[] {
  return REASONS.filter((r) => evidence[r] !== undefined);
}

// What the screens are given.
export type FlagAction = { action_id: string; kind: ActionKind; note: string | null; outcome: string | null; by: string | null; at: string };
export type Flag = {
  flag_id: string;
  student_id: string;
  student_name: string;
  class_id: string;
  class_name: string;
  reasons: Reason[];
  evidence: Evidence;
  rule_version: number;
  detected_at: string;
  checked_at: string;
  opened_by: string | null;
  // Opened, or closed, by the nightly check rather than by a person's "Check now" (C210).
  opened_by_nightly?: boolean;
  closed_by_nightly?: boolean;
  resolved_at: string | null;
  closed_reason: ClosedReason | null;
  actions: FlagAction[];
};
export type ClassCount = { class_id: string; class_name: string; open: number };
// The last check, as its own record says it. `attendanceUsed`: for how many of the students looked at attendance
// could be judged at all (enough days marked), with the two numbers that decided it. Null on a record that does
// not carry them: then nothing is said, never a zero.
// `nightly`: the last check was the nightly one (C210), run with no person.
export type LastCheck = { at: string; by: string | null; nightly?: boolean; ruleVersion: number; students: number; attendanceUsed: number | null; minDays: number | null; windowDays: number | null; opened: number; closed: number; open: number };

// What the list of open flags says when it is empty. An empty list is an all-clear ('none') only when the last
// check could judge attendance for every student it looked at. Where it could for some ('partial') or for nobody
// ('no_attendance'), the screen says so instead (docs/26 section 3 rule 1: not set up is never said as zero).
export type OpenEmpty = 'teacher' | 'never' | 'no_attendance' | 'partial' | 'none';
export function openEmptyState(mayCheck: boolean, last: LastCheck | null): OpenEmpty {
  if (!mayCheck) return 'teacher';
  if (!last) return 'never';
  if (last.attendanceUsed === null || last.minDays === null || last.windowDays === null) return 'none';
  if (last.students === 0 || last.attendanceUsed >= last.students) return 'none';
  return last.attendanceUsed === 0 ? 'no_attendance' : 'partial';
}
