import type { ModuleId } from '@/lib/contracts/modules';

// School Health Auditor v1: the checks, their states and the result in words (docs/26 slice 8i, C208).
// No database and no session here: the screen and the server both read this file, so what a screen says about a
// check is what the server worked out.
//
//   - RULES ONLY (docs/26 section 3 rule 9). Each check is a fixed rule over the school's own rows. Nothing in this
//     folder calls a language model, and a test reads the folder to hold that.
//   - A check is in ONE of four states:
//       passes            the rule holds
//       needs_attention   it does not: with HOW MANY, and the address of the screen that fixes it
//       not_set_up        the thing the check looks at does not exist yet in this school (no timetable, no fee
//                         structure, no budget), or its module is switched off. NOT a pass and NOT a fail.
//       could_not_check   the check could not be run this time. NEVER shown as a pass.
//   - THE RESULT IS "N of M checks pass". M counts the checks that apply: every check that is not "not set up".
//     A check that could not be run applies and does not pass, so it is in M and not in N. Never a percentage, a
//     score out of a made-up number, or a grade.
//   - Counts only. A check never names or orders a person: a class without a class teacher is a class.

export const AUDITOR_RULE_VERSION = 1;
// Who runs and reads a check-up. The database holds the same two roles (the school_health_runs policies).
export const AUDITOR_ROLES: readonly string[] = ['principal', 'school_admin'];
// The weekly check-up (C210): the same check-up, queued early each Monday in India for every school with the auditor
// on, run in the school's own session as its office sees it, with no person. The day's record says so.
export const WEEKLY_CHECK_UP_JOB = 'auditor.weekly';

// The Monday of the week a date is in (weeks begin on Monday, as the weekly check-up's are queued).
export function weekStart(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
}

// The twelve checks of rule version 1 (docs/26 section 5, "Auditor v1 checks"), in the order they are listed there.
export const CHECK_IDS = [
  'class_teacher', 'student_guardian', 'guardian_phone', 'consent', 'attendance_marked', 'timetable_filled',
  'fee_structure', 'overdue_followed_up', 'messages_held', 'message_budget', 'complaints_overdue', 'leave_waiting',
] as const;
export type CheckId = (typeof CHECK_IDS)[number];
export const isCheckId = (v: unknown): v is CheckId => typeof v === 'string' && (CHECK_IDS as readonly string[]).includes(v);

export const CHECK_STATES = ['passes', 'needs_attention', 'not_set_up', 'could_not_check'] as const;
export type CheckState = (typeof CHECK_STATES)[number];
const isCheckState = (v: unknown): v is CheckState => typeof v === 'string' && (CHECK_STATES as readonly string[]).includes(v);

// The numbers the rules of version 1 are written with. The rule sentences in the message files say the same
// numbers in words; a test holds the two together.
export const ATTENDANCE_WORKING_DAYS = 5;
export const OVERDUE_MORE_THAN_DAYS = 30;
export const HELD_IN_LAST_DAYS = 7;
export const LEAVE_WAITED_MORE_THAN_DAYS = 2;

// What is fixed about a check: the module it belongs to (switched off, the check says "not set up"), and the
// screen where the thing is set up. A check that needs attention carries its own address, which may be this
// screen or a narrower list of exactly the rows it counted.
//
// class_teacher opens the list of classes (Students, "Manage classes", opened by ?classes=1), where the principal
// and the school admin choose each class's class teacher (C210).
export type CheckMeta = { moduleId: ModuleId; screen: string };
export const CHECK_META: Record<CheckId, CheckMeta> = {
  class_teacher: { moduleId: 'students', screen: '/app/students?classes=1' },
  student_guardian: { moduleId: 'students', screen: '/app/students' },
  guardian_phone: { moduleId: 'parents', screen: '/app/parents' },
  consent: { moduleId: 'students', screen: '/app/students' },
  attendance_marked: { moduleId: 'attendance', screen: '/app/attendance' },
  timetable_filled: { moduleId: 'timetable', screen: '/app/timetable' },
  fee_structure: { moduleId: 'fees', screen: '/app/fees' },
  overdue_followed_up: { moduleId: 'fees', screen: '/app/fees' },
  messages_held: { moduleId: 'communication', screen: '/app/communication' },
  message_budget: { moduleId: 'communication', screen: '/app/communication' },
  complaints_overdue: { moduleId: 'complaints', screen: '/app/complaints' },
  leave_waiting: { moduleId: 'staff', screen: '/app/staff' },
};

