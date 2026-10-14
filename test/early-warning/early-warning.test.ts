import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { helpArticle } from '@/content/help/articles';
import { inSchoolRate, presentRate } from '@/lib/attendance/day';
import { MODULE_REGISTRY, moduleById, type SchoolRole } from '@/lib/contracts/modules';
import { TOURS } from '@/lib/contracts/tours';
import { addAction, attendanceSignal, classSummary, earlyWarningSettings, lastCheck, listFlags, readAttendance, runCheck, windowFrom } from '@/lib/early-warning/early-warning';
import { ACTION_KINDS, ACTION_TEXT_MAX, CLOSED_REASONS, DEFAULT_SETTINGS, EARLY_WARNING_RULE_VERSION, REASONS, openEmptyState, type LastCheck } from '@/lib/early-warning/rules';
import { workingModules } from '@/lib/frameworks/plans';
import { applySettingsUpdate } from '@/lib/frameworks/settings-engine';
import { settingsSchemaFor } from '@/lib/frameworks/settings-schemas';
import { saveSettings } from '@/lib/frameworks/settings-store';
import { readModuleFor, writeModuleFor } from '@/lib/frameworks/write-guard';
import { t } from '@/lib/i18n';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';
import { findCandidates, windowStart } from '@/lib/recovery/recovery';
import { indiaDate } from '@/lib/time/india';
import { TODAY_PROVIDERS } from '@/lib/today/cards';
import { TEMPLATE_REGISTRY } from '@/lib/whatsapp/templates';

// Early Warning v1 (docs/26 slice 8j, C209). The acceptance test: "A flag stores its reasons, evidence and rule
// version and closes when the signal clears. A teacher reads only their own classes' flags. Whatever the school's
// switch or a child's consent, no message is written for a parent." Proven on the whole schema as the app's own
// database role, through the app's code and by going to the database directly. Every name is made up.

const state = vi.hoisted(() => ({ claims: null as unknown, tenant: null as unknown }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/server-session', () => ({ getServerSession: async () => state.claims }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => (state.tenant as any)(claims, fn),
}));
vi.mock('@/lib/i18n/server', () => ({ getLang: () => ({ lang: 'en' }) }));

import { GET as getScreen, POST as postCheck } from '@/app/api/app/early-warning/route';
import { POST as postAction } from '@/app/api/app/early-warning/[flagId]/actions/route';
import EarlyWarningPage from '@/app/(school)/app/early-warning/page';
import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';

