import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { schoolJobContextStatements, type SchoolJob } from '@/lib/auth/db';
import { earlyWarningSettings, listFlags, runCheck } from '@/lib/early-warning/early-warning';
import { readMarks, type ChildExam } from '@/lib/early-warning/marks';
import { DEFAULT_SETTINGS, EARLY_WARNING_RULE_VERSION, NIGHTLY_CHECK_JOB, REASONS, type MarksEvidence } from '@/lib/early-warning/rules';
import { makeExam } from '@/lib/exams/exams';
import { saveMarks } from '@/lib/exams/marks';
import type { Mark } from '@/lib/exams/papers';
import { classResult } from '@/lib/exams/results';
import { settingsSchemaFor } from '@/lib/frameworks/settings-schemas';
import { saveSettings } from '@/lib/frameworks/settings-store';
import { t } from '@/lib/i18n';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';
import { earlyWarningNightlyHandler } from '@/lib/jobs/school-checks';
import type { AsSchool } from '@/lib/jobs/school-context';
import type { ClaimedJob } from '@/lib/jobs/types';
import { indiaDate } from '@/lib/time/india';

// Early Warning v2, the marks signal (docs/27 row 9f, C218). The acceptance test: "After a publish, the next check
// opens or updates a flag with the marks reason and its evidence for a child whose own marks fell past the line. A
// child above it is not flagged. Fees are never a signal. Nothing reaches a parent." Until the report-card slice
// adds publishing (C215), an exam counts for a class once every paper of it for that class is entered: "after a
// publish" is proven here as "after the last paper is entered". Proven on the whole schema as the app's own database
// role, through the app's own code (makeExam, saveMarks, "Check now", the nightly check, the route) and by going to
// the database directly. Every name and mark is made up.

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