// What one check said. `count` only when it needs attention. `href`: the screen that fixes it (needs attention)
// or where to set it up (not set up). `off`: "not set up" because the check's module is switched off.
export type CheckResult = { id: CheckId; state: CheckState; count: number | null; href: string | null; off?: true };

export type CheckSummary = { passed: number; applicable: number; attention: number; notSetUp: number; notChecked: number };
export function summarise(results: readonly Pick<CheckResult, 'state'>[]): CheckSummary {
  const n = (state: CheckState) => results.filter((r) => r.state === state).length;
  const notSetUp = n('not_set_up');
  return { passed: n('passes'), applicable: results.length - notSetUp, attention: n('needs_attention'), notSetUp, notChecked: n('could_not_check') };
}

// One check-up: India's date, the version of the rules, what each check said, and the result in two numbers.
export type CheckUp = { date: string; ruleVersion: number; results: CheckResult[]; passed: number; applicable: number };
// A check-up as it is kept and read back: with when it was recorded and by whom (a person, or the weekly check-up).
export type StoredCheckUp = CheckUp & { recordedAt: string; recordedBy: string | null; byWeeklyCheckUp?: boolean };
// One line of the trend.
export type CheckUpLine = { date: string; ruleVersion: number; passed: number; applicable: number };

// An address inside the school app, and nothing else: what a stored result's link is held to when it is read back.
const APP_ADDRESS = /^\/app\/[A-Za-z0-9\-_/]*(\?[A-Za-z0-9\-_=&.%]*)?$/;
export const isAppAddress = (v: unknown): v is string => typeof v === 'string' && v.length <= 300 && APP_ADDRESS.test(v);

// The stored results, read back with care: only the checks this version knows, only the four states, a whole
// number for a count, and only an address of the app for a link. Anything else in the column is left out.
export function readResults(raw: unknown): CheckResult[] {
  if (!Array.isArray(raw)) return [];
  const out: CheckResult[] = [];
  for (const item of raw as unknown[]) {
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;
    if (!isCheckId(r.id) || !isCheckState(r.state) || out.some((x) => x.id === r.id)) continue;
    const count = r.state === 'needs_attention' && typeof r.count === 'number' && Number.isInteger(r.count) && r.count > 0 ? r.count : null;
    if (r.state === 'needs_attention' && count === null) continue;
    out.push({ id: r.id, state: r.state, count, href: isAppAddress(r.href) ? r.href : null, ...(r.off === true && r.state === 'not_set_up' ? { off: true as const } : {}) });
  }
  return out;
}

// The message keys of a check (`aud.check.<id>.…` in the message files):
//   title   the check, as the sentence that should be true
//   rule    the rule: what is counted
//   where   where it is counted
//   todo    what was found, with its count (`.one` / `.other`); none for a check that can only pass or be not set up
//   do      what to do about it
//   open    the button to the screen
//   setup   what to set up first, when it is "not set up"
export const checkKey = (id: CheckId, part: 'title' | 'rule' | 'where' | 'todo' | 'do' | 'open' | 'setup') => `aud.check.${id}.${part}`;
// The checks that can need attention (message_budget is set or it is not).
export const CHECKS_WITH_A_COUNT: readonly CheckId[] = CHECK_IDS.filter((id) => id !== 'message_budget');