const ROOT = path.resolve(__dirname, '../..');
const A = 'e7000000-0000-4000-8000-000000000001';
const B = 'e7000000-0000-4000-8000-000000000002';
const u = (n: number) => `e7000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [PRINCIPAL, ADMIN, COORDINATOR, TARA, TARUN, ACCOUNTANT, B_PRINCIPAL] = [u(11), u(12), u(13), u(14), u(15), u(16), u(21)];
// An account made at school B that also signs in to school A, as its principal, through a membership there (an
// approved application attaches an account that already exists; its home school stays as it was).
const VISITING_PRINCIPAL = u(31);
const [C5A, C6B] = [u(51), u(52)];
const MATHS = u(60);
// 5-A (Tara's): Asha, Bela, Chirag, Dev; Esha is waiting for consent; Ishan has left. 6-B (Tarun's): Farah, Gopal,
// Hina. Jaya is active and in no class.
const [ASHA, BELA, CHIRAG, DEV, ESHA, ISHAN, FARAH, GOPAL, HINA, JAYA] = [u(101), u(102), u(103), u(104), u(105), u(106), u(107), u(108), u(109), u(110)];

// India's day. Every check in the library's own tests is run at a minute of that day's noon, so the day cannot
// turn over half way through a test.
const TODAY = indiaDate();
const NOON = new Date(`${TODAY}T12:00:00+05:30`);
const at = (minutes: number) => new Date(NOON.getTime() + minutes * 60_000);
// India's date n days before today.
const day = (back: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - back * 86_400_000).toISOString().slice(0, 10);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school?: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const coordinator: Who = { role: 'academic_coordinator', user: COORDINATOR };
const tara: Who = { role: 'teacher', user: TARA };
const tarun: Who = { role: 'teacher', user: TARUN };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
const elsewhere: Who = { role: 'principal', user: B_PRINCIPAL, school: B };
const visiting: Who = { role: 'principal', user: VISITING_PRINCIPAL };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school ?? A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const actor = (who: Who) => ({ schoolId: who.school ?? A, userId: who.user, role: who.role as never });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result = { rows: any[]; rowCount: number };
// One statement, straight to the database, as that person.
const run = (who: Who, sql: string, params: unknown[] = []) => as<Result>(who, (c) => c.query(sql, params));
const modulesOf = (role: SchoolRole) => MODULE_REGISTRY.filter((m) => m.roles.includes(role)).map((m) => m.id);
const check = (who: Who, minute: number) => as(who, (c) => runCheck(c, actor(who), at(minute)));

// One mark a day, going back from `from` days ago: P present, L late, A absent, V on recorded leave.
const MARK: Record<string, string> = { P: 'present', L: 'late', A: 'absent', V: 'leave' };
const marks = (student: string, cls: string, days: string, from = 1) =>
  [...days].map((m, i) => `('${A}', '${student}', '${cls}', '${day(from + i)}', '${MARK[m]}', '${TARA}', ${m === 'V' ? `'sick'` : 'null'})`);
const mark = (student: string, cls: string, back: number, status: string) =>
  db.pg.query(`insert into attendance (school_id, student_id, class_id, date, status, marked_by) values ($1, $2, $3, $4, $5, $6) on conflict (school_id, student_id, date) do update set status = excluded.status`, [A, student, cls, day(back), status, TARA]);
// One homework for 5-A due `back` days ago, with who did not do it and who did.
const homework = (n: number, back: number, notDone: string[], done: string[] = []) => `
  insert into homework (homework_id, school_id, subject_id, title, due_date, created_by) values ('${u(700 + n)}', '${A}', '${MATHS}', 'Fractions worksheet ${n}', '${day(back)}', '${TARA}');
  insert into homework_targets (target_id, school_id, homework_id, class_id, title, due_date, assigned_at) values ('${u(800 + n)}', '${A}', '${u(700 + n)}', '${C5A}', 'Fractions worksheet ${n}', '${day(back)}', '${day(back + 1)}T10:00:00+05:30');
  ${[...notDone.map((s) => [s, false] as const), ...done.map((s) => [s, true] as const)].map(([s, isDone]) => `insert into homework_status (school_id, target_id, class_id, student_id, done, checked_by) values ('${A}', '${u(800 + n)}', '${C5A}', '${s}', ${isDone}, '${TARA}');`).join('\n  ')}`;
const followUp = (n: number, student: string, cls: string, kind: string, source: string, back: number, done = false) =>
  `('${u(900 + n)}', '${A}', '${student}', '${cls}', '${kind}', '${source}', '${done ? 'done' : 'open'}', ${source === 'staff' ? `'${TARA}'` : 'null'}, ${done ? `'${TARA}', now(), 'Sat with him after class.'` : 'null, null, null'}, '${day(back)}T10:00:00+05:30')`;

// The school's rows as every test starts from them. By hand, with the defaults (in school on fewer than 75 of
// every 100 days over the last 30 days, counted only from ten days; three homeworks not done in ten school days):
//   Asha    7 present, 3 absent                          → 70 of 100 over 10 days: ATTENDANCE
//   Bela    4 present, 5 absent: only 9 days             → no attendance reason; 3 homeworks not done: HOMEWORK
//   Chirag  8 present, 1 late, 3 absent                  → 75 of 100: on the line, not below it. Three more absences
//                                                          lie 30 to 32 days back, outside the 30 days. An open
//                                                          "missed the class" follow-up is not a needs-help reason.
//   Dev     8 present, 2 absent, 4 on leave              → 80 of 100 over 10 days (leave left out): nothing. His
//                                                          "homework help" follow-up is done, not open.
//   Esha    waiting for consent: 10 absent, 3 homeworks not done, an open follow-up → never flagged
//   Ishan   has left the school: 10 absent                → not looked at
//   Farah   10 present; an open "did not understand" follow-up from a parent's reply → NEEDS HELP
//   Gopal   7 present, 3 absent, 5 on leave              → 70 of 100 over 10 days: ATTENDANCE; and an open
//                                                          "homework help" follow-up: NEEDS HELP
//   Hina    5 present, 3 absent, 4 on leave              → only 8 days once leave is left out: nothing
//   Jaya    in no class: an open follow-up                → not looked at
const seedRows = () =>
  db.pg.exec(`
    set session_replication_role = replica;
    delete from early_warning_actions; delete from early_warning_flags;
    delete from audit_log where event_action like 'early_warning.%' or event_action = 'settings.changed';
    delete from attendance where school_id = '${A}'; delete from homework_status where school_id = '${A}'; delete from homework_targets where school_id = '${A}'; delete from homework where school_id = '${A}';
    delete from recovery_plans where school_id = '${A}'; delete from pulse_followups where school_id = '${A}';
    delete from school_setting_changes where school_id = '${A}'; delete from school_settings where school_id = '${A}';
    update students set status = 'active', class_id = '${C6B}' where student_id = '${FARAH}';
    update schools set at_risk_parent_dispatch_enabled = false where school_id = '${A}';
    insert into attendance (school_id, student_id, class_id, date, status, marked_by, leave_code) values
      ${[
        ...marks(ASHA, C5A, 'AAAPPPPPPP'),
        ...marks(BELA, C5A, 'AAAAAPPPP'),
        ...marks(CHIRAG, C5A, 'AAAPPPPPPPPL'),
        ...marks(CHIRAG, C5A, 'AAA', 30),
        ...marks(DEV, C5A, 'AAVVVVPPPPPPPP'),
        ...marks(ESHA, C5A, 'AAAAAAAAAA'),
        ...marks(ISHAN, C5A, 'AAAAAAAAAA'),
        ...marks(FARAH, C6B, 'PPPPPPPPPP'),
        ...marks(GOPAL, C6B, 'AAAVVVVVPPPPPPP'),
        ...marks(HINA, C6B, 'AAAVVVVPPPPP'),
      ].join(',\n      ')};
    ${homework(1, 4, [BELA, ESHA], [ASHA])}
    ${homework(2, 3, [BELA, ESHA], [ASHA])}
    ${homework(3, 2, [BELA, ESHA], [ASHA])}
    insert into pulse_followups (followup_id, school_id, student_id, class_id, kind, source, status, created_by, decided_by, decided_at, outcome, created_at) values
      ${followUp(1, FARAH, C6B, 'did_not_understand', 'parent_reply', 2)}, ${followUp(2, GOPAL, C6B, 'homework_help', 'staff', 1)}, ${followUp(3, CHIRAG, C5A, 'missed_class', 'staff', 1)},
      ${followUp(4, DEV, C5A, 'homework_help', 'staff', 5, true)}, ${followUp(5, ESHA, C5A, 'did_not_understand', 'staff', 1)}, ${followUp(6, JAYA, C5A, 'did_not_understand', 'staff', 1)};
    set session_replication_role = origin;
  `);

// What each reason must rest on, worked out by hand from the rows above.
const FROM = day(29);
const EVIDENCE = {
  asha: { attendance: { from: FROM, to: TODAY, present: 7, late: 0, absent: 3, leave: 0, counted: 10, rate: 70, below: 75, minDays: 10, absentDates: [day(3), day(2), day(1)] } },
  bela: () => ({
    homework: {
      from: windowStart(TODAY, 10),
      to: TODAY,
      notDone: 3,
      threshold: 3,
      schoolDays: 10,
      missed: [1, 2, 3].map((n) => ({ title: `Fractions worksheet ${n}`, subject: 'Mathematics', dueDate: day(5 - n) })),
    },
  }),
  farah: { needs_help: { open: [{ kind: 'did_not_understand', since: day(2), source: 'parent_reply' }] } },
  gopal: {
    attendance: { from: FROM, to: TODAY, present: 7, late: 0, absent: 3, leave: 5, counted: 10, rate: 70, below: 75, minDays: 10, absentDates: [day(3), day(2), day(1)] },
    needs_help: { open: [{ kind: 'homework_help', since: day(1), source: 'staff' }] },
  },
};

type Stored = { flag_id: string; name: string; class_id: string; reasons: string[]; evidence: Record<string, unknown>; rule_version: number; opened_by: string; closed: boolean; closed_reason: string | null; closed_by: string | null; notified_parent: boolean; detected_at: Date; checked_at: Date };
// The rows as they are, read by the owner of the database (no role, no policy).
const stored = async (): Promise<Stored[]> =>
  (await db.pg.query(
    `select f.flag_id, s.name, f.class_id, f.reasons, f.evidence, f.rule_version, f.opened_by, f.resolved_at is not null as closed, f.closed_reason, f.closed_by, f.notified_parent, f.detected_at, f.checked_at
       from early_warning_flags f join students s on s.student_id = f.student_id where f.school_id = $1 order by s.name, f.detected_at, f.flag_id`,
    [A]
  )).rows;
const openFlag = async (name: string) => (await stored()).find((f) => f.name === name && !f.closed)!;
const sentOrQueued = async () => (await db.pg.query(`select (select count(*)::int from communication_log) as messages, (select count(*)::int from jobs) as jobs`)).rows[0];
// What a role reads when it goes to the table itself.
const reads = async (who: Who) => (await run(who, `select s.name from early_warning_flags f join students s on s.school_id = f.school_id and s.student_id = f.student_id order by s.name`)).rows.map((r: { name: string }) => r.name);
const PUT_FLAG = `insert into early_warning_flags (school_id, student_id, class_id, reasons, evidence, rule_version, opened_by) values ($1, $2, $3, $4::text[], $5::jsonb, 1, $6)`;
const NEEDS_HELP = JSON.stringify({ needs_help: { open: [] } });

describe('the rule, with no database', () => {
  it('attendance is a reason below the school’s line, only from enough days, with leave left out of both sides', () => {
    const window = { from: '2026-09-15', to: '2026-10-14' };
    const of = (present: number, late: number, absent: number, leave = 0) => attendanceSignal({ present, late, absent, leave, absentDates: [] }, window, DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({ attendanceBelow: 75, windowDays: 30, minMarkedDays: 10 });
    expect(of(7, 0, 3)).toMatchObject({ rate: 70, counted: 10, below: 75, minDays: 10, from: '2026-09-15', to: '2026-10-14' });
    // Late is in school.
    expect(of(5, 2, 3)).toMatchObject({ rate: 70, present: 5, late: 2 });
    // On the line is not below it.
    expect(of(9, 0, 3)).toBeNull();
    expect(of(15, 0, 5)).toBeNull();
    expect(of(14, 0, 6)).toMatchObject({ rate: 70 });
    // Nine days say nothing yet, however many were missed.
    expect(of(0, 0, 9)).toBeNull();
    expect(of(4, 0, 5)).toBeNull();
    // A day on recorded leave is neither a day in school nor a day away: 8 of 10, not 8 of 14.
    expect(of(8, 0, 2, 4)).toBeNull();
    expect(of(7, 0, 3, 20)).toMatchObject({ rate: 70, leave: 20, counted: 10 });
    // And leave does not help reach the ten days.
    expect(of(5, 0, 3, 12)).toBeNull();
    // No mark at all.
    expect(of(0, 0, 0)).toBeNull();
  });

  it('"cannot be judged" is kept apart from "not below the line": too few days is neither a reason nor an all-clear', () => {
    const window = { from: '2026-09-15', to: '2026-10-14' };
    const read = (present: number, late: number, absent: number, leave = 0) => readAttendance({ present, late, absent, leave, absentDates: [] }, window, DEFAULT_SETTINGS);
    expect(read(7, 0, 3)).toMatchObject({ is: 'below', evidence: { rate: 70, counted: 10 } });
    expect(read(9, 0, 3)).toEqual({ is: 'not_below' });
    expect(read(10, 0, 0)).toEqual({ is: 'not_below' });
    // Five days, nine days, no day, ten days of which six on leave: none of them can be judged, whatever they hold.
    expect(read(2, 0, 3)).toEqual({ is: 'too_few', counted: 5 });
    expect(read(9, 0, 0)).toEqual({ is: 'too_few', counted: 9 });
    expect(read(0, 0, 0)).toEqual({ is: 'too_few', counted: 0 });
    expect(read(4, 0, 0, 6)).toEqual({ is: 'too_few', counted: 4 });
  });

  it('the line is compared exactly, never after rounding: a child just below it is not missed', () => {
    const window = { from: '2026-07-17', to: '2026-10-14' };
    const settings = { attendanceBelow: 72, windowDays: 90, minMarkedDays: 10 };
    const of = (present: number, absent: number) => attendanceSignal({ present, late: 0, absent, leave: 0, absentDates: [] }, window, settings);
    // In school on 59 of 82 days is 71.95 of every 100: below 72, though to one decimal it rounds to 72.
    expect(inSchoolRate({ present: 59, late: 0, absent: 23 })).toBe(72);
    expect(of(59, 23)).toMatchObject({ present: 59, absent: 23, counted: 82, below: 72 });
    // The rate a flag says is never the line it is below: it is cut to one decimal here, not rounded up.
    expect(of(59, 23)!.rate).toBe(71.9);
    // Exactly on the line is still not below it (18 of 25 is 72), and well below is rounded as before.
    expect(of(18, 7)).toBeNull();
    expect(of(4, 5)).toBeNull(); // nine days: too few
    expect(of(5, 6)!.rate).toBe(45.5);
  });

  it('an empty list is an all-clear only when attendance could be used for every child the check looked at', () => {
    const last = (students: number, attendanceUsed: number | null): LastCheck => ({ at: '2026-10-14T06:30:00.000Z', by: 'Priya Principal', ruleVersion: 1, students, attendanceUsed, minDays: 10, windowDays: 30, opened: 0, closed: 0, open: 0 });
    expect(openEmptyState(false, null)).toBe('teacher');
    expect(openEmptyState(true, null)).toBe('never');
    expect(openEmptyState(true, last(7, 7))).toBe('none');
    // Some children, or all of them, had too few days marked: the screen says so and gives no all-clear.
    expect(openEmptyState(true, last(7, 5))).toBe('partial');
    expect(openEmptyState(true, last(7, 0))).toBe('no_attendance');
    // A school with no active student of a class has nothing to say about attendance.
    expect(openEmptyState(true, last(0, 0))).toBe('none');
    for (const state of ['never', 'none', 'partial', 'no_attendance', 'teacher'] as const) for (const all of [en, hi] as Record<string, string>[]) for (const part of ['title', 'do'] as const) expect(all[`ew.open.empty.${state}.${part}`], `${state} ${part}`).toBeTruthy();
    expect(t('en', 'ew.open.empty.no_attendance.do', { min: 10, days: 30 })).toContain('could not use attendance for any child');
    expect(t('en', 'ew.open.empty.partial.do', { used: 5, students: 7, min: 10, days: 30 })).toContain('5 of the 7');
    // Only the state in which every child could be judged says that no reason was found for any child.
    for (const state of ['partial', 'no_attendance'] as const) expect(t('en', `ew.open.empty.${state}.do` as never, { used: 5, students: 7, min: 10, days: 30 })).not.toContain('no reason to look at any child.');
    expect(t('en', 'ew.open.empty.none.do')).toContain('no reason to look at any child.');
    // Why a flag closed: two reasons, and "too few days were marked" is not one of them, because it closes nothing.
    expect(CLOSED_REASONS).toEqual(['signals_cleared', 'not_active']);
  });

  it('"in school out of the days not on leave" is its own rate beside the school’s present rate', () => {
    expect(inSchoolRate({ present: 8, late: 0, absent: 2 })).toBe(80);
    expect(inSchoolRate({ present: 6, late: 1, absent: 3 })).toBe(70);
    expect(inSchoolRate({ present: 2, late: 0, absent: 1 })).toBe(66.7);
    expect(inSchoolRate({ present: 0, late: 0, absent: 0 })).toBeNull();
    // The present rate keeps a leave day among the marked days; this one does not.
    expect(presentRate({ present: 8, late: 0, absent: 2, leave: 4 })).toBe(57.1);
  });

  it('the window is whole days, today included', () => {
    expect(windowFrom('2026-10-14', 30)).toBe('2026-09-15');
    expect(windowFrom('2026-10-14', 1)).toBe('2026-10-14');
    expect(windowFrom('2026-03-05', 7)).toBe('2026-02-27');
  });

  it('three reasons and no other: fees and marks are not among them', () => {
    expect(REASONS).toEqual(['attendance', 'homework', 'needs_help']);
    expect(EARLY_WARNING_RULE_VERSION).toBe(1);
    expect(ACTION_KINDS).toEqual(['talked_to_student', 'spoke_to_guardian', 'extra_help', 'other']);
  });
});

describe('the registry and the words', () => {
  it('Early Warning is partly live for those who teach or run the school, never for the accountant', () => {
    const m = moduleById('early-warning');
    expect(m).toMatchObject({ status: 'partial', teacherScope: 'ownClassesOnly' });
    for (const part of ['staff only', 'marks join in P6', 'nothing is sent to parents']) expect(m.phaseNote, part).toContain(part);
    expect(workingModules()).toContain('early-warning');
    for (const role of ['principal', 'school_admin', 'academic_coordinator', 'teacher'] as const) expect(modulesOf(role), role).toContain('early-warning');
    expect(modulesOf('accountant')).not.toContain('early-warning');
    for (const lang of ['en', 'hi'] as const) expect(t(lang, 'moduleOff.early-warning').length, lang).toBeLessThanOrEqual(200);
    expect(t('hi', 'moduleOff.early-warning')).toMatch(/[ऀ-ॿ]/);
  });

  it('its routes are guarded as Early Warning, it has a tour, a guide and its settings', () => {
    const id = '9b2e7c1a-5d43-4f0e-8a6b-1c2d3e4f5a6b';
    expect(writeModuleFor('/api/app/early-warning')).toBe('early-warning');
    expect(writeModuleFor(`/api/app/early-warning/${id}/actions`)).toBe('early-warning');
    expect(readModuleFor('/api/app/early-warning')).toBe('early-warning');
    expect(TOURS['early-warning'].steps).toHaveLength(3);
    const guide = helpArticle('early-warning-flags')!;
    expect(guide.start?.href).toBe('/app/early-warning');
    for (const slug of guide.related) expect(helpArticle(slug), slug).toBeTruthy();
    const schema = settingsSchemaFor('early-warning')!;
    expect(schema.fields.map((f) => [f.key, f.default, [...f.editableBy]])).toEqual([
      ['attendance_below', 75, ['principal', 'school_admin']],
      ['window_days', 30, ['principal', 'school_admin']],
      ['min_marked_days', 10, ['principal', 'school_admin']],
    ]);
    for (const f of schema.fields) for (const part of ['label', 'help'] as const) for (const lang of ['en', 'hi'] as const) expect(t(lang, `set.early-warning.${f.key}.${part}` as never), `${lang} ${f.key} ${part}`).toBeTruthy();
  });

  it('the words are kind and plain: a flag is a reason to look, and no word judges a child', () => {
    const mine = (all: Record<string, string>) => Object.entries(all).filter(([k]) => /^(ew\.|today\.flags-|tour\.early-warning\.|moduleOff\.early-warning$|set\.early-warning\.)/.test(k));
    expect(mine(en).length).toBeGreaterThan(90);
    expect(mine(hi).map(([k]) => k)).toEqual(mine(en).map(([k]) => k));
    const guide = helpArticle('early-warning-flags')!;
    const english = [...mine(en).map(([, v]) => v), guide.title.en, guide.summary.en, ...guide.steps.map((s) => s.en), ...(guide.tips ?? []).map((s) => s.en)];
    const hindi = [...mine(hi).map(([, v]) => v), guide.title.hi, guide.summary.hi, ...guide.steps.map((s) => s.hi), ...(guide.tips ?? []).map((s) => s.hi)];
    for (const words of english) expect(words).not.toMatch(/\b(weak|poor|bad|fail(s|ed|ing|ure)?|lazy|slow|careless|defaulter|worst|at[- ]risk|problem child)\b/i);
    for (const words of hindi) expect(words).not.toMatch(/कमज़ोर|कमजोर|ख़राब|खराब|बुरा|फेल|नाकाम|लापरवाह|फिसड्डी/);
    expect(t('en', 'ew.what.text')).toContain('not a verdict');
    expect(t('en', 'ew.what.staffOnly')).toContain('Nothing on this page is sent to a parent');
    expect(t('en', 'ew.what.order')).toContain('None of them is a ranking');
    // Every refusal the screen can show, and every kind of step, has its words in both languages.
    for (const lang of ['en', 'hi'] as const) {
      for (const code of ['kind', 'note', 'outcome', 'say_what', 'elsewhere', 'other']) expect(t(lang, `ew.err.${code}` as never, { max: ACTION_TEXT_MAX }), `${lang} ${code}`).toBeTruthy();
      for (const kind of ACTION_KINDS) expect(t(lang, `ew.kind.${kind}` as never), `${lang} ${kind}`).toBeTruthy();
      for (const reason of REASONS) expect(t(lang, `ew.reason.${reason}` as never), `${lang} ${reason}`).toBeTruthy();
      for (const type of ['flags-no-action', 'flags-own-classes']) for (const part of ['todo.one', 'todo.other', 'action', 'why']) expect(t(lang, `today.${type}.${part}` as never), `${lang} ${type} ${part}`).toBeTruthy();
    }
  });

  it('nothing in this slice can reach a parent: no sender, no queue, no template, and the school’s switch is read nowhere', () => {
    const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(path.join(dir, f)).isDirectory() ? files(path.join(dir, f)) : [path.join(dir, f)]));
    const mine = ['src/lib/early-warning', 'src/app/api/app/early-warning', 'src/components/early-warning', 'src/app/(school)/app/early-warning'].flatMap((d) => files(path.join(ROOT, d)));
    expect(mine.length).toBeGreaterThanOrEqual(6);
    for (const file of mine) {
      const source = readFileSync(file, 'utf8');
      // No sender, no queue, no consent gate to pass, and no language model (rules only).
      expect(source, file).not.toMatch(/from '@\/lib\/(whatsapp|jobs|pulse|communication|consent|ai|copilot|parent-ai)/);
      expect(source, file).not.toMatch(/insert into (communication_log|jobs)|sendWhatsApp|enqueue|dispatch_enabled|notified_parent\s*=|set\s+notified_parent/i);
    }
    // No message template is for telling a parent about a flag.
    expect(TEMPLATE_REGISTRY.filter((d) => (d.purpose as string) === 'at_risk')).toEqual([]);
    expect(TEMPLATE_REGISTRY.filter((d) => /risk|warning|flag/i.test(d.name))).toEqual([]);
    // The migration adds no job type, no schedule and no template. It is found by its name's end: its first
    // part is the version the database recorded.
    const dir = path.join(ROOT, 'supabase/migrations');
    const sql = readFileSync(path.join(dir, readdirSync(dir).find((f) => f.endsWith('_p5_early_warning.sql'))!), 'utf8').replace(/^\s*--.*$/gm, '');
    expect(sql).not.toMatch(/jobs_enqueue|insert into jobs|cron\.|whatsapp_templates|communication_log/);
    expect(sql).toContain('check (notified_parent = false)');
  });

  it('the lists are by class and name, and the code holds no score or order of children, classes or teachers', () => {
    const source = readFileSync(path.join(ROOT, 'src/lib/early-warning/early-warning.ts'), 'utf8');
    expect(source).toContain('order by (f.resolved_at is not null), c.name, c.section, c.class_id, s.name, s.student_id');
    expect(source).toContain('order by c.name, c.section, c.class_id');
    for (const file of ['src/lib/early-warning/early-warning.ts', 'src/lib/early-warning/rules.ts', 'src/components/early-warning/EarlyWarningView.tsx']) expect(readFileSync(path.join(ROOT, file), 'utf8'), file).not.toMatch(/\bscore\b|\bleaderboard\b|\btop \d|\bworst\b/i);
  });
});

describe('on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    // Triggers and foreign keys are off while the people and classes go in (a student starts as waiting for
    // consent otherwise); the checks still hold.
    await db.pg.exec(`
      set session_replication_role = replica;
      insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
      insert into users (user_id, school_id, email, role, display_name, is_active) values
        ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal', true), ('${ADMIN}', '${A}', 'admin@school-a.example', 'school_admin', 'Asif Admin', true),
        ('${COORDINATOR}', '${A}', 'coordinator@school-a.example', 'academic_coordinator', 'Chitra Coordinator', true), ('${TARA}', '${A}', 'tara@school-a.example', 'teacher', 'Tara Teacher', true),
        ('${TARUN}', '${A}', 'tarun@school-a.example', 'teacher', 'Tarun Teacher', true), ('${ACCOUNTANT}', '${A}', 'accounts@school-a.example', 'accountant', 'Anil Accountant', true),
        ('${B_PRINCIPAL}', '${B}', 'principal@school-b.example', 'principal', 'Bela Principal', true), ('${VISITING_PRINCIPAL}', '${B}', 'parul@school-b.example', 'principal', 'Parul Visiting', true);
      insert into memberships (user_id, school_id, role, is_active) values ('${VISITING_PRINCIPAL}', '${A}', 'principal', true) on conflict (user_id, school_id) do nothing;
      insert into school_module_entitlements (school_id, module_id, enabled, source) values ('${A}', 'early-warning', true, 'plan'), ('${A}', 'recovery', true, 'plan'), ('${A}', 'setup', true, 'plan');
      insert into classes (class_id, school_id, name, class_teacher_id) values ('${C5A}', '${A}', '5-A', '${TARA}'), ('${C6B}', '${A}', '6-B', '${TARUN}');
      insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Mathematics');
      insert into students (student_id, school_id, admission_no, name, status, class_id) values
        ('${ASHA}', '${A}', 'A-1', 'Asha', 'active', '${C5A}'), ('${BELA}', '${A}', 'A-2', 'Bela', 'active', '${C5A}'), ('${CHIRAG}', '${A}', 'A-3', 'Chirag', 'active', '${C5A}'), ('${DEV}', '${A}', 'A-4', 'Dev', 'active', '${C5A}'),
        ('${ESHA}', '${A}', 'A-5', 'Esha', 'pending_consent', '${C5A}'), ('${ISHAN}', '${A}', 'A-6', 'Ishan', 'inactive', '${C5A}'),
        ('${FARAH}', '${A}', 'A-7', 'Farah', 'active', '${C6B}'), ('${GOPAL}', '${A}', 'A-8', 'Gopal', 'active', '${C6B}'), ('${HINA}', '${A}', 'A-9', 'Hina', 'active', '${C6B}'), ('${JAYA}', '${A}', 'A-10', 'Jaya', 'active', null);
      -- Each flagged child has a guardian who could be written to, and consent for exactly that.
      insert into parents (parent_id, school_id, name, phone) values ('${u(201)}', '${A}', 'Anita Sharma', '9000000001'), ('${u(202)}', '${A}', 'Gita Verma', '9000000002');
      insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${u(201)}', '${ASHA}'), ('${A}', '${u(202)}', '${GOPAL}');
      insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version)
        select '${A}', s, p::consent_purpose, true, (enum_range(null::consent_method))[1], 'v1' from unnest(array['${ASHA}'::uuid, '${BELA}'::uuid, '${FARAH}'::uuid, '${GOPAL}'::uuid]) s, unnest(array['core_records', 'operational_communication', 'at_risk']) p;
      set session_replication_role = origin;
    `);
    await seedRows();
    state.tenant = (claims: { role: string; sub: string; schoolId: string }, fn: (c: unknown) => Promise<unknown>) => as({ role: claims.role, user: claims.sub, school: claims.schoolId }, fn);
  }, 120_000);
  afterAll(async () => db?.stop());

  describe('a flag stores its reasons, evidence and rule version', () => {
    it('each signal alone opens a flag, and two signals open one flag with both', async () => {
      await seedRows();
      expect(await check(principal, 0)).toEqual({ ok: true, students: 7, attendanceUsed: 5, opened: 4, changed: 0, kept: 0, closed: 0, open: 4 });
      const rows = await stored();
      expect(rows.map((f) => [f.name, f.reasons])).toEqual([['Asha', ['attendance']], ['Bela', ['homework']], ['Farah', ['needs_help']], ['Gopal', ['attendance', 'needs_help']]]);
      expect(rows[0].evidence).toEqual(EVIDENCE.asha);
      expect(rows[1].evidence).toEqual(EVIDENCE.bela());
      expect(rows[2].evidence).toEqual(EVIDENCE.farah);
      expect(rows[3].evidence).toEqual(EVIDENCE.gopal);
      for (const f of rows) {
        expect(f, f.name).toMatchObject({ rule_version: EARLY_WARNING_RULE_VERSION, opened_by: PRINCIPAL, closed: false, closed_reason: null, closed_by: null, notified_parent: false });
        expect(new Date(f.detected_at).toISOString(), f.name).toBe(at(0).toISOString());
        expect(new Date(f.checked_at).toISOString(), f.name).toBe(at(0).toISOString());
      }
      // The child's class when flagged: what a teacher's reading rests on.
      expect(rows.map((f) => f.class_id)).toEqual([C5A, C5A, C6B, C6B]);
      // The check is a person's act, on the record without any child's name.
      const audit = (await db.pg.query(`select actor_user_id, actor_role, after_state from audit_log where school_id = $1 and event_action = 'early_warning.checked'`, [A])).rows;
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ actor_user_id: PRINCIPAL, actor_role: 'principal', after_state: { date: TODAY, ruleVersion: 1, students: 7, attendanceUsed: 5, opened: 4, closed: 0, open: 4, settings: DEFAULT_SETTINGS } });
      expect(JSON.stringify(audit[0].after_state)).not.toMatch(/Asha|Bela|Farah|Gopal/);
    });

    it('below ten marked days nothing is flagged; on the line is not below it; days outside the window and days on leave are left out', async () => {
      const flagged = (await stored()).map((f) => f.name);
      // Bela: 5 absences in 9 days is no attendance reason (her flag is for homework alone).
      expect((await openFlag('Bela')).evidence).not.toHaveProperty('attendance');
      // Chirag: 9 of 12 in the window; the three absences further back would have made it 9 of 15.
      expect(flagged).not.toContain('Chirag');
      // Dev: 8 of 10 once his four days of leave are left out (8 of 14 had they counted as away).
      expect(flagged).not.toContain('Dev');
      // Hina: 12 days hold a mark, but only 8 of them are not leave.
      expect(flagged).not.toContain('Hina');
      // Gopal's evidence says how many days of leave were left out.
      expect((await openFlag('Gopal')).evidence).toMatchObject({ attendance: { leave: 5, counted: 10 } });
    });

    it('a student waiting for consent is not flagged, nor one who has left or is in no class, whatever the rows say', async () => {
      // Homework Recovery itself lists Esha (it counts those waiting for consent): leaving her out is Early Warning's own rule.
      expect((await as(principal, (c) => findCandidates(c, A, TODAY))).candidates.map((c) => c.student_name)).toEqual(['Bela', 'Esha']);
      const flagged = (await stored()).map((f) => f.name);
      for (const name of ['Esha', 'Ishan', 'Jaya']) expect(flagged, name).not.toContain(name);
      // Consent given: the next check looks at her like anyone else.
      await db.pg.exec(`set session_replication_role = replica; update students set status = 'active' where student_id = '${ESHA}'; set session_replication_role = origin;`);
      try {
        expect(await check(principal, 1)).toMatchObject({ students: 8, attendanceUsed: 6, opened: 1, kept: 4 });
        expect((await openFlag('Esha')).reasons).toEqual(['attendance', 'homework', 'needs_help']);
      } finally {
        await db.pg.exec(`set session_replication_role = replica; update students set status = 'pending_consent' where student_id = '${ESHA}'; set session_replication_role = origin;`);
      }
      // Waiting for consent again, she is no longer an active student: her flag closes and says why.
      expect(await check(principal, 2)).toMatchObject({ students: 7, closed: 1, open: 4 });
      expect((await stored()).find((f) => f.name === 'Esha')).toMatchObject({ closed: true, closed_reason: 'not_active', closed_by: PRINCIPAL });
    });

    it('running the check twice changes nothing but the time it was checked', async () => {
      await seedRows();
      await check(principal, 0);
      const before = await stored();
      expect(await check(principal, 5)).toEqual({ ok: true, students: 7, attendanceUsed: 5, opened: 0, changed: 0, kept: 4, closed: 0, open: 4 });
      expect(await check(admin, 6)).toEqual({ ok: true, students: 7, attendanceUsed: 5, opened: 0, changed: 0, kept: 4, closed: 0, open: 4 });
      const after = await stored();
      expect(after.map(({ checked_at: _, ...f }) => f)).toEqual(before.map(({ checked_at: _, ...f }) => f));
      for (const f of after) expect(new Date(f.checked_at).toISOString()).toBe(at(6).toISOString());
      // Still opened by the person whose check found it, not by the last person to check.
      expect(new Set(after.map((f) => f.opened_by))).toEqual(new Set([PRINCIPAL]));
    });

    it('an open flag’s evidence is brought up to date: a new reason joins it, a reason that is gone leaves it', async () => {
      const bela = await openFlag('Bela');
      const gopal = await openFlag('Gopal');
      // Bela misses a fourth homework; Gopal's follow-up is finished by his teacher.
      await db.pg.exec(homework(4, 1, [BELA]));
      await db.pg.query(`update pulse_followups set status = 'done', decided_by = $2, decided_at = now(), outcome = 'Went through the sums with him.' where followup_id = $1`, [u(902), TARUN]);
      expect(await check(coordinator, 10)).toEqual({ ok: true, students: 7, attendanceUsed: 5, opened: 0, changed: 2, kept: 2, closed: 0, open: 4 });
      const belaNow = await openFlag('Bela');
      expect(belaNow).toMatchObject({ flag_id: bela.flag_id, reasons: ['homework'], opened_by: PRINCIPAL });
      expect(belaNow.evidence).toMatchObject({ homework: { notDone: 4 } });
      const gopalNow = await openFlag('Gopal');
      expect(gopalNow).toMatchObject({ flag_id: gopal.flag_id, reasons: ['attendance'] });
      expect(gopalNow.evidence).toEqual({ attendance: EVIDENCE.gopal.attendance });
    });
  });

  describe('a flag closes when the signal clears', () => {
    it('the next check closes it, saying why and whose check; a later signal opens a new flag', async () => {
      await seedRows();
      await check(principal, 0);
      const first = await openFlag('Asha');
      // Asha comes to school: two more days present make it 9 of 12, on the line.
      await mark(ASHA, C5A, 11, 'present');
      await mark(ASHA, C5A, 12, 'present');
      expect(await check(admin, 20)).toEqual({ ok: true, students: 7, attendanceUsed: 5, opened: 0, changed: 0, kept: 3, closed: 1, open: 3 });
      const closed = (await stored()).find((f) => f.flag_id === first.flag_id)!;
      expect(closed).toMatchObject({ closed: true, closed_reason: 'signals_cleared', closed_by: ADMIN, opened_by: PRINCIPAL, reasons: ['attendance'], rule_version: 1 });
      // What it rested on stays on the record.
      expect(closed.evidence).toEqual(EVIDENCE.asha);
      expect(new Date((await db.pg.query(`select resolved_at from early_warning_flags where flag_id = $1`, [first.flag_id])).rows[0].resolved_at).toISOString()).toBe(at(20).toISOString());
      // The count a class is in the order of the class names, never of the counts: 5-A has fewer and still comes first.
      expect((await as(principal, (c) => classSummary(c, actor(principal)))).map((c) => [c.class_name, c.open])).toEqual([['5-A', 1], ['6-B', 2]]);
      // A check with nothing new leaves the closed flag as it is.
      expect(await check(principal, 21)).toMatchObject({ opened: 0, closed: 0, kept: 3 });
      // She is away again: 9 of 13. A new flag opens; the closed one stays closed.
      await mark(ASHA, C5A, 13, 'absent');
      expect(await check(coordinator, 22)).toEqual({ ok: true, students: 7, attendanceUsed: 5, opened: 1, changed: 0, kept: 3, closed: 0, open: 4 });
      const hers = (await stored()).filter((f) => f.name === 'Asha');
      expect(hers.map((f) => [f.closed, f.opened_by])).toEqual([[true, PRINCIPAL], [false, COORDINATOR]]);
      expect(hers[1].flag_id).not.toBe(first.flag_id);
      expect(hers[1].evidence).toMatchObject({ attendance: { present: 9, absent: 4, counted: 13, rate: 69.2 } });
      // The screen's lists: open by class then name, and what closed lately with why.
      const lists = await as(principal, (c) => listFlags(c, actor(principal), at(23)));
      expect(lists.open.map((f) => [f.class_name, f.student_name])).toEqual([['5-A', 'Asha'], ['5-A', 'Bela'], ['6-B', 'Farah'], ['6-B', 'Gopal']]);
      expect(lists.closed.map((f) => [f.student_name, f.closed_reason, f.rule_version])).toEqual([['Asha', 'signals_cleared', 1]]);
      // A flag that closed longer ago than the screen looks back is no longer listed.
      expect((await as(principal, (c) => listFlags(c, actor(principal), new Date(at(23).getTime() + 31 * 86_400_000)))).closed).toEqual([]);
    });

    it('a child who leaves the school is no longer looked at: the flag closes and says so', async () => {
      await seedRows();
      await check(principal, 0);
      await db.pg.exec(`set session_replication_role = replica; update students set status = 'inactive' where student_id = '${FARAH}'; set session_replication_role = origin;`);
      expect(await check(principal, 1)).toMatchObject({ students: 6, attendanceUsed: 4, closed: 1, open: 3 });
      expect((await stored()).find((f) => f.name === 'Farah')).toMatchObject({ closed: true, closed_reason: 'not_active' });
    });

    it('the database holds it: one open flag a student, a closed flag stays closed, and a flag is never deleted', async () => {
      await seedRows();
      await check(principal, 0);
      const asha = await openFlag('Asha');
      // A second open flag for the same child.
      await expect(as(principal, (c) => c.query(PUT_FLAG, [A, ASHA, C5A, ['needs_help'], NEEDS_HELP, PRINCIPAL]))).rejects.toThrow(/early_warning_flags_one_open/);
      // Only the three reasons, at least one, each with its evidence and nothing else. Fees are never one.
      await expect(as(principal, (c) => c.query(PUT_FLAG, [A, DEV, C5A, ['fees'], JSON.stringify({ fees: {} }), PRINCIPAL]))).rejects.toThrow(/early_warning_flags_reasons/);
      await expect(as(principal, (c) => c.query(PUT_FLAG, [A, DEV, C5A, ['marks'], JSON.stringify({ marks: {} }), PRINCIPAL]))).rejects.toThrow(/early_warning_flags_reasons/);
      await expect(as(principal, (c) => c.query(PUT_FLAG, [A, DEV, C5A, [], '{}', PRINCIPAL]))).rejects.toThrow(/early_warning_flags_reasons/);
      await expect(as(principal, (c) => c.query(PUT_FLAG, [A, DEV, C5A, ['needs_help'], '{}', PRINCIPAL]))).rejects.toThrow(/evidence for each of its reasons/);
      await expect(as(principal, (c) => c.query(PUT_FLAG, [A, DEV, C5A, ['needs_help'], JSON.stringify({ needs_help: { open: [] }, attendance: {} }), PRINCIPAL]))).rejects.toThrow(/evidence for each of its reasons/);
      await expect(as(principal, (c) => c.query(PUT_FLAG, [A, DEV, C5A, ['needs_help', 'needs_help'], NEEDS_HELP, PRINCIPAL]))).rejects.toThrow(/a reason is given once/);
      // The class a teacher's reading rests on is the class the child is in: not another class, when opened or later.
      await expect(as(principal, (c) => c.query(PUT_FLAG, [A, DEV, C6B, ['needs_help'], NEEDS_HELP, PRINCIPAL]))).rejects.toThrow(/the class the child is in/);
      await expect(as(admin, (c) => c.query(`update early_warning_flags set class_id = $2 where flag_id = $1`, [asha.flag_id, C6B]))).rejects.toThrow(/the class the child is in/);
      // Opened in one's own name, and opened open.
      await expect(as(principal, (c) => c.query(PUT_FLAG, [A, DEV, C5A, ['needs_help'], NEEDS_HELP, ADMIN]))).rejects.toThrow(/row-level security/);
      await expect(as(principal, (c) => c.query(`insert into early_warning_flags (school_id, student_id, class_id, reasons, evidence, rule_version, opened_by, resolved_at, closed_reason, closed_by) values ($1, $2, $3, '{needs_help}', $4::jsonb, 1, $5, now(), 'signals_cleared', $5)`, [A, DEV, C5A, NEEDS_HELP, PRINCIPAL]))).rejects.toThrow(/a flag is opened open/);
      // Whose flag it is never changes; it is closed with a reason, in the closer's own name.
      await expect(as(principal, (c) => c.query(`update early_warning_flags set student_id = $2 where flag_id = $1`, [asha.flag_id, DEV]))).rejects.toThrow(/never changed/);
      await expect(as(principal, (c) => c.query(`update early_warning_flags set opened_by = $2 where flag_id = $1`, [asha.flag_id, ADMIN]))).rejects.toThrow(/never changed/);
      await expect(as(principal, (c) => c.query(`update early_warning_flags set resolved_at = now() where flag_id = $1`, [asha.flag_id]))).rejects.toThrow(/early_warning_flags_closed/);
      await expect(as(principal, (c) => c.query(`update early_warning_flags set resolved_at = now(), closed_reason = 'not interesting', closed_by = $2 where flag_id = $1`, [asha.flag_id, PRINCIPAL]))).rejects.toThrow(/early_warning_flags_closed/);
      await expect(as(principal, (c) => c.query(`update early_warning_flags set resolved_at = now(), closed_reason = 'signals_cleared', closed_by = $2 where flag_id = $1`, [asha.flag_id, ADMIN]))).rejects.toThrow(/row-level security/);
      // Closed, it stays closed: nothing about it changes again, not even by the office.
      await as(principal, (c) => c.query(`update early_warning_flags set resolved_at = now(), closed_reason = 'signals_cleared', closed_by = $2 where flag_id = $1`, [asha.flag_id, PRINCIPAL]));
      await expect(as(principal, (c) => c.query(`update early_warning_flags set resolved_at = null, closed_reason = null, closed_by = null where flag_id = $1`, [asha.flag_id]))).rejects.toThrow(/a closed flag stays closed/);
      await expect(as(admin, (c) => c.query(`update early_warning_flags set evidence = $2::jsonb where flag_id = $1`, [asha.flag_id, JSON.stringify({ attendance: {} })]))).rejects.toThrow(/a closed flag stays closed/);
      // Never deleted, by anyone the app runs as.
      for (const who of [principal, admin, coordinator, tara]) await expect(as(who, (c) => c.query(`delete from early_warning_flags where flag_id = $1`, [asha.flag_id])), who.role).rejects.toThrow(/permission denied/);
      await expect(platform((c) => c.query(`delete from early_warning_flags`))).rejects.toThrow(/permission denied/);
    });
  });

  describe('a reason that cannot be checked again is held, and is never called cleared', () => {
    const DAY = 86_400_000;
    const checkOn = (who: Who, now: Date) => as(who, (c) => runCheck(c, actor(who), now));

    it('no attendance is marked for 24 days: the attendance reasons stay on their flags and say so; nothing closes for want of marks', async () => {
      await seedRows();
      await check(principal, 0);
      const asha = await openFlag('Asha');
      const gopal = await openFlag('Gopal');
      // Twenty-four days on, with not one new mark (a vacation, or nobody marking). The 30 days looked at now
      // begin 5 days before today's date: Asha has 5 counted days in them (3 absent), Gopal 3 (all absent).
      const later = new Date(at(0).getTime() + 24 * DAY);
      const laterDay = day(-24);
      expect(indiaDate(later)).toBe(laterDay);
      expect(await checkOn(coordinator, later)).toEqual({ ok: true, students: 7, attendanceUsed: 0, opened: 0, changed: 2, kept: 1, closed: 1, open: 3 });
      const rows = await stored();
      // Bela's reason was homework: Homework Recovery, by its own ten school days, no longer lists her. That is
      // the only flag that closed, and no attendance flag is among the closed.
      expect(rows.map((f) => [f.name, f.reasons, f.closed_reason])).toEqual([['Asha', ['attendance'], null], ['Bela', ['homework'], 'signals_cleared'], ['Farah', ['needs_help'], null], ['Gopal', ['attendance', 'needs_help'], null]]);
      expect(rows.filter((f) => f.closed && f.reasons.includes('attendance'))).toEqual([]);
      // Same flags as before, with the numbers they last rested on, and what the later check found instead.
      const held = (counted: number) => ({ on: laterDay, from: day(5), counted, minDays: 10 });
      expect(rows[0]).toMatchObject({ flag_id: asha.flag_id, opened_by: PRINCIPAL, closed_by: null });
      expect(rows[0].evidence).toEqual({ attendance: { ...EVIDENCE.asha.attendance, held: held(5) } });
      expect(rows[3].flag_id).toBe(gopal.flag_id);
      expect(rows[3].evidence).toEqual({ attendance: { ...EVIDENCE.gopal.attendance, held: held(3) }, needs_help: EVIDENCE.gopal.needs_help });
      // The same check again that day changes nothing.
      expect(await checkOn(principal, new Date(later.getTime() + 60_000))).toEqual({ ok: true, students: 7, attendanceUsed: 0, opened: 0, changed: 0, kept: 3, closed: 0, open: 3 });
      // The screen's list carries it, so the flag can say that it was not checked again; and the closed list holds
      // no attendance flag that says "no reason remained".
      const lists = await as(principal, (c) => listFlags(c, actor(principal), later));
      expect(lists.open.map((f) => [f.student_name, f.evidence.attendance?.held ?? null])).toEqual([['Asha', held(5)], ['Farah', null], ['Gopal', held(3)]]);
      expect(lists.closed.map((f) => [f.student_name, f.reasons])).toEqual([['Bela', ['homework']]]);
      // A child with no flag gets none from too few days, however many of them were missed: Bela, 5 absent of 5.
      expect(rows.filter((f) => f.name === 'Bela' && !f.closed)).toEqual([]);

      // School is marked again. Asha is in school on the next ten days: 12 of 15 in the window, judged, and not
      // below the line. Now the reason is gone and her flag closes saying so. Gopal is away on seven of them: 0 of
      // 10, judged, below the line: his evidence is of today again and no longer says it was not checked.
      await db.pg.query(`insert into attendance (school_id, student_id, class_id, date, status, marked_by) select $1, $2, $3, ($4::date + g), 'present', $5 from generate_series(1, 10) g`, [A, ASHA, C5A, TODAY, TARA]);
      await db.pg.query(`insert into attendance (school_id, student_id, class_id, date, status, marked_by) select $1, $2, $3, ($4::date + g), 'absent', $5 from generate_series(1, 7) g`, [A, GOPAL, C6B, TODAY, TARUN]);
      expect(await checkOn(admin, new Date(later.getTime() + 120_000))).toEqual({ ok: true, students: 7, attendanceUsed: 2, opened: 0, changed: 1, kept: 1, closed: 1, open: 2 });
      const after = await stored();
      expect(after.find((f) => f.flag_id === asha.flag_id)).toMatchObject({ closed: true, closed_reason: 'signals_cleared', closed_by: ADMIN });
      expect((after.find((f) => f.flag_id === gopal.flag_id)!.evidence as { attendance: unknown }).attendance).toEqual({ from: day(5), to: laterDay, present: 0, late: 0, absent: 10, leave: 2, counted: 10, rate: 0, below: 75, minDays: 10, absentDates: [day(3), day(2), day(1), day(-1), day(-2), day(-3), day(-4), day(-5), day(-6), day(-7)] });
    });

    it('the office asks for more marked days than a flagged child has: the reason is held, and is judged again when the days are there', async () => {
      await seedRows();
      await check(principal, 0);
      const schema = settingsSchemaFor('early-warning')!;
      const save = (baseRevision: number, set: Record<string, number>) => as(principal, (c) => saveSettings(c, { schoolId: A, userId: PRINCIPAL, role: 'principal' }, schema, { moduleId: 'early-warning', baseRevision, set }));
      // Eleven days needed: Asha and Gopal have ten. Only Chirag (twelve) can be judged.
      expect(await save(0, { min_marked_days: 11 })).toMatchObject({ ok: true });
      expect(await check(principal, 1)).toEqual({ ok: true, students: 7, attendanceUsed: 1, opened: 0, changed: 2, kept: 2, closed: 0, open: 4 });
      const held = { on: TODAY, from: FROM, counted: 10, minDays: 11 };
      expect((await openFlag('Asha')).evidence).toEqual({ attendance: { ...EVIDENCE.asha.attendance, held } });
      expect((await openFlag('Gopal')).evidence).toEqual({ attendance: { ...EVIDENCE.gopal.attendance, held }, needs_help: EVIDENCE.gopal.needs_help });
      // Gopal's other reason goes while his attendance cannot be judged: the flag stays, on the held reason alone.
      await db.pg.query(`update pulse_followups set status = 'done', decided_by = $2, decided_at = now(), outcome = 'Went through the sums with him.' where followup_id = $1`, [u(902), TARUN]);
      expect(await check(principal, 2)).toMatchObject({ changed: 1, kept: 3, closed: 0, open: 4 });
      expect(await openFlag('Gopal')).toMatchObject({ reasons: ['attendance'], evidence: { attendance: { rate: 70, held } } });
      // Ten days again: both are judged, are below the line, and the evidence no longer says "held".
      expect(await save(1, { min_marked_days: 10 })).toMatchObject({ ok: true });
      expect(await check(principal, 3)).toEqual({ ok: true, students: 7, attendanceUsed: 5, opened: 0, changed: 2, kept: 2, closed: 0, open: 4 });
      expect((await openFlag('Asha')).evidence).toEqual(EVIDENCE.asha);
      expect((await openFlag('Gopal')).evidence).toEqual({ attendance: EVIDENCE.gopal.attendance });
      // A held reason does not outlive the child's place in the school: she leaves, and the flag closes as "not active".
      expect(await save(2, { min_marked_days: 11 })).toMatchObject({ ok: true });
      await check(principal, 4);
      await db.pg.exec(`set session_replication_role = replica; update students set status = 'inactive' where student_id = '${ASHA}'; set session_replication_role = origin;`);
      try {
        expect(await check(principal, 5)).toMatchObject({ students: 6, closed: 1 });
        expect((await stored()).find((f) => f.name === 'Asha')).toMatchObject({ closed: true, closed_reason: 'not_active' });
      } finally {
        await db.pg.exec(`set session_replication_role = replica; update students set status = 'active' where student_id = '${ASHA}'; set session_replication_role = origin;`);
      }
    });

    it('a school where attendance could be used for nobody is told so, and is given no all-clear', async () => {
      await seedRows();
      // Attendance marked on 6 of the last 30 days, no homework checked and no follow-up. Bela was away on 5 of the 6.
      await db.pg.exec(`set session_replication_role = replica;
        delete from attendance where school_id = '${A}' and date < '${day(6)}'; delete from homework_status where school_id = '${A}'; delete from homework_targets where school_id = '${A}'; delete from homework where school_id = '${A}'; delete from pulse_followups where school_id = '${A}';
        set session_replication_role = origin;`);
      expect((await db.pg.query(`select count(distinct date)::int as days, (count(*) filter (where student_id = $2 and status = 'absent'))::int as bela_absent from attendance where school_id = $1`, [A, BELA])).rows[0]).toEqual({ days: 6, bela_absent: 5 });
      expect(await check(principal, 0)).toEqual({ ok: true, students: 7, attendanceUsed: 0, opened: 0, changed: 0, kept: 0, closed: 0, open: 0 });
      const last = (await as(principal, (c) => lastCheck(c, A)))!;
      expect(last).toMatchObject({ students: 7, attendanceUsed: 0, minDays: 10, windowDays: 30, open: 0 });
      expect(openEmptyState(true, last)).toBe('no_attendance');
      // The check's own record carries the count, so the screen says it from the record and not from a guess.
      expect((await db.pg.query(`select after_state from audit_log where school_id = $1 and event_action = 'early_warning.checked' order by audit_id desc limit 1`, [A])).rows[0].after_state).toMatchObject({ students: 7, attendanceUsed: 0 });
      // With the seeded marks back but nobody absent, and nothing else on record: Asha and Gopal have 7 counted
      // days each, so three of the seven children can be judged (Chirag, Dev, Farah). No all-clear for the others.
      await seedRows();
      await db.pg.exec(`set session_replication_role = replica; delete from attendance where school_id = '${A}' and student_id in ('${ASHA}', '${GOPAL}') and status = 'absent'; delete from homework_status where school_id = '${A}'; delete from pulse_followups where school_id = '${A}'; set session_replication_role = origin;`);
      expect(await check(principal, 1)).toEqual({ ok: true, students: 7, attendanceUsed: 3, opened: 0, changed: 0, kept: 0, closed: 0, open: 0 });
      expect(openEmptyState(true, (await as(principal, (c) => lastCheck(c, A)))!)).toBe('partial');
    });
  });

  describe('a teacher reads only their own classes’ flags', () => {
    it('row level security: the office and the coordinator read the school’s, a teacher their own classes’, nobody else any', async () => {
      await seedRows();
      await check(principal, 0);
      for (const who of [principal, admin, coordinator]) expect(await reads(who), who.role).toEqual(['Asha', 'Bela', 'Farah', 'Gopal']);
      expect(await reads(tara)).toEqual(['Asha', 'Bela']);
      expect(await reads(tarun)).toEqual(['Farah', 'Gopal']);
      expect(await reads(accountant)).toEqual([]);
      expect(await reads(elsewhere)).toEqual([]);
      // A role the school does not have, and no role at all.
      expect(await reads({ role: 'parent', user: u(201) })).toEqual([]);
      expect(await reads({ role: '', user: PRINCIPAL })).toEqual([]);
      // The platform's own role holds no right on either table: nothing is sent or scheduled for a flag.
      for (const table of ['early_warning_flags', 'early_warning_actions']) await expect(platform((c) => c.query(`select 1 from ${table}`)), table).rejects.toThrow(/permission denied/);
      expect((await db.pg.query(`select table_name, grantee from information_schema.role_table_grants where table_name in ('early_warning_flags', 'early_warning_actions') and grantee <> 'app_user' and grantee <> (select current_user)`)).rows).toEqual([]);
      // Through the app: the same lists, and the same counts a class.
      const lists = async (who: Who) => (await as(who, (c) => listFlags(c, actor(who), at(1)))).open.map((f) => f.student_name);
      const counts = async (who: Who) => (await as(who, (c) => classSummary(c, actor(who)))).map((c) => [c.class_name, c.open]);
      expect(await lists(coordinator)).toEqual(['Asha', 'Bela', 'Farah', 'Gopal']);
      expect(await lists(tara)).toEqual(['Asha', 'Bela']);
      expect(await lists(tarun)).toEqual(['Farah', 'Gopal']);
      expect(await lists(accountant)).toEqual([]);
      expect(await counts(principal)).toEqual([['5-A', 2], ['6-B', 2]]);
      expect(await counts(tara)).toEqual([['5-A', 2]]);
      expect(await counts(tarun)).toEqual([['6-B', 2]]);
      expect(await counts(accountant)).toEqual([]);
    });

    it('a teacher cannot write a flag, nor an accountant: the app refuses and so does the database', async () => {
      const before = await stored();
      for (const who of [tara, tarun, accountant]) expect(await check(who, 2), who.role).toEqual({ ok: false, reason: 'not_allowed' });
      // Straight to the table, for a child of her own class and in her own name.
      await expect(as(tara, (c) => c.query(PUT_FLAG, [A, DEV, C5A, ['needs_help'], NEEDS_HELP, TARA]))).rejects.toThrow(/row-level security/);
      await expect(as(accountant, (c) => c.query(PUT_FLAG, [A, DEV, C5A, ['needs_help'], NEEDS_HELP, ACCOUNTANT]))).rejects.toThrow(/row-level security/);
      // Another school's principal cannot even read the child, so the row is refused before its policies are asked.
      await expect(as(elsewhere, (c) => c.query(PUT_FLAG, [A, DEV, C5A, ['needs_help'], NEEDS_HELP, B_PRINCIPAL]))).rejects.toThrow(/row-level security|the class the child is in/);
      // A flag she can read is not hers to change or close: the database changes no row.
      const asha = await openFlag('Asha');
      for (const who of [tara, tarun, accountant]) {
        expect((await run(who, `update early_warning_flags set evidence = $2::jsonb where flag_id = $1`, [asha.flag_id, JSON.stringify({ attendance: { rate: 100 } })])).rowCount, who.role).toBe(0);
        expect((await run(who, `update early_warning_flags set resolved_at = now(), closed_reason = 'signals_cleared', closed_by = $2 where flag_id = $1`, [asha.flag_id, who.user])).rowCount, who.role).toBe(0);
      }
      expect(await stored()).toEqual(before);
    });

    it('the coordinator’s check and the school admin’s find what the principal’s finds', async () => {
      for (const who of [coordinator, admin]) {
        await seedRows();
        expect(await check(who, 0), who.role).toEqual({ ok: true, students: 7, attendanceUsed: 5, opened: 4, changed: 0, kept: 0, closed: 0, open: 4 });
        expect((await stored()).map((f) => [f.name, f.reasons, f.opened_by]), who.role).toEqual([['Asha', ['attendance'], who.user], ['Bela', ['homework'], who.user], ['Farah', ['needs_help'], who.user], ['Gopal', ['attendance', 'needs_help'], who.user]]);
      }
    });

    it('a child who moves class: from that moment, before anyone runs a check, the flag is the new class teacher’s to read and no longer the old one’s', async () => {
      await seedRows();
      await check(principal, 0);
      const farah = await openFlag('Farah');
      const provider = (type: string) => TODAY_PROVIDERS.find((p) => p.type === type)!;
      const card = async (who: Who) => (await as(who, (c) => provider('flags-own-classes').load(c, { schoolId: A, userId: who.user, role: who.role as never, sunday: false })))[0]?.count ?? 0;
      const table = async (who: Who) => (await run(who, `select flag_id from early_warning_flags where school_id = $1 and resolved_at is null`, [A])).rows.length;
      const lists = async (who: Who) => (await as(who, (c) => listFlags(c, actor(who), at(3)))).open.map((f) => [f.class_name, f.student_name]);
      const counts = async (who: Who) => (await as(who, (c) => classSummary(c, actor(who)))).map((c) => [c.class_name, c.open]);
      const step = (who: Who, minute: number) => as(who, (c) => addAction(c, actor(who), { flagId: farah.flag_id, kind: 'extra_help', note: 'Went over the chapter again.', outcome: null }, at(minute)));
      // While she is in 6-B her teacher there reads the flag and writes a step.
      expect(await step(tarun, 1)).toMatchObject({ ok: true });
      expect([await table(tarun), await card(tarun), await table(tara), await card(tara)]).toEqual([2, 2, 2, 2]);
      // The office moves her to 5-A. Nobody presses "Check now": the flag's own copy of the class still says 6-B.
      await db.pg.exec(`set session_replication_role = replica; update students set class_id = '${C5A}' where student_id = '${FARAH}'; set session_replication_role = origin;`);
      expect(await openFlag('Farah')).toMatchObject({ flag_id: farah.flag_id, class_id: C6B });
      // Straight to the tables. Her old teacher: not the flag, not its evidence, not the step he wrote himself, and
      // no new step. Her new teacher: all of it.
      expect((await run(tarun, `select evidence from early_warning_flags where flag_id = $1`, [farah.flag_id])).rows).toEqual([]);
      expect((await run(tarun, `select 1 from early_warning_actions where flag_id = $1`, [farah.flag_id])).rows).toEqual([]);
      await expect(as(tarun, (c) => c.query(`insert into early_warning_actions (school_id, flag_id, kind, by_user) values ($1, $2, 'extra_help', $3)`, [A, farah.flag_id, TARUN]))).rejects.toThrow(/row-level security/);
      expect((await run(tara, `select evidence from early_warning_flags where flag_id = $1`, [farah.flag_id])).rows).toEqual([{ evidence: EVIDENCE.farah }]);
      expect((await run(tara, `select 1 from early_warning_actions where flag_id = $1`, [farah.flag_id])).rows).toHaveLength(1);
      expect([await table(tarun), await table(tara)]).toEqual([1, 3]);
      // Through the app: the step, the card on My Day, the list and the count a class all say the same.
      expect(await step(tarun, 2)).toEqual({ ok: false, reason: 'not_found' });
      expect(await step(tara, 2)).toMatchObject({ ok: true });
      expect([await card(tarun), await card(tara)]).toEqual([1, 3]);
      expect(await lists(tarun)).toEqual([['6-B', 'Gopal']]);
      expect(await lists(tara)).toEqual([['5-A', 'Asha'], ['5-A', 'Bela'], ['5-A', 'Farah']]);
      expect(await counts(tarun)).toEqual([['6-B', 1]]);
      expect(await counts(tara)).toEqual([['5-A', 3]]);
      // The office reads every flag as before, and counts her under the class she is in.
      expect(await lists(principal)).toEqual([['5-A', 'Asha'], ['5-A', 'Bela'], ['5-A', 'Farah'], ['6-B', 'Gopal']]);
      expect(await counts(coordinator)).toEqual([['5-A', 3], ['6-B', 1]]);
      expect((await db.pg.query(`select count(*)::int as n from early_warning_actions where flag_id = $1`, [farah.flag_id])).rows[0].n).toBe(2);
      // The next check brings the flag's own copy of the class along; who reads it does not change again.
      await db.pg.query(`update pulse_followups set class_id = $2 where student_id = $1`, [FARAH, C5A]);
      expect(await check(principal, 4)).toMatchObject({ changed: 1, kept: 3 });
      expect(await openFlag('Farah')).toMatchObject({ flag_id: farah.flag_id, class_id: C5A });
      expect([await table(tarun), await card(tarun), await table(tara), await card(tara)]).toEqual([1, 1, 3, 3]);
    });

    it('a closed flag follows the child too: after a move it is the new class teacher’s record, not the old one’s', async () => {
      await seedRows();
      await check(principal, 0);
      const farah = await openFlag('Farah');
      await db.pg.query(`update pulse_followups set status = 'done', decided_by = $2, decided_at = now(), outcome = 'Explained again in class.' where followup_id = $1`, [u(901), TARUN]);
      expect(await check(principal, 1)).toMatchObject({ closed: 1 });
      const closed = async (who: Who) => (await as(who, (c) => listFlags(c, actor(who), at(2)))).closed.map((f) => [f.class_name, f.student_name]);
      expect([await closed(tarun), await closed(tara)]).toEqual([[['6-B', 'Farah']], []]);
      await db.pg.exec(`set session_replication_role = replica; update students set class_id = '${C5A}' where student_id = '${FARAH}'; set session_replication_role = origin;`);
      expect([await closed(tarun), await closed(tara)]).toEqual([[], [['5-A', 'Farah']]]);
      expect((await run(tarun, `select 1 from early_warning_flags where flag_id = $1`, [farah.flag_id])).rows).toEqual([]);
    });

    it('a child who moves class: after the next check the flag is read by the new class’s teacher, not the old one', async () => {
      await seedRows();
      await check(principal, 0);
      const farah = await openFlag('Farah');
      await db.pg.exec(`set session_replication_role = replica; update students set class_id = '${C5A}' where student_id = '${FARAH}'; update pulse_followups set class_id = '${C5A}' where student_id = '${FARAH}'; set session_replication_role = origin;`);
      expect(await check(principal, 1)).toMatchObject({ changed: 1, kept: 3 });
      expect(await openFlag('Farah')).toMatchObject({ flag_id: farah.flag_id, class_id: C5A });
      expect(await reads(tara)).toEqual(['Asha', 'Bela', 'Farah']);
      expect(await reads(tarun)).toEqual(['Gopal']);
    });
  });

  describe('what was done about a flag', () => {
    it('the office, the coordinator and the child’s own teacher add a step in their own name; an outcome learned later is a new entry', async () => {
      await seedRows();
      await check(principal, 0);
      const asha = (await openFlag('Asha')).flag_id;
      const add = (who: Who, input: { kind: unknown; note?: unknown; outcome?: unknown }, flagId = asha, minute = 5) => as(who, (c) => addAction(c, actor(who), { flagId, kind: input.kind, note: input.note, outcome: input.outcome }, at(minute)));
      const first = await add(tara, { kind: 'talked_to_student', note: '  Asked how the week went.  ', outcome: '' });
      expect(first).toMatchObject({ ok: true });
      expect(await add(principal, { kind: 'spoke_to_guardian', note: null, outcome: 'Her mother says she was unwell; she is back from Monday.' }, asha, 6)).toMatchObject({ ok: true });
      expect(await add(coordinator, { kind: 'other', note: 'Moved her seat to the front.' }, asha, 7)).toMatchObject({ ok: true });
      const rows = (await db.pg.query(`select kind, note, outcome, by_user from early_warning_actions where flag_id = $1 order by at`, [asha])).rows;
      expect(rows).toEqual([
        { kind: 'talked_to_student', note: 'Asked how the week went.', outcome: null, by_user: TARA },
        { kind: 'spoke_to_guardian', note: null, outcome: 'Her mother says she was unwell; she is back from Monday.', by_user: PRINCIPAL },
        { kind: 'other', note: 'Moved her seat to the front.', outcome: null, by_user: COORDINATOR },
      ]);
      // What is asked is checked before anything is written.
      expect(await add(tara, { kind: 'sent_a_message' })).toEqual({ ok: false, reason: 'kind' });
      expect(await add(tara, { kind: 'other', note: '   ' })).toEqual({ ok: false, reason: 'say_what' });
      expect(await add(tara, { kind: 'extra_help', note: 'x'.repeat(ACTION_TEXT_MAX + 1) })).toEqual({ ok: false, reason: 'note' });
      expect(await add(tara, { kind: 'extra_help', note: 7 })).toEqual({ ok: false, reason: 'note' });
      expect(await add(tara, { kind: 'extra_help', outcome: 'x'.repeat(ACTION_TEXT_MAX + 1) })).toEqual({ ok: false, reason: 'outcome' });
      // Another class's teacher cannot see the flag, so cannot add to it; an accountant is not asked at all.
      expect(await add(tarun, { kind: 'extra_help' })).toEqual({ ok: false, reason: 'not_found' });
      expect(await add(accountant, { kind: 'extra_help' })).toEqual({ ok: false, reason: 'not_allowed' });
      expect(await add(elsewhere, { kind: 'extra_help' })).toEqual({ ok: false, reason: 'not_found' });
      expect((await db.pg.query(`select count(*)::int as n from early_warning_actions`)).rows[0].n).toBe(3);
      // The screen's list carries the log, oldest first, with who and when.
      const flag = (await as(tara, (c) => listFlags(c, actor(tara), at(8)))).open.find((f) => f.flag_id === asha)!;
      expect(flag.actions.map((a) => [a.kind, a.by, a.at])).toEqual([['talked_to_student', 'Tara Teacher', at(5).toISOString()], ['spoke_to_guardian', 'Priya Principal', at(6).toISOString()], ['other', 'Chitra Coordinator', at(7).toISOString()]]);
      // The record says a step was added, never its words.
      const audit = (await db.pg.query(`select actor_user_id, target_id, after_state from audit_log where school_id = $1 and event_action = 'early_warning.action_added' order by audit_id`, [A])).rows;
      expect(audit.map((a: { actor_user_id: string; target_id: string; after_state: { kind: string; outcomeGiven: boolean } }) => [a.actor_user_id, a.target_id, a.after_state.kind, a.after_state.outcomeGiven])).toEqual([[TARA, asha, 'talked_to_student', false], [PRINCIPAL, asha, 'spoke_to_guardian', true], [COORDINATOR, asha, 'other', false]]);
      expect(JSON.stringify(audit)).not.toMatch(/Asked how|unwell|seat|Asha/);
    });

    it('the log is append-only and follows its flag: the database refuses a change, another’s name, and a flag one cannot read', async () => {
      const asha = (await openFlag('Asha')).flag_id;
      const put = `insert into early_warning_actions (school_id, flag_id, kind, note, by_user) values ($1, $2, $3, $4, $5)`;
      // Nothing written is changed or removed, by anyone the app runs as.
      for (const who of [principal, admin, coordinator, tara]) {
        await expect(as(who, (c) => c.query(`update early_warning_actions set note = 'Something else.' where flag_id = $1`, [asha])), who.role).rejects.toThrow(/permission denied/);
        await expect(as(who, (c) => c.query(`delete from early_warning_actions where flag_id = $1`, [asha])), who.role).rejects.toThrow(/permission denied/);
      }
      // Another class's teacher, an accountant, another school: no row is read and none is added.
      for (const who of [tarun, accountant, elsewhere]) {
        expect((await run(who, `select 1 from early_warning_actions`)).rows, who.role).toEqual([]);
        await expect(as(who, (c) => c.query(put, [who.school ?? A, asha, 'extra_help', 'Stayed back for ten minutes.', who.user])), who.role).rejects.toThrow(/row-level security|foreign key/);
      }
      // Not in another person's name, even on a flag one may read.
      await expect(as(tara, (c) => c.query(put, [A, asha, 'extra_help', 'Stayed back for ten minutes.', PRINCIPAL]))).rejects.toThrow(/row-level security/);
      await expect(as(principal, (c) => c.query(put, [A, asha, 'extra_help', 'Stayed back for ten minutes.', TARA]))).rejects.toThrow(/row-level security/);
      // "Something else" says what it was, and a kind is one of the four: none of them is a message.
      await expect(as(principal, (c) => c.query(put, [A, asha, 'other', null, PRINCIPAL]))).rejects.toThrow(/early_warning_actions_other_says_what/);
      await expect(as(principal, (c) => c.query(put, [A, asha, 'messaged_parent', 'Sent a note.', PRINCIPAL]))).rejects.toThrow(/early_warning_actions_kind_check/);
      expect((await db.pg.query(`select count(*)::int as n from early_warning_actions`)).rows[0].n).toBe(3);
      // The audit rows of Early Warning follow the flags: the three roles that run the check, or the person who acted.
      const seen = async (who: Who) => (await run(who, `select count(*)::int as n from audit_log where event_action like 'early_warning.%'`)).rows[0].n;
      for (const who of [principal, admin, coordinator]) expect(await seen(who), who.role).toBe(4); // one check, three steps
      expect(await seen(tara)).toBe(1); // her own step
      expect(await seen(tarun)).toBe(0);
      expect(await seen(accountant)).toBe(0);
    });

    it('a step can still be added once the flag has closed, and stays with it', async () => {
      const asha = (await openFlag('Asha')).flag_id;
      await mark(ASHA, C5A, 11, 'present');
      await mark(ASHA, C5A, 12, 'present');
      expect(await check(principal, 30)).toMatchObject({ closed: 1 });
      expect(await as(tara, (c) => addAction(c, actor(tara), { flagId: asha, kind: 'talked_to_student', note: null, outcome: 'She is back and has caught up.' }, at(31)))).toMatchObject({ ok: true });
      const closed = (await as(principal, (c) => listFlags(c, actor(principal), at(32)))).closed;
      expect(closed.map((f) => [f.student_name, f.actions.length])).toEqual([['Asha', 4]]);
    });
  });

  describe('whatever the school’s switch or a child’s consent, no message is written for a parent', () => {
    it('with the switch on and consent given, a check, a step, a closing and a reopening write no message and queue no job', async () => {
      await seedRows();
      await db.pg.query(`update schools set at_risk_parent_dispatch_enabled = true where school_id = $1`, [A]);
      try {
        // The children flagged below have a guardian with a number, and consent for exactly this purpose.
        expect((await db.pg.query(`select count(*)::int as n from consent_ledger where school_id = $1 and purpose = 'at_risk' and granted and student_id in ($2, $3)`, [A, ASHA, GOPAL])).rows[0].n).toBe(2);
        const before = await sentOrQueued();
        await check(principal, 0);
        const asha = (await openFlag('Asha')).flag_id;
        for (const kind of ACTION_KINDS) await as(tara, (c) => addAction(c, actor(tara), { flagId: asha, kind, note: 'Spoke at the school gate.', outcome: 'Will come regularly.' }, at(1)));
        await as(principal, (c) => listFlags(c, actor(principal), at(2)));
        await mark(ASHA, C5A, 11, 'present');
        await mark(ASHA, C5A, 12, 'present');
        await check(admin, 3);
        await mark(ASHA, C5A, 13, 'absent');
        await check(coordinator, 4);
        expect((await stored()).map((f) => [f.name, f.closed])).toEqual([['Asha', true], ['Asha', false], ['Bela', false], ['Farah', false], ['Gopal', false]]);
        expect(await sentOrQueued()).toEqual(before);
        expect((await db.pg.query(`select count(*)::int as n from early_warning_flags where notified_parent`)).rows[0].n).toBe(0);
      } finally {
        await db.pg.query(`update schools set at_risk_parent_dispatch_enabled = false where school_id = $1`, [A]);
      }
    });

    it('notified_parent cannot be set: not by the app’s role, not by the platform, not by the owner of the database', async () => {
      const asha = (await openFlag('Asha')).flag_id;
      for (const who of [principal, admin, coordinator]) await expect(as(who, (c) => c.query(`update early_warning_flags set notified_parent = true where flag_id = $1`, [asha])), who.role).rejects.toThrow(/early_warning_flags_parent_never_told/);
      expect((await run(tara, `update early_warning_flags set notified_parent = true where flag_id = $1`, [asha])).rowCount).toBe(0);
      await expect(as(principal, (c) => c.query(`insert into early_warning_flags (school_id, student_id, class_id, reasons, evidence, rule_version, opened_by, notified_parent) values ($1, $2, $3, '{needs_help}', $4::jsonb, 1, $5, true)`, [A, DEV, C5A, NEEDS_HELP, PRINCIPAL]))).rejects.toThrow(/early_warning_flags_parent_never_told/);
      await expect(platform((c) => c.query(`update early_warning_flags set notified_parent = true where flag_id = $1`, [asha]))).rejects.toThrow(/permission denied/);
      await expect(db.pg.query(`update early_warning_flags set notified_parent = true where flag_id = $1`, [asha])).rejects.toThrow(/early_warning_flags_parent_never_told/);
      expect((await db.pg.query(`select count(*)::int as n from early_warning_flags where notified_parent`)).rows[0].n).toBe(0);
    });
  });

  describe('the thresholds come from the school’s settings', () => {
    const schema = settingsSchemaFor('early-warning')!;
    const save = (who: Who, baseRevision: number, set: Record<string, number>) => as(who, (c) => saveSettings(c, { schoolId: A, userId: who.user, role: who.role as never }, schema, { moduleId: 'early-warning', baseRevision, set }));

    it('the defaults hold until the principal or the school admin changes them; a teacher and a coordinator cannot', async () => {
      await seedRows();
      expect(await as(principal, (c) => earlyWarningSettings(c, A))).toEqual({ attendanceBelow: 75, windowDays: 30, minMarkedDays: 10 });
      for (const who of [tara, coordinator]) expect(await save(who, 0, { attendance_below: 100 }), who.role).toMatchObject({ ok: false });
      const outOfRange: Record<string, number>[] = [{ attendance_below: 0 }, { attendance_below: 101 }, { window_days: 6 }, { window_days: 91 }, { min_marked_days: 0 }, { min_marked_days: 61 }];
      for (const bad of outOfRange) expect(await save(principal, 0, bad), JSON.stringify(bad)).toMatchObject({ ok: false });
      // Numbers that cannot stand together: more marked days than the days looked back can hold. With them
      // attendance could never be a reason for anyone, so they are refused, whichever of the two is changed.
      const cannotBe: Record<string, number>[] = [{ min_marked_days: 31 }, { window_days: 9 }, { window_days: 7 }, { window_days: 20, min_marked_days: 21 }];
      for (const bad of cannotBe) expect(await save(principal, 0, bad), JSON.stringify(bad)).toMatchObject({ ok: false, reason: 'invalid', errors: [{ key: 'min_marked_days' }] });
      expect(await as(principal, (c) => earlyWarningSettings(c, A))).toEqual(DEFAULT_SETTINGS);
      expect((await db.pg.query(`select count(*)::int as n from school_settings where school_id = $1 and module_id = 'early-warning'`, [A])).rows[0].n).toBe(0);
      // The same rule with no database: it holds for what would be in force after the change, so putting one of
      // the two back to its default is refused as well when the other could then not be reached.
      const inForce = { window_days: 60, min_marked_days: 40 };
      expect(applySettingsUpdate(schema, {}, { set: inForce }, 'principal')).toMatchObject({ ok: true });
      expect(applySettingsUpdate(schema, inForce, { resetToDefault: ['window_days'] }, 'principal')).toMatchObject({ ok: false, reason: 'invalid', errors: [{ key: 'min_marked_days' }] });
      expect(applySettingsUpdate(schema, inForce, { set: { window_days: 39 } }, 'school_admin')).toMatchObject({ ok: false, reason: 'invalid' });
      expect(applySettingsUpdate(schema, inForce, { set: { window_days: 40 } }, 'school_admin')).toMatchObject({ ok: true });
      expect(applySettingsUpdate(schema, {}, { set: { window_days: 7, min_marked_days: 7 } }, 'principal')).toMatchObject({ ok: true });
      // The sentence under each of the two settings says the rule, in both languages.
      for (const lang of ['en', 'hi'] as const) for (const key of ['window_days', 'min_marked_days']) expect(t(lang, `set.early-warning.${key}.help` as never), `${lang} ${key}`).toMatch(lang === 'en' ? /never (fewer|more) than/ : /कभी (कम|ज़्यादा) नहीं/);
    });

    it('a stricter line and fewer days flag more children; a looser line closes flags; a window too short to judge holds a reason; each flag stores the numbers used', async () => {
      await check(principal, 0);
      expect((await stored()).map((f) => f.name)).toEqual(['Asha', 'Bela', 'Farah', 'Gopal']);
      // Below 80 from nine days: Chirag (75) joins, Bela's 4 of 9 becomes a second reason, Dev (80) is on the line.
      expect(await save(principal, 0, { attendance_below: 80, min_marked_days: 9 })).toMatchObject({ ok: true });
      expect(await as(coordinator, (c) => earlyWarningSettings(c, A))).toEqual({ attendanceBelow: 80, windowDays: 30, minMarkedDays: 9 });
      expect(await check(principal, 1)).toEqual({ ok: true, students: 7, attendanceUsed: 6, opened: 1, changed: 3, kept: 1, closed: 0, open: 5 });
      const rows = await stored();
      expect(rows.map((f) => [f.name, f.reasons])).toEqual([['Asha', ['attendance']], ['Bela', ['attendance', 'homework']], ['Chirag', ['attendance']], ['Farah', ['needs_help']], ['Gopal', ['attendance', 'needs_help']]]);
      expect(rows[1].evidence).toMatchObject({ attendance: { present: 4, absent: 5, counted: 9, rate: 44.4, below: 80, minDays: 9 } });
      expect(rows[2].evidence).toMatchObject({ attendance: { present: 8, late: 1, absent: 3, counted: 12, rate: 75, below: 80, minDays: 9 } });
      expect(rows[0].evidence).toMatchObject({ attendance: { rate: 70, below: 80, minDays: 9 } });
      // A looser line, below 70: Asha and Gopal (70) and Chirag (75) are judged and are not below it. Asha's and
      // Chirag's flags close because the reason is gone; Gopal's keeps its other reason; Bela (44.4) stays.
      expect(await save(admin, 1, { attendance_below: 70 })).toMatchObject({ ok: true });
      expect(await check(admin, 2)).toEqual({ ok: true, students: 7, attendanceUsed: 6, opened: 0, changed: 2, kept: 1, closed: 2, open: 3 });
      expect((await stored()).map((f) => [f.name, f.reasons, f.closed_reason])).toEqual([['Asha', ['attendance'], 'signals_cleared'], ['Bela', ['attendance', 'homework'], null], ['Chirag', ['attendance'], 'signals_cleared'], ['Farah', ['needs_help'], null], ['Gopal', ['needs_help'], null]]);
      // Seven days back cannot hold the nine marked days the school asks for: refused, and nothing changes.
      expect(await save(admin, 2, { window_days: 7 })).toMatchObject({ ok: false, reason: 'invalid' });
      expect(await as(admin, (c) => earlyWarningSettings(c, A))).toEqual({ attendanceBelow: 70, windowDays: 30, minMarkedDays: 9 });
      // Nine days back: allowed, but today has no mark yet, so nobody has nine counted days in them. Attendance
      // cannot be judged for anyone. Bela's attendance reason is HELD with the numbers it last rested on, and says
      // so; it is not called cleared. Nothing closes.
      expect(await save(admin, 2, { window_days: 9 })).toMatchObject({ ok: true });
      expect(await check(admin, 3)).toEqual({ ok: true, students: 7, attendanceUsed: 0, opened: 0, changed: 1, kept: 2, closed: 0, open: 3 });
      const open = (await stored()).filter((f) => !f.closed);
      expect(open.map((f) => [f.name, f.reasons])).toEqual([['Bela', ['attendance', 'homework']], ['Farah', ['needs_help']], ['Gopal', ['needs_help']]]);
      expect(open[0].evidence.attendance).toEqual({ from: FROM, to: TODAY, present: 4, late: 0, absent: 5, leave: 0, counted: 9, rate: 44.4, below: 70, minDays: 9, absentDates: [day(5), day(4), day(3), day(2), day(1)], held: { on: TODAY, from: day(8), counted: 8, minDays: 9 } });
      // The check's own record says which numbers it used, and for how many children attendance could be used.
      const last = (await db.pg.query(`select after_state from audit_log where school_id = $1 and event_action = 'early_warning.checked' order by audit_id desc limit 1`, [A])).rows[0].after_state;
      expect(last).toMatchObject({ settings: { attendanceBelow: 70, windowDays: 9, minMarkedDays: 9 }, students: 7, attendanceUsed: 0 });
    });

    it('the homework reason follows Homework Recovery’s own settings, and its decisions', async () => {
      await seedRows();
      // Four homeworks before a student is listed: Bela's three are no longer enough, there or here.
      await db.pg.query(`insert into school_settings (school_id, module_id, schema_version, setting_values) values ($1, 'recovery', 1, '{"missed_threshold": 4}')`, [A]);
      expect((await as(principal, (c) => findCandidates(c, A, TODAY))).candidates).toEqual([]);
      await check(principal, 0);
      expect((await stored()).map((f) => f.name)).toEqual(['Asha', 'Farah', 'Gopal']);
      await db.pg.query(`delete from school_settings where school_id = $1 and module_id = 'recovery'`, [A]);
      expect(await check(principal, 1)).toMatchObject({ opened: 1 });
      expect((await openFlag('Bela')).evidence).toEqual(EVIDENCE.bela());
      // Her teacher decides the catch-up plan: Homework Recovery no longer lists her, and the reason is gone.
      await db.pg.exec(`set session_replication_role = replica;
        insert into recovery_plans (school_id, student_id, class_id, window_from, window_to, items, status, decided_by) values ('${A}', '${BELA}', '${C5A}', '${windowStart(TODAY, 10)}', '${day(2)}', '[{"x":1}]', 'approved', '${TARA}');
        set session_replication_role = origin;`);
      expect(await check(principal, 2)).toMatchObject({ closed: 1 });
      expect((await stored()).find((f) => f.name === 'Bela')).toMatchObject({ closed: true, closed_reason: 'signals_cleared' });
    });
  });

  describe('My Day', () => {
    const provider = (type: string) => TODAY_PROVIDERS.find((p) => p.type === type)!;
    const cards = (who: Who, type: string) => as(who, (c) => provider(type).load(c, { schoolId: A, userId: who.user, role: who.role as never, sunday: false }));

    it('the office and the coordinator are told of open flags with nothing written yet; a teacher of open flags in their own classes', async () => {
      await seedRows();
      expect(provider('flags-no-action')).toMatchObject({ moduleId: 'early-warning', roles: ['principal', 'school_admin', 'academic_coordinator'] });
      expect(provider('flags-own-classes')).toMatchObject({ moduleId: 'early-warning', roles: ['teacher'] });
      expect(await cards(principal, 'flags-no-action')).toEqual([]);
      expect(await cards(tara, 'flags-own-classes')).toEqual([]);
      await check(principal, 0);
      for (const who of [principal, admin, coordinator]) expect(await cards(who, 'flags-no-action'), who.role).toEqual([{ id: 'flags-no-action', type: 'flags-no-action', moduleId: 'early-warning', state: 'todo', count: 4, href: '/app/early-warning' }]);
      expect(await cards(tara, 'flags-own-classes')).toEqual([{ id: 'flags-own-classes', type: 'flags-own-classes', moduleId: 'early-warning', state: 'todo', count: 2, href: '/app/early-warning' }]);
      expect((await cards(tarun, 'flags-own-classes'))[0]).toMatchObject({ count: 2 });
      // A step is written for Asha: one fewer waits for the office; the teacher's count is of open flags, and stays.
      const asha = (await openFlag('Asha')).flag_id;
      await as(tara, (c) => addAction(c, actor(tara), { flagId: asha, kind: 'talked_to_student', note: null, outcome: null }, at(1)));
      expect((await cards(principal, 'flags-no-action'))[0]).toMatchObject({ count: 3 });
      expect((await cards(tara, 'flags-own-classes'))[0]).toMatchObject({ count: 2 });
      // Her flag closes: it leaves both.
      await mark(ASHA, C5A, 11, 'present');
      await mark(ASHA, C5A, 12, 'present');
      await check(principal, 2);
      expect((await cards(principal, 'flags-no-action'))[0]).toMatchObject({ count: 3 });
      expect((await cards(tara, 'flags-own-classes'))[0]).toMatchObject({ count: 1 });
      // An accountant's session counts nothing, whichever card is asked.
      expect(await cards(accountant, 'flags-no-action')).toEqual([]);
      expect(await cards(accountant, 'flags-own-classes')).toEqual([]);
    });
  });

  describe('the routes and the screen', () => {
    const claims = (who: Who) => ({ sub: who.user, role: who.role, schoolId: who.school ?? A, membershipId: u(90), tokenVersion: 0, aal: 'aal1', sessionId: u(91) });
    const req = (method: string, url: string, body?: unknown) => new NextRequest(`http://localhost${url}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
    const call = async (who: Who, fn: () => Promise<Response>) => {
      state.claims = claims(who);
      const res = await fn();
      return { status: res.status, body: await res.json() };
    };
    const screen = (who: Who) => call(who, () => getScreen(req('GET', '/api/app/early-warning')));
    const checkNow = (who: Who) => call(who, () => postCheck(req('POST', '/api/app/early-warning', {})));
    const step = (who: Who, flagId: string, body: unknown) => call(who, () => postAction(req('POST', `/api/app/early-warning/${flagId}/actions`, body), { params: { flagId } }));
    const moduleOn = (enabled: boolean, school = A) => db.pg.query(`insert into school_module_entitlements (school_id, module_id, enabled, source) values ($1, 'early-warning', $2, 'plan') on conflict (school_id, module_id) do update set enabled = excluded.enabled`, [school, enabled]);

    it('the migration switches Early Warning on for every school there is', async () => {
      const dir = path.join(ROOT, 'supabase/migrations');
      const sql = readFileSync(path.join(dir, readdirSync(dir).find((f) => f.endsWith('_p5_early_warning.sql'))!), 'utf8');
      const last = sql.slice(sql.lastIndexOf('insert into school_module_entitlements'));
      expect(last).toContain(`'early-warning', true, 'plan'`);
      await db.pg.exec(last);
      expect((await db.pg.query(`select count(*)::int as n from school_module_entitlements where module_id = 'early-warning' and enabled and school_id in ($1, $2)`, [A, B])).rows[0].n).toBe(2);
      // A school that had it switched off by hand keeps that choice.
      await db.pg.query(`update school_module_entitlements set enabled = false, source = 'founder_override' where school_id = $1 and module_id = 'early-warning'`, [B]);
      await db.pg.exec(last);
      expect((await db.pg.query(`select enabled from school_module_entitlements where module_id = 'early-warning' and school_id = $1`, [B])).rows[0].enabled).toBe(false);
    });

    it('the office checks and reads the school; a teacher reads their own classes and cannot check; an accountant gets nothing', async () => {
      await seedRows();
      await moduleOn(true);
      const empty = await screen(principal);
      expect(empty.status).toBe(200);
      expect(empty.body).toMatchObject({ mayCheck: true, ruleVersion: 1, settings: DEFAULT_SETTINGS, lastCheck: null, summary: [], open: [], closed: [], truncated: false });
      for (const who of [tara, accountant]) expect(await checkNow(who), who.role).toMatchObject({ status: 403, body: { code: 'not_allowed' } });
      expect(await stored()).toEqual([]);
      const before = await sentOrQueued();
      expect(await checkNow(principal)).toEqual({ status: 200, body: { students: 7, attendanceUsed: 5, opened: 4, changed: 0, kept: 0, closed: 0, open: 4 } });
      const office = (await screen(coordinator)).body;
      expect(office.open.map((f: { class_name: string; student_name: string; reasons: string[] }) => [f.class_name, f.student_name, f.reasons])).toEqual([['5-A', 'Asha', ['attendance']], ['5-A', 'Bela', ['homework']], ['6-B', 'Farah', ['needs_help']], ['6-B', 'Gopal', ['attendance', 'needs_help']]]);
      expect(office.summary.map((c: { class_name: string; open: number }) => [c.class_name, c.open])).toEqual([['5-A', 2], ['6-B', 2]]);
      expect(office.lastCheck).toMatchObject({ by: 'Priya Principal', ruleVersion: 1, students: 7, attendanceUsed: 5, minDays: 10, windowDays: 30, opened: 4, closed: 0, open: 4 });
      // Why this: every flag the screen is given carries its evidence, the rule's version, who opened it and when it was last checked.
      for (const f of office.open) {
        expect(Object.keys(f.evidence).sort(), f.student_name).toEqual([...f.reasons].sort());
        expect(f, f.student_name).toMatchObject({ rule_version: 1, opened_by: 'Priya Principal', resolved_at: null, actions: [] });
        expect(Date.parse(f.checked_at), f.student_name).toBeGreaterThan(0);
      }
      expect(office.open[0].evidence).toEqual(EVIDENCE.asha);
      // A teacher: their own classes' flags, no check, no settings, no "last checked by".
      const hers = (await screen(tara)).body;
      expect(hers).toMatchObject({ mayCheck: false, settings: null, lastCheck: null });
      expect(hers.open.map((f: { student_name: string }) => f.student_name)).toEqual(['Asha', 'Bela']);
      expect(hers.summary.map((c: { class_name: string; open: number }) => [c.class_name, c.open])).toEqual([['5-A', 2]]);
      expect((await screen(tarun)).body.open.map((f: { student_name: string }) => f.student_name)).toEqual(['Farah', 'Gopal']);
      expect(await screen(accountant)).toMatchObject({ status: 403, body: { code: 'not_allowed' } });
      // What was done.
      const asha = office.open[0].flag_id as string;
      expect(await step(tara, asha, { kind: 'extra_help', note: 'Ten minutes after class on the missed sums.' })).toMatchObject({ status: 201 });
      expect(await step(tara, asha, { kind: 'phoned_parent' })).toMatchObject({ status: 400, body: { code: 'kind' } });
      expect(await step(tara, asha, { kind: 'other' })).toMatchObject({ status: 400, body: { code: 'say_what' } });
      expect(await step(tara, asha, { kind: 'extra_help', note: 'x'.repeat(ACTION_TEXT_MAX + 1) })).toMatchObject({ status: 400, body: { code: 'note' } });
      expect(await step(tara, asha, { kind: 7 })).toMatchObject({ status: 400, body: { code: 'not_sent_properly' } });
      expect(await step(tara, 'not-a-flag', { kind: 'extra_help' })).toMatchObject({ status: 400, body: { code: 'not_sent_properly' } });
      expect(await step(tarun, asha, { kind: 'extra_help' })).toMatchObject({ status: 404, body: { code: 'not_found' } });
      expect(await step(accountant, asha, { kind: 'extra_help' })).toMatchObject({ status: 403, body: { code: 'not_allowed' } });
      expect((await screen(principal)).body.open[0].actions.map((a: { kind: string; by: string; note: string }) => [a.kind, a.by, a.note])).toEqual([['extra_help', 'Tara Teacher', 'Ten minutes after class on the missed sums.']]);
      // None of it wrote a message or queued a job.
      expect(await sentOrQueued()).toEqual(before);
    });

    it('Early Warning switched off: nobody checks, reads or adds; the page says so; the flags on record are kept', async () => {
      const asha = (await openFlag('Asha')).flag_id;
      const before = await stored();
      await moduleOn(false);
      try {
        for (const who of [principal, tara]) expect(await screen(who), who.role).toMatchObject({ status: 403, body: { code: 'module_off' } });
        expect(await checkNow(principal)).toMatchObject({ status: 403, body: { code: 'module_off' } });
        expect(await step(tara, asha, { kind: 'extra_help' })).toMatchObject({ status: 403, body: { code: 'module_off' } });
        state.claims = claims(principal);
        expect((await EarlyWarningPage()).type).toBe(ModuleOffPage);
        expect(await stored()).toEqual(before);
      } finally {
        await moduleOn(true);
      }
      for (const who of [principal, tara]) {
        state.claims = claims(who);
        const page = await EarlyWarningPage();
        expect(page.type, who.role).toBe(ModulePage);
        expect(page.props, who.role).toMatchObject({ moduleId: 'early-warning', help: 'early-warning-flags', tour: 'early-warning', title: 'Early Warning' });
      }
    });

    it('an account made at another school reads what its role reads, and is told plainly that it cannot check or add a step; nothing is written', async () => {
      await seedRows();
      await check(principal, 0);
      const before = await stored();
      const audited = async () => (await db.pg.query(`select count(*)::int as n from audit_log where event_action like 'early_warning.%'`)).rows[0].n;
      const auditBefore = await audited();
      const asha = (await openFlag('Asha')).flag_id;
      expect(await check(visiting, 1)).toEqual({ ok: false, reason: 'elsewhere' });
      expect(await as(visiting, (c) => addAction(c, actor(visiting), { flagId: asha, kind: 'extra_help', note: null, outcome: null }, at(2)))).toEqual({ ok: false, reason: 'elsewhere' });
      expect(await checkNow(visiting)).toMatchObject({ status: 409, body: { code: 'elsewhere' } });
      expect(await step(visiting, asha, { kind: 'extra_help' })).toMatchObject({ status: 409, body: { code: 'elsewhere' } });
      // Reading is as for any principal of this school.
      expect((await screen(visiting)).body.open.map((f: { student_name: string }) => f.student_name)).toEqual(['Asha', 'Bela', 'Farah', 'Gopal']);
      // The database would have refused the name too: the person who opens a flag or writes a step is on this school's own staff list.
      await expect(as(visiting, (c) => c.query(PUT_FLAG, [A, DEV, C5A, ['needs_help'], NEEDS_HELP, VISITING_PRINCIPAL]))).rejects.toThrow(/foreign key/);
      await expect(as(visiting, (c) => c.query(`insert into early_warning_actions (school_id, flag_id, kind, by_user) values ($1, $2, 'extra_help', $3)`, [A, asha, VISITING_PRINCIPAL]))).rejects.toThrow(/foreign key/);
      expect(await stored()).toEqual(before);
      expect((await db.pg.query(`select count(*)::int as n from early_warning_actions`)).rows[0].n).toBe(0);
      expect(await audited()).toBe(auditBefore);
      for (const lang of ['en', 'hi'] as const) expect(t(lang, 'ew.err.elsewhere'), lang).toContain(lang === 'en' ? 'another school' : 'दूसरे स्कूल');
    });

    it('"last checked" is the newest check, whoever ran it, and only the people who run the check are told', async () => {
      expect(await checkNow(coordinator)).toMatchObject({ status: 200, body: { opened: 0, kept: 4 } });
      expect(await as(principal, (c) => lastCheck(c, A))).toMatchObject({ by: 'Chitra Coordinator', students: 7, attendanceUsed: 5, opened: 0, open: 4 });
      // The database shows a teacher no check's record, so the library has nothing to tell them.
      expect(await as(tara, (c) => lastCheck(c, A))).toBeNull();
      expect(await as(accountant, (c) => lastCheck(c, A))).toBeNull();
    });
  });
});