const ROOT = path.resolve(__dirname, '../..');
const u = (n: number) => `9f000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B] = [u(1), u(2)];
const [PRINCIPAL, ADMIN, COORDINATOR, TARA, TARUN, ACCOUNTANT, PARENT, B_PRINCIPAL] = [u(11), u(12), u(13), u(14), u(15), u(16), u(17), u(21)];
const [C5A, C6B, SESSION] = [u(31), u(32), u(33)];
const [MATHS, ENGLISH, SCIENCE] = [u(41), u(42), u(43)];
// 5-A (Tara's): Asha, Bela, Chirag, Dev, Esha, Farah. 6-B (Tarun's): Gopal, Hina.
const [ASHA, BELA, CHIRAG, DEV, ESHA, FARAH, GOPAL, HINA] = [u(101), u(102), u(103), u(104), u(105), u(106), u(107), u(108)];
const NAMES: Record<string, string> = { [ASHA]: 'Asha', [BELA]: 'Bela', [CHIRAG]: 'Chirag', [DEV]: 'Dev', [ESHA]: 'Esha', [FARAH]: 'Farah', [GOPAL]: 'Gopal', [HINA]: 'Hina' };

const TODAY = indiaDate();
const NOON = new Date(`${TODAY}T12:00:00+05:30`);
const at = (minutes: number) => new Date(NOON.getTime() + minutes * 60_000);
// India's date n days before today (a negative n: after it).
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
const parent: Who = { role: 'parent', user: PARENT };
const elsewhere: Who = { role: 'principal', user: B_PRINCIPAL, school: B };
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
// The nightly job's own session: the statements the job runner's helper runs (withSchoolJobContext).
const asSchool: AsSchool = (schoolId: string, job: SchoolJob, fn) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    for (const s of schoolJobContextStatements(schoolId, job)) await tx.query(s.sql, s.params);
    return fn(tx);
  });
const actor = (who: Who) => ({ schoolId: who.school ?? A, userId: who.user, role: who.role as never });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result = { rows: any[]; rowCount: number };
const run = (who: Who, sql: string, params: unknown[] = []) => as<Result>(who, (c) => c.query(sql, params));
const check = (who: Who, minute: number) => as(who, (c) => runCheck(c, actor(who), at(minute)));

// The school's grading scheme (made up): whole percents, a pass mark of 33, no components (a paper has one part,
// "Marks"), four bands.
const SCHEME = {
  bands: [{ from: 75, to: 100, grade: 'A', meaning: null }, { from: 50, to: 74, grade: 'B', meaning: null }, { from: 33, to: 49, grade: 'C', meaning: null }, { from: 0, to: 32, grade: 'D', meaning: null }],
  decimals: 0,
  passMark: 33,
  components: [],
  terms: [],
  layout: { components: true, total: true, percent: true, grade: true, attendance: true, remarks: true, coScholastic: false },
  coScholastic: null,
};

// Each child's marks out of 50 a paper, Mathematics / English / Science (6-B: Mathematics only). 'A' absent, 'X' exempt.
//   Unit test 1 (made first)        Half-yearly (made second)        by hand, with the defaults (15 points; 2 subjects)
//   Asha    40 40 40  = 80          30 30 30     = 60                fell 20: MARKS
//   Bela    35 35 35  = 70          28 28 28     = 56                fell 14, under 15: nothing (and fees overdue)
//   Chirag  25 25 25  = 50          15 14 30     = 59/150 = 39       fell 11; below 33 in English (28) and
//                                                                     Mathematics (30): MARKS
//   Dev     A  A  A   (no result)   10 30 30     = 70/150 = 47       his first exam: no fall; below 33 in one subject: nothing
//   Esha    40 40 40  = 80          A  X  40     = 80                absent and exempt left out: nothing
//   Farah   45 45 45  = 90          37.5 ×3      = 75                fell 15, on the line: MARKS
//   Gopal   45        = 90          20           = 40                fell 50: MARKS
//   Hina    30        = 60          30           = 60                nothing
type Cell = number | 'A' | 'X';
const UNIT_TEST: Record<string, Cell[]> = { [ASHA]: [40, 40, 40], [BELA]: [35, 35, 35], [CHIRAG]: [25, 25, 25], [DEV]: ['A', 'A', 'A'], [ESHA]: [40, 40, 40], [FARAH]: [45, 45, 45], [GOPAL]: [45], [HINA]: [30] };
const HALF_YEARLY: Record<string, Cell[]> = { [ASHA]: [30, 30, 30], [BELA]: [28, 28, 28], [CHIRAG]: [15, 14, 30], [DEV]: [10, 30, 30], [ESHA]: ['A', 'X', 40], [FARAH]: [37.5, 37.5, 37.5], [GOPAL]: [20], [HINA]: [30] };
const CLASS_5A = [ASHA, BELA, CHIRAG, DEV, ESHA, FARAH];
const CLASS_6B = [GOPAL, HINA];

type Exam = { examId: string; papers: { m5a: string; e5a: string; s5a: string; m6b: string } };
const exams: { unitTest?: Exam; halfYearly?: Exam } = {};
const entry = (studentId: string, cell: Cell) => (cell === 'A' ? { studentId, component: 'marks', kind: 'absent', score: null } : cell === 'X' ? { studentId, component: 'marks', kind: 'exempt', score: null } : { studentId, component: 'marks', kind: 'score', score: cell });
// The office makes an exam with a paper of 50 for each subject of 5-A and for Mathematics in 6-B (makeExam).
const make = async (name: string): Promise<Exam> => {
  const made = await as(principal, (c) =>
    makeExam(c, actor(principal), {
      name,
      sessionId: SESSION,
      term: null,
      papers: [
        { classId: C5A, subjectId: MATHS, date: null, unitIds: [], maxima: { marks: 50 } },
        { classId: C5A, subjectId: ENGLISH, date: null, unitIds: [], maxima: { marks: 50 } },
        { classId: C5A, subjectId: SCIENCE, date: null, unitIds: [], maxima: { marks: 50 } },
        { classId: C6B, subjectId: MATHS, date: null, unitIds: [], maxima: { marks: 50 } },
      ],
    })
  );
  expect(made.ok, name).toBe(true);
  const examId = (made as { examId: string }).examId;
  const rows = (await run(principal, `select paper_id, class_id, subject_id from exam_papers where exam_id = $1`, [examId])).rows;
  const of = (cls: string, subj: string) => rows.find((r) => r.class_id === cls && r.subject_id === subj).paper_id as string;
  return { examId, papers: { m5a: of(C5A, MATHS), e5a: of(C5A, ENGLISH), s5a: of(C5A, SCIENCE), m6b: of(C6B, MATHS) } };
};
// A paper's marks for its whole class, entered by the class's own teacher (saveMarks): the paper is entered once
// every child has one.
const enter = async (exam: Exam, which: keyof Exam['papers'], marks: Record<string, Cell[]>) => {
  const index = { m5a: 0, e5a: 1, s5a: 2, m6b: 0 }[which];
  const children = which === 'm6b' ? CLASS_6B : CLASS_5A;
  const who = which === 'm6b' ? tarun : tara;
  const saved = await as(who, (c) => saveMarks(c, actor(who), exam.papers[which], children.map((s) => entry(s, marks[s][index]))));
  expect(saved, which).toMatchObject({ ok: true, complete: true });
};

type Row = { flag_id: string; name: string; reasons: string[]; evidence: { marks?: MarksEvidence } & Record<string, unknown>; rule_version: number; opened_by: string | null; opened_by_job: string | null; closed: boolean; closed_reason: string | null; notified_parent: boolean };
// The rows as they are, read by the owner of the database (no role, no policy).
const stored = async (school = A): Promise<Row[]> =>
  (await db.pg.query(
    `select f.flag_id, s.name, f.reasons, f.evidence, f.rule_version, f.opened_by, f.opened_by_job, f.resolved_at is not null as closed, f.closed_reason, f.notified_parent
       from early_warning_flags f join students s on s.student_id = f.student_id where f.school_id = $1 order by s.name, f.detected_at, f.flag_id`,
    [school]
  )).rows;
const open = async () => (await stored()).filter((f) => !f.closed);
const openOf = async (name: string) => (await open()).find((f) => f.name === name);
const sentOrQueued = async () => (await db.pg.query(`select (select count(*)::int from communication_log) as messages, (select count(*)::int from jobs) as jobs`)).rows[0];
const clearFlags = () => db.pg.exec(`set session_replication_role = replica; delete from early_warning_actions; delete from early_warning_flags; delete from audit_log where event_action like 'early_warning.%'; set session_replication_role = origin;`);
const schema = settingsSchemaFor('early-warning')!;
const setSettings = async (set: Record<string, number>) => {
  const revision = Number((await db.pg.query(`select coalesce(max(revision), 0) as r from school_settings where school_id = $1 and module_id = 'early-warning'`, [A])).rows[0].r);
  expect(await as(principal, (c) => saveSettings(c, { schoolId: A, userId: PRINCIPAL, role: 'principal' }, schema, { moduleId: 'early-warning', baseRevision: revision, set }))).toMatchObject({ ok: true });
};
const resetSettings = () => db.pg.exec(`set session_replication_role = replica; delete from school_setting_changes where school_id = '${A}'; delete from school_settings where school_id = '${A}'; set session_replication_role = origin;`);

// ---- the rule, with no database -------------------------------------------------------------------------------------

const sc = (score: number): Mark => ({ kind: 'score', score });
const absent: Mark = { kind: 'absent', score: null };
const exempt: Mark = { kind: 'exempt', score: null };
const one = (id: string, subject: string, mark: Mark | undefined, max = 50) => ({ paperId: id, subjectName: subject, date: null, components: [{ key: 'marks', name: 'Marks', max, share: null }], marks: (mark ? { marks: mark } : {}) as Record<string, Mark> });
const exam = (examId: string, papers: ChildExam['papers']): ChildExam => ({ examId, name: examId, className: '5-A', papers });
const plain = { version: 3, scheme: { bands: [], decimals: 0 as const, passMark: 33, components: [] } };
const settings = { marksDropPoints: 15, marksBelowPassSubjects: 2 };

describe('the rule, with no database', () => {
  it('a fall of the school’s points or more against the child’s own exam before is a reason; less is not', () => {
    const before = exam('UT1', [one('p1', 'Mathematics', sc(40)), one('p2', 'English', sc(40))]); // 80
    const fell = (m: number, e: number) => readMarks(exam('HY', [one('p3', 'Mathematics', sc(m)), one('p4', 'English', sc(e))]), before, plain, settings);
    // 80 to 65: fifteen points, on the line, is a reason.
    expect(fell(32.5, 32.5)).toMatchObject({ fell: { by: 15, points: 15 }, belowPass: null, scheme: 3, exam: { examId: 'HY', percent: 65 }, previous: { examId: 'UT1', percent: 80 } });
    // 80 to 66: fourteen is not.
    expect(fell(33, 33)).toBeNull();
    // Rising is never a reason.
    expect(fell(50, 50)).toBeNull();
    // The school's own line.
    expect(readMarks(exam('HY', [one('p3', 'Mathematics', sc(33)), one('p4', 'English', sc(33))]), before, plain, { ...settings, marksDropPoints: 14 })).toMatchObject({ fell: { by: 14, points: 14 } });
  });

  it('the fall is measured between the percents as the scheme rounds them, as the class result shows them', () => {
    const before = exam('UT1', [one('p1', 'Mathematics', sc(36.2))]); // 72.4: 72 to a whole number, 72.4 to one place
    const now = exam('HY', [one('p2', 'Mathematics', sc(28.8))]); // 57.6: 58, or 57.6
    expect(readMarks(now, before, plain, settings)).toBeNull(); // 72 to 58 is 14
    expect(readMarks(now, before, { version: 3, scheme: { ...plain.scheme, decimals: 1 } }, settings)).toBeNull(); // 72.4 to 57.6 is 14.8: not 15 either
    expect(readMarks(now, before, { version: 3, scheme: { ...plain.scheme, decimals: 1 } }, { ...settings, marksDropPoints: 14 })).toMatchObject({ fell: { by: 14.8, points: 14 }, exam: { percent: 57.6 }, previous: { percent: 72.4 } });
  });

  it('below the pass mark in the school’s number of subjects is a reason; absent and exempt are not marks, and are below nothing', () => {
    const now = (m: Mark, e: Mark, s: Mark) => exam('HY', [one('p1', 'English', e), one('p2', 'Mathematics', m), one('p3', 'Science', s)]);
    expect(readMarks(now(sc(15), sc(14), sc(30)), null, plain, settings)).toEqual({
      exam: { examId: 'HY', name: 'HY', className: '5-A', percent: 39, papers: [{ paperId: 'p1', subject: 'English', percent: 28 }, { paperId: 'p2', subject: 'Mathematics', percent: 30 }, { paperId: 'p3', subject: 'Science', percent: 60 }] },
      previous: null,
      fell: null,
      belowPass: { subjects: [{ paperId: 'p1', subject: 'English', part: null, percent: 28, passMark: 33 }, { paperId: 'p2', subject: 'Mathematics', part: null, percent: 30, passMark: 33 }], atLeast: 2 },
      scheme: 3,
    });
    // One subject below is under the line of two.
    expect(readMarks(now(sc(10), sc(30), sc(30)), null, plain, settings)).toBeNull();
    // Absent in one, exempt in another: neither is a zero, so nothing is below.
    expect(readMarks(now(absent, exempt, sc(40)), null, plain, settings)).toBeNull();
    // On the pass mark is not below it (16.5 of 50 is 33).
    expect(readMarks(now(sc(16.5), sc(16.5), sc(40)), null, plain, settings)).toBeNull();
    // A school that asks for one subject.
    expect(readMarks(now(sc(10), sc(30), sc(30)), null, plain, { ...settings, marksBelowPassSubjects: 1 })).toMatchObject({ belowPass: { atLeast: 1, subjects: [{ subject: 'Mathematics', percent: 20 }] } });
  });

  it('a part with its own pass mark is named; a subject below in two ways is one subject', () => {
    const scheme = { version: 2, scheme: { bands: [], decimals: 0 as const, passMark: 33, components: [{ key: 'theory', kind: 'theory' as const, name: 'Theory', share: 80, passMark: 33, parts: [] }, { key: 'internal', kind: 'internal' as const, name: 'Internal', share: 20, passMark: null, parts: [] }] } };
    const two = (id: string, subject: string, theory: Mark, internal: Mark) => ({ paperId: id, subjectName: subject, date: null, components: [{ key: 'theory', name: 'Theory', max: 80, share: 80 }, { key: 'internal', name: 'Internal', max: 20, share: 20 }], marks: { theory, internal } });
    // Mathematics: theory 20 of 80 (25) with internal 20 of 20: 40 in all, yet below the theory pass mark.
    // English: theory 16 of 80 (20), internal 4 of 20 (20): below in all and in theory: one subject.
    const got = readMarks(exam('HY', [two('p1', 'English', sc(16), sc(4)), two('p2', 'Mathematics', sc(20), sc(20))]), null, scheme, settings);
    expect(got?.belowPass).toEqual({
      atLeast: 2,
      subjects: [
        { paperId: 'p1', subject: 'English', part: null, percent: 20, passMark: 33 },
        { paperId: 'p1', subject: 'English', part: 'Theory', percent: 20, passMark: 33 },
        { paperId: 'p2', subject: 'Mathematics', part: 'Theory', percent: 25, passMark: 33 },
      ],
    });
  });

  it('what cannot be judged says nothing: no earlier exam, no scheme or no pass mark, a part not entered, no mark at all', () => {
    const low = exam('HY', [one('p1', 'English', sc(5)), one('p2', 'Mathematics', sc(5))]); // 10 in all
    // No scheme: percents to one decimal place, no pass mark to be below; a first exam: no fall.
    expect(readMarks(low, null, null, settings)).toBeNull();
    // No scheme, but an exam before: the fall alone, to one decimal place.
    expect(readMarks(exam('HY', [one('p1', 'English', sc(20.1))]), exam('UT', [one('p0', 'English', sc(40))]), null, settings)).toMatchObject({ fell: { by: 39.8 }, belowPass: null, scheme: null, exam: { percent: 40.2 } });
    // A scheme with no pass mark.
    expect(readMarks(low, null, { version: 1, scheme: { ...plain.scheme, passMark: null } }, settings)).toBeNull();
    // A paper with nothing entered for the child: no percent yet, so nothing at all.
    expect(readMarks(exam('HY', [one('p1', 'English', sc(5)), one('p2', 'Mathematics', undefined)]), exam('UT', [one('p0', 'English', sc(50))]), plain, settings)).toBeNull();
    // Absent throughout: no percent.
    expect(readMarks(exam('HY', [one('p1', 'English', absent)]), exam('UT', [one('p0', 'English', sc(50))]), plain, settings)).toBeNull();
    expect(readMarks(null, null, plain, settings)).toBeNull();
  });

  it('four reasons, marks last; rule version 2; and the two numbers are the school’s settings with their defaults', () => {
    expect(REASONS).toEqual(['attendance', 'homework', 'needs_help', 'marks']);
    expect(EARLY_WARNING_RULE_VERSION).toBe(2);
    expect(DEFAULT_SETTINGS).toMatchObject({ marksDropPoints: 15, marksBelowPassSubjects: 2 });
    expect(schema.version).toBe(2);
    expect(schema.fields.filter((f) => f.section === 'Marks').map((f) => [f.key, f.default, f.min, f.max, [...f.editableBy]])).toEqual([
      ['marks_drop_points', 15, 1, 100, ['principal', 'school_admin']],
      ['marks_below_pass_subjects', 2, 1, 12, ['principal', 'school_admin']],
    ]);
  });

  it('the words: in both languages, the same placeholders, and none that judges or ranks a child', () => {
    const mine = (all: Record<string, string>) => Object.entries(all).filter(([k]) => /^(ew\.(reason|line|why|rule)\.marks|set\.early-warning\.marks_)/.test(k));
    expect(mine(en).length).toBeGreaterThanOrEqual(22);
    expect(mine(hi).map(([k]) => k)).toEqual(mine(en).map(([k]) => k));
    const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const H = hi as Record<string, string>;
    for (const [k, v] of mine(en)) {
      expect(holes(H[k]), k).toEqual(holes(v));
      expect(H[k], k).toMatch(/[ऀ-ॿ]/);
      expect(v, k).not.toMatch(/\b(rank|position|topper|merit|percentile|average|weak|poor|bad|fail(s|ed|ing|ure)?|lazy|slow|worst|at[- ]risk)\b/i);
    }
    expect(t('en', 'ew.rule.marks', { points: 15, subjects: 2 })).toContain('compared only with themselves');
    expect(t('en', 'ew.what.text')).toContain('exam marks');
    expect(t('en', 'tour.early-warning.1.text')).toContain('exam marks');
  });

  it('the code reads no fee and sends nothing: no fee table, no sender, no queue, no model', () => {
    const dir = path.join(ROOT, 'src/lib/early-warning');
    for (const f of readdirSync(dir)) {
      const source = readFileSync(path.join(dir, f), 'utf8');
      expect(source, f).not.toMatch(/\b(from|join)\s+(fees_ledger|fee_[a-z_]+|payments|invoices)\b|fees_ledger/i);
      expect(source, f).not.toMatch(/from '@\/lib\/(fees|whatsapp|jobs|pulse|communication|consent|ai|copilot|parent-ai)/);
      expect(source, f).not.toMatch(/insert into (communication_log|jobs)|sendWhatsApp|enqueue|dispatch_enabled/i);
    }
    // The migration adds no job, schedule, template or message, and gives no one a new right.
    const mig = path.join(ROOT, 'supabase/migrations');
    const sql = readFileSync(path.join(mig, readdirSync(mig).find((f) => f.endsWith('_p6_early_warning_marks.sql'))!), 'utf8').replace(/^\s*--.*$/gm, '');
    expect(sql).not.toMatch(/jobs_enqueue|insert into jobs|cron\.|whatsapp_templates|communication_log|\bgrant\b|create policy|alter policy|notified_parent/i);
    expect(sql).toContain("'marks'");
  });
});

// ---- on the whole schema ----------------------------------------------------------------------------------------------

describe('on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      set session_replication_role = replica;
      insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
      insert into users (user_id, school_id, email, role, display_name, is_active) values
        ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal', true), ('${ADMIN}', '${A}', 'admin@school-a.example', 'school_admin', 'Asif Admin', true),
        ('${COORDINATOR}', '${A}', 'coordinator@school-a.example', 'academic_coordinator', 'Chitra Coordinator', true), ('${TARA}', '${A}', 'tara@school-a.example', 'teacher', 'Tara Teacher', true),
        ('${TARUN}', '${A}', 'tarun@school-a.example', 'teacher', 'Tarun Teacher', true), ('${ACCOUNTANT}', '${A}', 'accounts@school-a.example', 'accountant', 'Anil Accountant', true),
        ('${PARENT}', '${A}', 'parent@school-a.example', 'parent', 'Pooja Parent', true), ('${B_PRINCIPAL}', '${B}', 'principal@school-b.example', 'principal', 'Bela Principal', true);
      insert into school_entitlements (school_id, plan, access_mode) values ('${A}', 'standard', 'full'), ('${B}', 'standard', 'full') on conflict (school_id) do nothing;
      insert into school_module_entitlements (school_id, module_id, enabled, source) values
        ('${A}', 'early-warning', true, 'plan'), ('${A}', 'recovery', true, 'plan'), ('${A}', 'setup', true, 'plan'), ('${A}', 'exams', true, 'plan'), ('${B}', 'early-warning', true, 'plan')
        on conflict (school_id, module_id) do update set enabled = excluded.enabled;
      insert into teachers (teacher_id, school_id, user_id, name) values (gen_random_uuid(), '${A}', '${TARA}', 'Tara Teacher'), (gen_random_uuid(), '${A}', '${TARUN}', 'Tarun Teacher');
      insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values ('${SESSION}', '${A}', '2026-27', '2026-04-01', '2027-03-31', true);
      insert into classes (class_id, school_id, name, class_teacher_id) values ('${C5A}', '${A}', '5-A', '${TARA}'), ('${C6B}', '${A}', '6-B', '${TARUN}');
      insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Mathematics'), ('${ENGLISH}', '${A}', 'English'), ('${SCIENCE}', '${A}', 'Science');
      insert into teacher_subjects (school_id, teacher_id, subject_id, class_id)
        select '${A}', t.teacher_id, '${MATHS}', '${C6B}' from teachers t where t.user_id = '${TARUN}';
      insert into students (student_id, school_id, admission_no, name, status, class_id, roll_no) values
        ${CLASS_5A.map((s, i) => `('${s}', '${A}', 'A-${i + 1}', '${NAMES[s]}', 'active', '${C5A}', '${i + 1}')`).join(', ')},
        ${CLASS_6B.map((s, i) => `('${s}', '${A}', 'B-${i + 1}', '${NAMES[s]}', 'active', '${C6B}', '${i + 1}')`).join(', ')};
      -- A guardian of each child who could be written to, with consent for exactly that.
      insert into parents (parent_id, school_id, name, phone) values ('${u(201)}', '${A}', 'Anita Madeup', '9000000001');
      insert into parent_student_map (school_id, parent_id, student_id) select '${A}', '${u(201)}', s from unnest(array['${ASHA}', '${CHIRAG}', '${FARAH}']::uuid[]) s;
      insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version)
        select '${A}', s, p::consent_purpose, true, (enum_range(null::consent_method))[1], 'v1' from unnest(array['${ASHA}'::uuid, '${CHIRAG}'::uuid, '${FARAH}'::uuid]) s, unnest(array['core_records', 'operational_communication', 'at_risk']) p;
      update schools set at_risk_parent_dispatch_enabled = true where school_id = '${A}';
      -- Bela and Hina owe fees long overdue: never a reason.
      insert into fees_ledger (school_id, student_id, amount_minor, gross_minor, due_date, status) values ('${A}', '${BELA}', 500000, 500000, '2026-04-10', 'overdue'), ('${A}', '${HINA}', 250000, 250000, '2026-05-10', 'overdue');
      -- Asha has an open "did not understand" follow-up: a flag before any exam counts.
      insert into pulse_followups (followup_id, school_id, student_id, class_id, kind, source, status, created_by, created_at) values
        ('${u(901)}', '${A}', '${ASHA}', '${C5A}', 'did_not_understand', 'staff', 'open', '${TARA}', now() - interval '2 days');
      set session_replication_role = origin;
    `);
    await db.pg.query(`insert into grading_schemes (school_id, version, scheme, made_by) values ($1, 1, $2::jsonb, $3)`, [A, JSON.stringify(SCHEME), PRINCIPAL]);
    state.tenant = (claims: { role: string; sub: string; schoolId: string }, fn: (c: unknown) => Promise<unknown>) => as({ role: claims.role, user: claims.sub, school: claims.schoolId }, fn);
  }, 120_000);
  afterAll(async () => db?.stop());

  describe('“After a publish, the next check opens or updates a flag with the marks reason and its evidence for a child whose own marks fell past the line.”', () => {
    it('before an exam’s papers for a class are all entered, it is not counted: only Asha’s follow-up gives a flag', async () => {
      exams.unitTest = await make('Unit test 1');
      for (const p of ['m5a', 'e5a', 's5a', 'm6b'] as const) await enter(exams.unitTest, p, UNIT_TEST);
      exams.halfYearly = await make('Half-yearly');
      // The half-yearly's Mathematics paper of 5-A is entered, with Chirag's low mark; English, Science and 6-B are not yet.
      await enter(exams.halfYearly, 'm5a', HALF_YEARLY);
      const partly = await as(tara, (c) => saveMarks(c, actor(tara), exams.halfYearly!.papers.e5a, [entry(CHIRAG, 14), entry(ASHA, 30)]));
      expect(partly).toMatchObject({ ok: true, complete: false });
      expect(await check(principal, 0)).toEqual({ ok: true, students: 8, attendanceUsed: 0, opened: 1, changed: 0, kept: 0, closed: 0, open: 1 });
      expect((await open()).map((f) => [f.name, f.reasons, f.rule_version])).toEqual([['Asha', ['needs_help'], 2]]);
    });

    it('once the last paper is entered, the next check opens flags for marks and adds the reason to an open flag', async () => {
      const asha = (await openOf('Asha'))!;
      await enter(exams.halfYearly!, 'e5a', HALF_YEARLY);
      await enter(exams.halfYearly!, 's5a', HALF_YEARLY);
      await enter(exams.halfYearly!, 'm6b', HALF_YEARLY);
      const before = await sentOrQueued();
      expect(await check(coordinator, 10)).toEqual({ ok: true, students: 8, attendanceUsed: 0, opened: 3, changed: 1, kept: 0, closed: 0, open: 4 });
      const rows = await open();
      expect(rows.map((f) => [f.name, f.reasons])).toEqual([['Asha', ['needs_help', 'marks']], ['Chirag', ['marks']], ['Farah', ['marks']], ['Gopal', ['marks']]]);
      // Asha's flag is the one already open, brought up to date: the same flag, the person who opened it, rule version 2.
      expect(rows[0]).toMatchObject({ flag_id: asha.flag_id, opened_by: PRINCIPAL, rule_version: 2 });
      for (const f of rows) expect(f, f.name).toMatchObject({ rule_version: EARLY_WARNING_RULE_VERSION, notified_parent: false });
      // Nothing was written for a parent, though each flagged child has a guardian with a number, consent and the switch on.
      expect(await sentOrQueued()).toEqual(before);
    });

    it('the evidence names the exams, the papers and the percents, worked out by hand', async () => {
      const ut = exams.unitTest!;
      const hy = exams.halfYearly!;
      const papers = (e: Exam, english: number, maths: number, science: number) => [
        { paperId: e.papers.e5a, subject: 'English', percent: english },
        { paperId: e.papers.m5a, subject: 'Mathematics', percent: maths },
        { paperId: e.papers.s5a, subject: 'Science', percent: science },
      ];
      const fiveA = (e: Exam, name: string, percent: number, english: number, maths: number, science: number) => ({ examId: e.examId, name, className: '5-A', percent, papers: papers(e, english, maths, science) });
      expect((await openOf('Asha'))!.evidence.marks).toEqual({ exam: fiveA(hy, 'Half-yearly', 60, 60, 60, 60), previous: fiveA(ut, 'Unit test 1', 80, 80, 80, 80), fell: { by: 20, points: 15 }, belowPass: null, scheme: 1 });
      expect((await openOf('Chirag'))!.evidence.marks).toEqual({
        exam: fiveA(hy, 'Half-yearly', 39, 28, 30, 60),
        previous: fiveA(ut, 'Unit test 1', 50, 50, 50, 50),
        fell: null,
        belowPass: { subjects: [{ paperId: hy.papers.e5a, subject: 'English', part: null, percent: 28, passMark: 33 }, { paperId: hy.papers.m5a, subject: 'Mathematics', part: null, percent: 30, passMark: 33 }], atLeast: 2 },
        scheme: 1,
      });
      // On the line is past it: fifteen points is "at least fifteen".
      expect((await openOf('Farah'))!.evidence.marks).toMatchObject({ exam: { percent: 75 }, previous: { percent: 90 }, fell: { by: 15, points: 15 }, belowPass: null });
      expect((await openOf('Gopal'))!.evidence.marks).toEqual({
        exam: { examId: hy.examId, name: 'Half-yearly', className: '6-B', percent: 40, papers: [{ paperId: hy.papers.m6b, subject: 'Mathematics', percent: 40 }] },
        previous: { examId: ut.examId, name: 'Unit test 1', className: '6-B', percent: 90, papers: [{ paperId: ut.papers.m6b, subject: 'Mathematics', percent: 90 }] },
        fell: { by: 50, points: 15 },
        belowPass: null,
        scheme: 1,
      });
      // One rule in one place: the percents are the class result's own.
      const result = await as(principal, (c) => classResult(c, actor(principal), hy.examId, C5A));
      const chirag = result!.children.find((ch) => ch.name === 'Chirag')!;
      expect([chirag.overall.rounded, ...chirag.papers.map((p) => p.rounded)]).toEqual([39, 28, 30, 60]);
      expect(result!.children.find((ch) => ch.name === 'Asha')!.overall.rounded).toBe(60);
    });

    it('running it again changes nothing; a correction to an earlier exam brings the evidence up to date without making that exam the latest', async () => {
      expect(await check(principal, 11)).toMatchObject({ opened: 0, changed: 0, kept: 4, closed: 0, open: 4 });
      // The coordinator corrects Asha's Unit test 1 Mathematics mark from 40 to 41.5: that paper is recorded as
      // entered again, in her name, now: after every paper of the half-yearly.
      expect(await as(coordinator, (c) => saveMarks(c, actor(coordinator), exams.unitTest!.papers.m5a, [entry(ASHA, 41.5)]))).toMatchObject({ ok: true, complete: true });
      const entered = (await db.pg.query(`select exam_id, max(entered_at) as last from exam_papers where school_id = $1 group by exam_id`, [A])).rows;
      const last = (id: string) => new Date(entered.find((r: { exam_id: string }) => r.exam_id === id).last).getTime();
      expect(last(exams.unitTest!.examId)).toBeGreaterThan(last(exams.halfYearly!.examId));
      expect(await check(principal, 12)).toMatchObject({ opened: 0, changed: 1, kept: 3, closed: 0 });
      // The half-yearly is still her latest (made last); Unit test 1 is now 121.5 of 150, 81.
      expect((await openOf('Asha'))!.evidence.marks).toMatchObject({ exam: { name: 'Half-yearly', percent: 60 }, previous: { name: 'Unit test 1', percent: 81 }, fell: { by: 21, points: 15 } });
    });

    it('the nightly check uses the same rule: the same flags, reasons and evidence, marked as the nightly check’s', async () => {
      const byHand = (await open()).map((f) => ({ name: f.name, reasons: f.reasons, evidence: f.evidence }));
      await clearFlags();
      const job: ClaimedJob = { jobId: u(990), type: NIGHTLY_CHECK_JOB, payload: { date: TODAY }, attempts: 1, maxAttempts: 5, schoolId: A, idempotencyKey: `${NIGHTLY_CHECK_JOB}:${A}:${TODAY}` };
      const outcomes: string[] = [];
      await earlyWarningNightlyHandler({ asSchool, now: () => at(20), onDone: (_s, o) => outcomes.push(o) })(job);
      expect(outcomes).toEqual(['done']);
      const nightly = await open();
      expect(nightly.map((f) => ({ name: f.name, reasons: f.reasons, evidence: f.evidence }))).toEqual(byHand);
      for (const f of nightly) expect(f, f.name).toMatchObject({ opened_by: null, opened_by_job: NIGHTLY_CHECK_JOB, rule_version: 2 });
      // Back to a person's check for the rest.
      await clearFlags();
      await check(principal, 21);
    });
  });

  describe('“A child above it is not flagged.”', () => {
    it('a fall under the line, a first exam, one subject below, absent and exempt, a steady child: no marks reason', async () => {
      const flagged = (await open()).map((f) => f.name);
      // Bela fell 14 (70 to 56); Dev's half-yearly is his first result (absent throughout the unit test) and he is
      // below the pass mark in Mathematics alone; Esha was absent in Mathematics and exempt in English (80 to 80:
      // had absent counted as zero she would be at 27); Hina is where she was.
      for (const name of ['Bela', 'Dev', 'Esha', 'Hina']) expect(flagged, name).not.toContain(name);
    });

    it('a mark corrected above the line takes the reason away at the next check, and the flag closes', async () => {
      // Farah's Mathematics 37.5 becomes 40: 115 of 150 is 77, a fall of 13.
      expect(await as(tara, (c) => saveMarks(c, actor(tara), exams.halfYearly!.papers.m5a, [entry(FARAH, 40)]))).toMatchObject({ ok: true, complete: true });
      expect(await check(admin, 30)).toMatchObject({ opened: 0, closed: 1, open: 3 });
      expect((await stored()).find((f) => f.name === 'Farah')).toMatchObject({ closed: true, closed_reason: 'signals_cleared', reasons: ['marks'] });
      await as(tara, (c) => saveMarks(c, actor(tara), exams.halfYearly!.papers.m5a, [entry(FARAH, 37.5)]));
    });

    it('the lines are the school’s settings: stricter lines flag fewer, looser more, and each flag says the numbers it used', async () => {
      await setSettings({ marks_drop_points: 25, marks_below_pass_subjects: 3 });
      expect(await as(coordinator, (c) => earlyWarningSettings(c, A))).toEqual({ ...DEFAULT_SETTINGS, marksDropPoints: 25, marksBelowPassSubjects: 3 });
      await check(principal, 31);
      // Asha (21) and Chirag (two subjects) are under the new lines; Gopal (50) is not; Asha keeps her follow-up.
      expect((await open()).map((f) => [f.name, f.reasons])).toEqual([['Asha', ['needs_help']], ['Gopal', ['marks']]]);
      expect((await openOf('Gopal'))!.evidence.marks!.fell).toEqual({ by: 50, points: 25 });
      await setSettings({ marks_drop_points: 10, marks_below_pass_subjects: 1 });
      await check(principal, 32);
      // Bela (14) and Farah (15) fall past ten; Dev is below the pass mark in one subject.
      expect((await open()).map((f) => [f.name, f.reasons])).toEqual([['Asha', ['needs_help', 'marks']], ['Bela', ['marks']], ['Chirag', ['marks']], ['Dev', ['marks']], ['Farah', ['marks']], ['Gopal', ['marks']]]);
      expect((await openOf('Dev'))!.evidence.marks).toMatchObject({ previous: null, fell: null, belowPass: { atLeast: 1, subjects: [{ subject: 'Mathematics', percent: 20, passMark: 33 }] } });
      // Esha is never flagged: absent is not zero.
      expect((await open()).map((f) => f.name)).not.toContain('Esha');
      await resetSettings();
      await check(principal, 33);
      expect((await open()).map((f) => f.name)).toEqual(['Asha', 'Chirag', 'Farah', 'Gopal']);
    });
  });

  describe('“Fees are never a signal.”', () => {
    it('the children who owe fees are flagged only for their own marks, and no evidence holds a fee', async () => {
      expect((await db.pg.query(`select count(*)::int as n from fees_ledger where school_id = $1 and status = 'overdue'`, [A])).rows[0].n).toBe(2);
      const rows = await stored();
      expect(rows.map((f) => f.name)).not.toContain('Hina');
      expect(JSON.stringify(rows.map((f) => f.evidence))).not.toMatch(/fee|amount|paise|minor|overdue/i);
      // The database refuses fees as a reason, whatever the rule version.
      await expect(run(principal, `insert into early_warning_flags (school_id, student_id, class_id, reasons, evidence, rule_version, opened_by) values ($1, $2, $3, '{fees}', '{"fees": {}}', 2, $4)`, [A, BELA, C5A, PRINCIPAL])).rejects.toThrow(/early_warning_flags_reasons/);
    });
  });

  describe('“Nothing reaches a parent.”', () => {
    it('no message and no job from any check; a parent account reads no flag; notified_parent stays false', async () => {
      const before = await sentOrQueued();
      await check(principal, 40);
      await check(coordinator, 41);
      expect(await sentOrQueued()).toEqual(before);
      expect((await run(parent, `select count(*)::int as n from early_warning_flags`)).rows[0].n).toBe(0);
      expect((await db.pg.query(`select count(*)::int as n from early_warning_flags where notified_parent`)).rows[0].n).toBe(0);
    });
  });

  describe('who reads a marks flag, and the database’s own rules', () => {
    it('a teacher reads her own classes’ marks flags only; the accountant, another school and the platform read none', async () => {
      const names = async (who: Who) => (await run(who, `select s.name, f.evidence ? 'marks' as marks from early_warning_flags f join students s on s.school_id = f.school_id and s.student_id = f.student_id where f.resolved_at is null order by s.name`)).rows.map((r) => [r.name, r.marks]);
      expect(await names(tara)).toEqual([['Asha', true], ['Chirag', true], ['Farah', true]]);
      expect(await names(tarun)).toEqual([['Gopal', true]]);
      expect(await names(accountant)).toEqual([]);
      expect(await names(elsewhere)).toEqual([]);
      await expect(platform((c) => c.query(`select count(*) from early_warning_flags`))).rejects.toThrow(/permission denied/);
      // Through the app: a teacher's list is her own classes'; she cannot run the check.
      expect((await as(tara, (c) => listFlags(c, actor(tara), at(42)))).open.map((f) => f.student_name)).toEqual(['Asha', 'Chirag', 'Farah']);
      expect(await as(tara, (c) => runCheck(c, actor(tara), at(42)))).toEqual({ ok: false, reason: 'not_allowed' });
    });

    it('marks is a reason only from rule version 2, and names its exam; a flag of version 1 stays valid and readable', async () => {
      const put = (student: string, reasons: string[], evidence: unknown, version: number) =>
        run(principal, `insert into early_warning_flags (school_id, student_id, class_id, reasons, evidence, rule_version, opened_by) values ($1, $2, $3, $4::text[], $5::jsonb, $6, $7)`, [A, student, C6B, reasons, JSON.stringify(evidence), version, PRINCIPAL]);
      await clearFlags();
      await expect(put(HINA, ['marks'], { marks: { exam: {} } }, 1)).rejects.toThrow(/early_warning_flags_reasons/);
      await expect(put(HINA, ['marks'], { marks: { previous: null } }, 2)).rejects.toThrow(/early_warning_flags_marks_evidence/);
      await expect(put(HINA, ['marks', 'marks'], { marks: { exam: {} } }, 2)).rejects.toThrow(/a reason is given once/);
      // Flags of version 1, as the flags already on record are. Hina's is closed as version 1; Gopal's is open.
      await put(HINA, ['needs_help'], { needs_help: { open: [] } }, 1);
      const hina = (await stored()).find((f) => f.name === 'Hina')!;
      await run(principal, `update early_warning_flags set resolved_at = now(), closed_reason = 'signals_cleared', closed_by = $2 where flag_id = $1`, [hina.flag_id, PRINCIPAL]);
      await put(GOPAL, ['needs_help'], { needs_help: { open: [] } }, 1);
      const gopal = (await openOf('Gopal'))!;
      expect(await check(principal, 44)).toMatchObject({ opened: 3, changed: 1, closed: 0, open: 4 });
      // The open one is worked out again by rule version 2: the same flag, now for his marks.
      expect(await openOf('Gopal')).toMatchObject({ flag_id: gopal.flag_id, reasons: ['marks'], rule_version: 2, opened_by: PRINCIPAL });
      // The closed one stays as it was, and is read as it was.
      expect((await stored()).find((f) => f.flag_id === hina.flag_id)).toMatchObject({ rule_version: 1, reasons: ['needs_help'], closed: true });
      const lists = await as(principal, (c) => listFlags(c, actor(principal), at(45)));
      expect(lists.closed.find((f) => f.flag_id === hina.flag_id)).toMatchObject({ student_name: 'Hina', rule_version: 1, reasons: ['needs_help'], closed_reason: 'signals_cleared' });
    });

    it('through the routes: "Check now" and the screen carry the marks reason, its evidence and the two settings in force', async () => {
      const claims = (who: Who) => ({ sub: who.user, role: who.role, schoolId: who.school ?? A, membershipId: u(90), tokenVersion: 0, aal: 'aal1', sessionId: u(91) });
      const req = (method: string, url: string, body?: unknown) => new NextRequest(`http://localhost${url}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      const call = async (who: Who, fn: () => Promise<Response>) => {
        state.claims = claims(who);
        const res = await fn();
        return { status: res.status, body: await res.json() };
      };
      await clearFlags();
      expect(await call(coordinator, () => postCheck(req('POST', '/api/app/early-warning', {})))).toEqual({ status: 200, body: { students: 8, attendanceUsed: 0, opened: 4, changed: 0, kept: 0, closed: 0, open: 4 } });
      const screen = await call(principal, () => getScreen(req('GET', '/api/app/early-warning')));
      expect(screen.status).toBe(200);
      expect(screen.body).toMatchObject({ ruleVersion: 2, settings: DEFAULT_SETTINGS, lastCheck: { ruleVersion: 2, by: 'Chitra Coordinator' } });
      const chirag = screen.body.open.find((f: { student_name: string }) => f.student_name === 'Chirag');
      expect(chirag).toMatchObject({ reasons: ['marks'], rule_version: 2, evidence: { marks: { exam: { name: 'Half-yearly', percent: 39 }, belowPass: { atLeast: 2 } } } });
      // The accountant: refused.
      expect((await call(accountant, () => getScreen(req('GET', '/api/app/early-warning')))).status).toBe(403);
    });
  });

  describe('which exam is a child’s latest', () => {
    it('the one sat last, by its papers’ dates: an exam made last for papers sat earlier is not the latest; dated later, it is', async () => {
      // "Practice test" is made now, after every other exam, for papers dated a month ago; everyone has full marks.
      const made = await as(principal, (c) =>
        makeExam(c, actor(principal), {
          name: 'Practice test',
          sessionId: SESSION,
          term: null,
          papers: [[C5A, MATHS], [C5A, ENGLISH], [C5A, SCIENCE], [C6B, MATHS]].map(([classId, subjectId]) => ({ classId, subjectId, date: day(30), unitIds: [], maxima: { marks: 50 } })),
        })
      );
      expect(made.ok).toBe(true);
      const examId = (made as { examId: string }).examId;
      const rows = (await run(principal, `select paper_id, class_id, subject_id from exam_papers where exam_id = $1`, [examId])).rows;
      const of = (cls: string, subj: string) => rows.find((r) => r.class_id === cls && r.subject_id === subj).paper_id as string;
      const practice: Exam = { examId, papers: { m5a: of(C5A, MATHS), e5a: of(C5A, ENGLISH), s5a: of(C5A, SCIENCE), m6b: of(C6B, MATHS) } };
      const full = Object.fromEntries([...CLASS_5A.map((s) => [s, [50, 50, 50]]), ...CLASS_6B.map((s) => [s, [50]])]) as Record<string, Cell[]>;
      for (const p of ['m5a', 'e5a', 's5a', 'm6b'] as const) await enter(practice, p, full);
      await clearFlags();
      await check(principal, 50);
      // Sat a month ago: the half-yearly and the unit test (no paper dated: the day each was made, today) are later.
      // Asha's latest is still the half-yearly and her previous the unit test. Dev, absent throughout the unit test,
      // now has an earlier result: the practice test (100), so his half-yearly (47) is a fall of 53.
      expect((await open()).map((f) => [f.name, f.reasons])).toEqual([['Asha', ['needs_help', 'marks']], ['Chirag', ['marks']], ['Dev', ['marks']], ['Farah', ['marks']], ['Gopal', ['marks']]]);
      expect((await openOf('Asha'))!.evidence.marks).toMatchObject({ exam: { name: 'Half-yearly' }, previous: { name: 'Unit test 1' }, fell: { by: 21 } });
      expect((await openOf('Dev'))!.evidence.marks).toMatchObject({ exam: { name: 'Half-yearly', percent: 47 }, previous: { name: 'Practice test', percent: 100 }, fell: { by: 53, points: 15 } });
      // The office moves its papers to tomorrow: now it is the latest, full marks everywhere, and no marks reason is left.
      expect((await run(principal, `update exam_papers set paper_date = $2 where exam_id = $1`, [examId, day(-1)])).rowCount).toBe(4);
      expect(await check(principal, 51)).toMatchObject({ opened: 0, changed: 1, closed: 4, open: 1 });
      expect((await open()).map((f) => [f.name, f.reasons])).toEqual([['Asha', ['needs_help']]]);
    });
  });
});
