import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { GenomeChild } from '@/components/genome/GenomeChild';
import { helpArticle } from '@/content/help/articles';
import { moduleById } from '@/lib/contracts/modules';
import { TOURS } from '@/lib/contracts/tours';
import { percent } from '@/lib/exams/grading';
import { publishClass, reopenClass } from '@/lib/exams/publish';
import { classResult } from '@/lib/exams/results';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { saveSettings } from '@/lib/frameworks/settings-store';
import { readModuleFor, writeModuleFor } from '@/lib/frameworks/write-guard';
import { childGenome, COUNTED_PAPER, genomePicker } from '@/lib/genome/genome';
import { DEFAULT_GENOME_SETTINGS, chapterFindings, findings, homeworkFinding, spreadFindings, trendFinding, type ExamPoint, type Genome, type SubjectGenome } from '@/lib/genome/rules';
import { en } from '@/lib/i18n/messages/en';
import { indiaDate } from '@/lib/time/india';

// Learning Genome v1 (docs/27 row 9e, C217). The acceptance test: "For a child with marks, replies and homework,
// every number equals its source rows. No other child's data appears. A teacher of another class is refused by the
// app and the database. No model is called." Proven on the whole schema as the app's own database role, through the
// app's code, its routes, and by going to the database directly. Every name and number is made up.

const state = vi.hoisted(() => ({ claims: null as unknown, tenant: null as unknown, asked: 0 }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/server-session', () => ({ getServerSession: async () => state.claims }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => (state.tenant as any)(claims, fn),
}));
// The AI provider, watched: asking for one is counted. The genome must never ask.
vi.mock('@/lib/ai/provider', async (original) => {
  const real = await original<typeof import('@/lib/ai/provider')>();
  return {
    ...real,
    configuredProvider: (...args: Parameters<typeof real.configuredProvider>) => {
      state.asked += 1;
      return real.configuredProvider(...args);
    },
  };
});

import { GET as getPicker } from '@/app/api/app/learning-genome/route';
import { GET as getGenome } from '@/app/api/app/learning-genome/[studentId]/route';

const SRC = path.resolve(__dirname, '../../src');
const MIGRATIONS = path.resolve(__dirname, '../../supabase/migrations');
const MIGRATION = path.join(MIGRATIONS, readdirSync(MIGRATIONS).find((f) => f.endsWith('_p6_learning_genome.sql')) ?? 'missing');

// ---- the rules on their own ------------------------------------------------------------------------------------------

const point = (examId: string, rounded: number | null, examName = examId): ExamPoint => ({
  paperId: `${examId}-p`, examId, examName, term: null, date: null, className: '5-A', components: [], marks: {},
  shown: { percent: rounded, rounded, grade: { kind: 'no_grade', reason: 'no_scheme' } },
});
const subject = (name: string, exams: ExamPoint[], homework = { done: 0, checked: 0 }): SubjectGenome => ({ subjectId: name, subjectName: name, exams, homework: { ...homework, firstDue: null, lastDue: null } });
const S = DEFAULT_GENOME_SETTINGS;

describe('the rules compare the child only with themselves', () => {
  it('a subject rose or fell against their own previous exam with a percent; on the line counts, under it does not', () => {
    expect(trendFinding(subject('Maths', [point('e1', 54, 'Unit test'), point('e2', 66, 'Half-yearly')]), S)).toEqual({ rule: 'rising', subjectId: 'Maths', subjectName: 'Maths', before: { examName: 'Unit test', rounded: 54 }, after: { examName: 'Half-yearly', rounded: 66 }, points: 12, line: 10 });
    expect(trendFinding(subject('Maths', [point('e1', 60), point('e2', 50)]), S)).toMatchObject({ rule: 'falling', points: 10, line: 10 });
    expect(trendFinding(subject('Maths', [point('e1', 60), point('e2', 50.1)]), S)).toBeNull(); // 9.9 points: under the line
    // An exam without a percent (absent, exempt, not complete) is skipped: the comparison is between two percents.
    expect(trendFinding(subject('Maths', [point('e1', 40), point('e2', null), point('e3', 52)]), S)).toMatchObject({ rule: 'rising', points: 12 });
    expect(trendFinding(subject('Maths', [point('e1', 40)]), S)).toBeNull();
    // Differences are on the shown percents, to one decimal place.
    expect(trendFinding(subject('Maths', [point('e1', 54.2), point('e2', 66.1)]), S)).toMatchObject({ points: 11.9 });
  });

  it('a subject against their own overall in the same exam, only with two subjects or more', () => {
    const overall = { examId: 'e2', examName: 'Half-yearly', shown: { percent: 53, rounded: 53, grade: { kind: 'no_grade' as const, reason: 'no_scheme' as const } }, subjects: 2 };
    const list = [subject('English', [point('e2', 40)]), subject('Maths', [point('e1', 99), point('e2', 66)]), subject('Science', [point('e2', 55)])];
    expect(spreadFindings(list, overall, S)).toEqual([
      { rule: 'below_own', subjectId: 'English', subjectName: 'English', examName: 'Half-yearly', rounded: 40, overall: 53, points: 13, line: 10 },
      { rule: 'above_own', subjectId: 'Maths', subjectName: 'Maths', examName: 'Half-yearly', rounded: 66, overall: 53, points: 13, line: 10 },
    ]);
    expect(spreadFindings(list, { ...overall, subjects: 1 }, S)).toEqual([]);
    expect(spreadFindings(list, null, S)).toEqual([]);
  });

  it('a chapter by its own replies; homework by its own checks, on the counts and never a rounded rate', () => {
    const ch = (chapter: string, needsHelp: number, understood: number) => ({ classId: 'c', className: '5-A', subjectId: 'm', subjectName: 'Maths', chapter, needsHelp, understood, lessons: 1, firstTaught: '2026-10-01', lastTaught: '2026-10-01' });
    expect(chapterFindings([ch('Fractions', 2, 1), ch('Decimals', 0, 3), ch('Shapes', 1, 5), ch('Time', 1, 0)], S).map((f) => [f.rule, (f as { chapter: string }).chapter])).toEqual([['needs_help', 'Fractions'], ['understood', 'Decimals']]);
    expect(homeworkFinding(subject('Maths', [], { done: 2, checked: 6 }), S)).toMatchObject({ rule: 'homework', done: 2, checked: 6, line: 60, min: 5 });
    expect(homeworkFinding(subject('Maths', [], { done: 3, checked: 5 }), S)).toBeNull(); // exactly 60 in every 100: not fewer
    expect(homeworkFinding(subject('Maths', [], { done: 0, checked: 4 }), S)).toBeNull(); // fewer than 5 checked
  });

  it('strengths and gaps are listed by subject name, then rule, never by how far a child is from anyone', () => {
    const overall = { examId: 'e2', examName: 'Half-yearly', shown: { percent: 53, rounded: 53, grade: { kind: 'no_grade' as const, reason: 'no_scheme' as const } }, subjects: 2 };
    const list = [subject('English', [point('e1', 60), point('e2', 40)]), subject('Maths', [point('e1', 54), point('e2', 66)], { done: 2, checked: 6 })];
    const out = findings(list, [], overall, S);
    expect(out.strengths.map((f) => `${f.subjectName}:${f.rule}`)).toEqual(['Maths:rising', 'Maths:above_own']);
    expect(out.gaps.map((f) => `${f.subjectName}:${f.rule}`)).toEqual(['English:falling', 'English:below_own', 'Maths:homework']);
  });
});

// ---- on the whole schema ---------------------------------------------------------------------------------------------

const A = 'e9000000-0000-4000-8000-000000000001';
const B = 'e9000000-0000-4000-8000-000000000002';
const u = (n: number) => `e9000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [PRINCIPAL, ADMIN, COORDINATOR, TARA, TANVI, TARUN, ACCOUNTANT, B_PRINCIPAL] = [u(11), u(12), u(13), u(14), u(15), u(16), u(17), u(18)];
const [T_TARA, T_TANVI, T_TARUN] = [u(24), u(25), u(26)];
const [C5A, C6B, CB] = [u(51), u(52), u(53)];
const [MATHS, ENGLISH, SCIENCE] = [u(61), u(62), u(63)];
const [ASHA, BELA, FARAH] = [u(31), u(32), u(33)];
const [G_ASHA, G_BELA] = [u(41), u(42)];
const [U_FR1, U_FR2, U_DEC, U_GRAM] = [u(71), u(72), u(73), u(74)];
const [E1, E2, E3] = [u(101), u(102), u(103)];
const [P_M1, P_E1, P_F1, P_M2, P_E2, P_S2, P_M3] = [u(111), u(112), u(113), u(114), u(115), u(116), u(117)];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school?: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const coordinator: Who = { role: 'academic_coordinator', user: COORDINATOR };
const tara: Who = { role: 'teacher', user: TARA }; // class teacher of 5-A, teaches Mathematics there
const tanvi: Who = { role: 'teacher', user: TANVI }; // teaches English in 5-A
const tarun: Who = { role: 'teacher', user: TARUN }; // class teacher of 6-B: another class
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
const otherSchool: Who = { role: 'principal', user: B_PRINCIPAL, school: B };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school ?? A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
const actor = (who: Who) => ({ schoolId: who.school ?? A, userId: who.user, role: who.role as never });
const owner = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;
const count = async (who: Who, sql: string, params: unknown[] = []) => (await as<{ rows: unknown[] }>(who, (c) => c.query(sql, params))).rows.length;
const genomeOf = (who: Who, studentId = ASHA) => as(who, (c) => childGenome(c, actor(who), studentId, TODAY));

const TODAY = indiaDate();
const day = (back: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - back * 86_400_000).toISOString().slice(0, 10);
const MARKS = [{ key: 'marks', name: 'Marks', max: 50, share: null }];
const TWO_PARTS = [{ key: 'written', name: 'Written', max: 40, share: null }, { key: 'oral', name: 'Oral', max: 10, share: null }];
const LAYOUT = { components: true, total: true, percent: true, grade: true, attendance: true, remarks: true, coScholastic: false };
const SCHEME = {
  bands: [{ from: 75, to: 100, grade: 'A', meaning: null }, { from: 50, to: 74, grade: 'B', meaning: null }, { from: 33, to: 49, grade: 'C', meaning: null }, { from: 0, to: 32, grade: 'D', meaning: null }],
  decimals: 0, passMark: 33, components: [], terms: [{ name: 'Term 1' }], layout: LAYOUT, coScholastic: null,
};

// A paper and every child's marks, then (when `entered`) recorded as entered: every child on the roll has a mark.
async function paper(paperId: string, examId: string, classId: string, subjectId: string, date: string, components: object[], marks: [string, string, 'score' | 'absent', number | null][], entered: boolean) {
  await owner(`insert into exam_papers (paper_id, school_id, exam_id, class_id, subject_id, paper_date, components, created_by) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`, [paperId, A, examId, classId, subjectId, date, JSON.stringify(components), PRINCIPAL]);
  for (const [studentId, component, kind, score] of marks) {
    await owner(
      `insert into marks (school_id, exam_id, subject_id, paper_id, component, student_id, kind, score, max_score, entered_by) select $1, p.exam_id, p.subject_id, p.paper_id, $3, $4, $5, $6, 0, $7 from exam_papers p where p.paper_id = $2`,
      [A, paperId, component, studentId, kind, score, PRINCIPAL]
    );
  }
  if (entered) await as(principal, (c) => c.query(`update exam_papers set entered_by = $2 where paper_id = $1`, [paperId, PRINCIPAL]));
}
// One homework for 5-A in a subject, due `back` days ago, and who did it.
let hw = 0;
async function homework(subjectId: string, back: number, done: Record<string, boolean>) {
  hw += 1;
  const [h1, t1] = [u(2000 + hw), u(3000 + hw)];
  await owner(`insert into homework (homework_id, school_id, subject_id, title, due_date, created_by) values ($1, $2, $3, $4, $5, $6)`, [h1, A, subjectId, `Worksheet ${hw}`, day(back), TARA]);
  await owner(`insert into homework_targets (target_id, school_id, homework_id, class_id, title, due_date) values ($1, $2, $3, $4, $5, $6)`, [t1, A, h1, C5A, `Worksheet ${hw}`, day(back)]);
  for (const [studentId, isDone] of Object.entries(done)) await owner(`insert into homework_status (school_id, target_id, class_id, student_id, done, checked_by) values ($1, $2, $3, $4, $5, $6)`, [A, t1, C5A, studentId, isDone, TARA]);
}
// A lesson of a unit taught `back` days ago, its Daily Pulse, and the parents' replies (student, parent, tier).
let lesson = 0;
async function taught(teacherId: string, subjectId: string, unitId: string, back: number, replies: [string, string, number][]) {
  lesson += 1;
  const [progress, pulse] = [u(4000 + lesson), u(5000 + lesson)];
  await owner(`insert into syllabus_progress (progress_id, school_id, teacher_id, class_id, subject_id, topic, status, date, unit_id) values ($1, $2, $3, $4, $5, 'A topic', 'taught', $6, $7)`, [progress, A, teacherId, C5A, subjectId, day(back), unitId]);
  await owner(`insert into pulse_messages (pulse_id, school_id, class_id, subject_id, topic, exception_state, sent_on, status, source_progress_id) values ($1, $2, $3, $4, 'A topic', 'taught', $5, 'draft', $6)`, [pulse, A, C5A, subjectId, day(back), progress]);
  for (const [studentId, parentId, tier] of replies) await owner(`insert into pulse_response_log (school_id, pulse_id, student_id, parent_id, tier, responded_at) values ($1, $2, $3, $4, $5, $6::date + time '19:00')`, [A, pulse, studentId, parentId, tier, day(back)]);
}

describe('on the whole schema, as the app’s own database role', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
      insert into users (user_id, school_id, email, role, display_name, is_active) values
        ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal', true), ('${ADMIN}', '${A}', 'admin@school-a.example', 'school_admin', 'Asif Admin', true),
        ('${COORDINATOR}', '${A}', 'coordinator@school-a.example', 'academic_coordinator', 'Chitra Coordinator', true),
        ('${TARA}', '${A}', 'tara@school-a.example', 'teacher', 'Tara Teacher', true), ('${TANVI}', '${A}', 'tanvi@school-a.example', 'teacher', 'Tanvi Teacher', true),
        ('${TARUN}', '${A}', 'tarun@school-a.example', 'teacher', 'Tarun Teacher', true), ('${ACCOUNTANT}', '${A}', 'accounts@school-a.example', 'accountant', 'Anil Accountant', true),
        ('${B_PRINCIPAL}', '${B}', 'principal@school-b.example', 'principal', 'Bina Principal', true);
      insert into teachers (teacher_id, school_id, user_id, name) values ('${T_TARA}', '${A}', '${TARA}', 'Tara Teacher'), ('${T_TANVI}', '${A}', '${TANVI}', 'Tanvi Teacher'), ('${T_TARUN}', '${A}', '${TARUN}', 'Tarun Teacher');
      insert into classes (class_id, school_id, name, grade, section, class_teacher_id) values ('${C5A}', '${A}', '5', '5', 'A', '${TARA}'), ('${C6B}', '${A}', '6', '6', 'B', '${TARUN}'), ('${CB}', '${B}', '5', '5', 'A', null);
      insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Mathematics'), ('${ENGLISH}', '${A}', 'English'), ('${SCIENCE}', '${A}', 'Science');
      insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) values ('${A}', '${T_TARA}', '${MATHS}', '${C5A}'), ('${A}', '${T_TANVI}', '${ENGLISH}', '${C5A}'), ('${A}', '${T_TARUN}', '${MATHS}', '${C6B}');
      insert into students (student_id, school_id, admission_no, name, class_id, roll_no, status) values
        ('${ASHA}', '${A}', 'A-01', 'Asha Madeup', '${C5A}', '1', 'active'), ('${BELA}', '${A}', 'A-02', 'Bela Madeup', '${C5A}', '2', 'active'), ('${FARAH}', '${A}', 'B-01', 'Farah Madeup', '${C6B}', '1', 'active');
      insert into parents (parent_id, school_id, name, phone) values ('${G_ASHA}', '${A}', 'Anita Madeup', '9000000001'), ('${G_BELA}', '${A}', 'Bharat Madeup', '9000000002');
      insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${G_ASHA}', '${ASHA}'), ('${A}', '${G_BELA}', '${BELA}');
      insert into syllabus_units (unit_id, school_id, class_id, subject_id, position, chapter, topic) values
        ('${U_FR1}', '${A}', '${C5A}', '${MATHS}', 1, 'Fractions', 'Halves and quarters'), ('${U_FR2}', '${A}', '${C5A}', '${MATHS}', 2, 'Fractions', 'Comparing two fractions'),
        ('${U_DEC}', '${A}', '${C5A}', '${MATHS}', 3, 'Decimals', 'Tenths'), ('${U_GRAM}', '${A}', '${C5A}', '${ENGLISH}', 1, 'Grammar', 'Nouns');
      insert into exams (exam_id, school_id, name, term, created_by) values ('${E1}', '${A}', 'Unit test 1', 'Term 1', '${PRINCIPAL}'), ('${E2}', '${A}', 'Half-yearly', 'Term 1', '${PRINCIPAL}'), ('${E3}', '${A}', 'Unit test 2', 'Term 1', '${PRINCIPAL}');
      insert into school_module_entitlements (school_id, module_id, enabled, source) select s, m, true, 'plan' from unnest(array['${A}', '${B}']::uuid[]) s, unnest(array['learning-genome', 'exams']) m
        on conflict (school_id, module_id) do update set enabled = true;
    `);
    await owner(`insert into grading_schemes (school_id, version, scheme, made_by) values ($1, 1, $2::jsonb, $3)`, [A, JSON.stringify(SCHEME), PRINCIPAL]);
    // Exams. Unit test 1: Asha 27 of 50 in Mathematics (54) and 30 in English (60); Bela 45 and 35. 6-B: Farah.
    await paper(P_M1, E1, C5A, MATHS, day(60), MARKS, [[ASHA, 'marks', 'score', 27], [BELA, 'marks', 'score', 45]], true);
    await paper(P_E1, E1, C5A, ENGLISH, day(59), MARKS, [[ASHA, 'marks', 'score', 30], [BELA, 'marks', 'score', 35]], true);
    await paper(P_F1, E1, C6B, MATHS, day(60), MARKS, [[FARAH, 'marks', 'score', 10]], true);
    // Half-yearly: Asha Written 27 of 40 and Oral 6 of 10 in Mathematics (66), English 20 of 50 (40), absent in Science.
    await paper(P_M2, E2, C5A, MATHS, day(10), TWO_PARTS, [[ASHA, 'written', 'score', 27], [ASHA, 'oral', 'score', 6], [BELA, 'written', 'score', 36], [BELA, 'oral', 'score', 8]], true);
    await paper(P_E2, E2, C5A, ENGLISH, day(10), MARKS, [[ASHA, 'marks', 'score', 20], [BELA, 'marks', 'score', 41]], true);
    await paper(P_S2, E2, C5A, SCIENCE, day(9), MARKS, [[ASHA, 'marks', 'absent', null], [BELA, 'marks', 'score', 30]], true);
    // Unit test 2: Asha has a mark, but the paper is not entered yet (Bela has none), so it cannot be published: it
    // does not count.
    await paper(P_M3, E3, C5A, MATHS, day(2), MARKS, [[ASHA, 'marks', 'score', 49]], false);
    // An exam counts once it is published for the class (docs/27, C219): the office publishes the two finished ones.
    for (const [examId, classId] of [[E1, C5A], [E1, C6B], [E2, C5A]]) expect(await as(principal, (c) => publishClass(c, actor(principal), examId, classId)), `${examId} ${classId}`).toMatchObject({ ok: true });
    // Homework: Mathematics, six due 25 to 30 days ago, Asha did two (Bela all); one long ago, not done. English: three done.
    for (let i = 0; i < 6; i++) await homework(MATHS, 25 + i, { [ASHA]: i < 2, [BELA]: true });
    await homework(MATHS, 100, { [ASHA]: false });
    for (let i = 0; i < 3; i++) await homework(ENGLISH, 6 + i, { [ASHA]: true, [BELA]: false });
    // The Daily Pulse: Fractions taught by Tara 20 and 19 days ago, Decimals 5 days ago; Grammar by Tanvi 3 days ago;
    // Fractions again 120 days ago (outside the days looked back). Tier 1 "understood", 2 "needs help", 3 not counted.
    await taught(T_TARA, MATHS, U_FR1, 20, [[ASHA, G_ASHA, 2], [BELA, G_BELA, 1]]);
    await taught(T_TARA, MATHS, U_FR2, 19, [[ASHA, G_ASHA, 2], [ASHA, G_ASHA, 1], [ASHA, G_ASHA, 3]]);
    await taught(T_TARA, MATHS, U_DEC, 5, [[ASHA, G_ASHA, 1], [ASHA, G_ASHA, 1], [ASHA, G_ASHA, 1], [BELA, G_BELA, 2]]);
    await taught(T_TANVI, ENGLISH, U_GRAM, 3, [[ASHA, G_ASHA, 2]]);
    await taught(T_TARA, MATHS, U_FR1, 120, [[ASHA, G_ASHA, 2]]);
    state.tenant = (claims: { role: string; sub: string; schoolId: string }, fn: (c: unknown) => Promise<unknown>) => as({ role: claims.role, user: claims.sub, school: claims.schoolId }, fn);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('the migration adds the chapter reader and switches the genome on, for every school there is, and keeps a founder’s own choice', async () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    // No table, column or policy: one reader (genome_chapter_replies), its rights, and the switch-on.
    expect(sql.replace(/--.*$/gm, '')).not.toMatch(/create (table|policy)|alter table/i);
    const switchOn = sql.slice(sql.indexOf('insert into school_module_entitlements'));
    expect(switchOn).toContain(`'learning-genome', true, 'plan'`);
    await owner(`delete from school_module_entitlements where module_id = 'learning-genome' and school_id = $1`, [B]);
    await db.pg.exec(switchOn);
    expect(await owner(`select school_id from school_module_entitlements where module_id = 'learning-genome' and enabled order by school_id`)).toEqual([{ school_id: A }, { school_id: B }]);
    await owner(`update school_module_entitlements set enabled = false, source = 'founder_override' where school_id = $1 and module_id = 'learning-genome'`, [B]);
    await db.pg.exec(switchOn);
    expect(await owner(`select enabled from school_module_entitlements where module_id = 'learning-genome' and school_id = $1`, [B])).toEqual([{ enabled: false }]);
    await owner(`update school_module_entitlements set enabled = true, source = 'plan' where school_id = $1 and module_id = 'learning-genome'`, [B]);
  });

  it('for a child with marks, replies and homework, every number equals its source rows', async () => {
    const g = (await genomeOf(principal))!;
    expect(g.child).toEqual({ studentId: ASHA, name: 'Asha Madeup', rollNo: '1', classId: C5A, className: '5-A' });
    expect(g.window).toEqual({ from: day(89), to: TODAY });
    expect(g.settings).toEqual(DEFAULT_GENOME_SETTINGS);
    expect(g.scheme).toEqual({ version: 1 });

    // Exams: in date order; the exam not published (its paper not entered) is left out. Each percent is percent() of
    // the child's own mark rows.
    const exams = Object.fromEntries(g.subjects.map((s) => [s.subjectName, s.exams.map((e) => [e.examName, e.shown.rounded, e.shown.grade.kind === 'grade' ? e.shown.grade.grade : e.shown.grade.reason])]));
    expect(exams).toEqual({
      English: [['Unit test 1', 60, 'B'], ['Half-yearly', 40, 'C']],
      Mathematics: [['Unit test 1', 54, 'B'], ['Half-yearly', 66, 'B']],
      Science: [['Half-yearly', null, 'no_marks']],
    });
    expect(g.subjects.map((s) => s.subjectName)).toEqual(['English', 'Mathematics', 'Science']);
    const rows = await owner(
      `select m.paper_id, m.component, m.kind, m.score::float as score, (p.components -> 0 ->> 'max')::float as max0, p.components from marks m join exam_papers p on p.paper_id = m.paper_id where m.student_id = $1 and ${COUNTED_PAPER} order by m.paper_id, m.component`,
      [ASHA]
    );
    for (const s of g.subjects) {
      for (const e of s.exams) {
        const own = rows.filter((r: { paper_id: string }) => r.paper_id === e.paperId);
        // The marks shown as the source are exactly the child's rows of that paper.
        expect(Object.keys(e.marks).sort()).toEqual(own.map((r: { component: string }) => r.component).sort());
        for (const r of own) expect(e.marks[r.component]).toEqual({ kind: r.kind, score: r.score });
        const parts = own.map((r: { component: string; kind: string; score: number | null; components: { key: string; max: number }[] }) => ({ score: r.score, max: r.components.find((c) => c.key === r.component)!.max, absent: r.kind === 'absent' }));
        const p = percent(parts);
        expect(e.shown.percent).toBe(p);
      }
    }
    // The same paper says the same percent and grade on the class result: one rule in one place.
    const result = (await as(principal, (c) => classResult(c, actor(principal), E2, C5A)))!;
    const asha = result.children.find((c) => c.studentId === ASHA)!;
    for (const [i, rp] of result.papers.entries()) {
      const mine = g.subjects.flatMap((s) => s.exams).find((e) => e.paperId === rp.paperId)!;
      expect(mine.shown).toEqual({ percent: asha.papers[i].percent, rounded: asha.papers[i].rounded, grade: asha.papers[i].grade });
    }
    // Their own overall in the latest exam with two subjects: percent() of every complete paper's marks, absent left out.
    expect(g.latestOverall).toMatchObject({ examId: E2, examName: 'Half-yearly', subjects: 2, shown: { rounded: 53 } });
    expect(g.latestOverall!.shown).toEqual(asha.overall);

    // Homework: the child's own homework_status rows, by subject, due in the days looked back.
    const hwRows = await owner(
      `select h.subject_id, count(*)::int as checked, (count(*) filter (where st.done))::int as done, min(t.due_date)::text as first_due, max(t.due_date)::text as last_due
         from homework_status st join homework_targets t on t.target_id = st.target_id join homework h on h.homework_id = t.homework_id
        where st.student_id = $1 and t.due_date between $2::date and $3::date group by h.subject_id`,
      [ASHA, g.window.from, TODAY]
    );
    for (const s of g.subjects) {
      const r = hwRows.find((x: { subject_id: string }) => x.subject_id === s.subjectId);
      expect(s.homework, s.subjectName).toEqual(r ? { done: r.done, checked: r.checked, firstDue: r.first_due, lastDue: r.last_due } : { done: 0, checked: 0, firstDue: null, lastDue: null });
    }
    expect(g.subjects.find((s) => s.subjectName === 'Mathematics')!.homework).toEqual({ done: 2, checked: 6, firstDue: day(30), lastDue: day(25) });

    // Chapters: the replies (tiers 1 and 2) to the lessons of each chapter's taught units, in the days looked back.
    const chRows = await owner(
      `select u.chapter, (count(*) filter (where r.tier = 2))::int as needs_help, (count(*) filter (where r.tier = 1))::int as understood, count(distinct sp.progress_id)::int as lessons
         from pulse_response_log r join pulse_messages pm on pm.pulse_id = r.pulse_id join syllabus_progress sp on sp.progress_id = pm.source_progress_id join syllabus_units u on u.unit_id = sp.unit_id
        where r.student_id = $1 and r.tier in (1, 2) and sp.date between $2::date and $3::date group by u.chapter order by u.chapter`,
      [ASHA, g.window.from, TODAY]
    );
    expect([...g.chapters].sort((a, b) => a.chapter.localeCompare(b.chapter)).map((c) => ({ chapter: c.chapter, needs_help: c.needsHelp, understood: c.understood, lessons: c.lessons }))).toEqual(chRows);
    expect(g.chapters.map((c) => [c.subjectName, c.chapter, c.needsHelp, c.understood, c.lessons, c.firstTaught, c.lastTaught])).toEqual([
      ['English', 'Grammar', 1, 0, 1, day(3), day(3)],
      ['Mathematics', 'Fractions', 2, 1, 2, day(20), day(19)],
      ['Mathematics', 'Decimals', 0, 3, 1, day(5), day(5)],
    ]);

    // Strengths and gaps, each with the line it was held against.
    expect(g.strengths).toEqual([
      { rule: 'rising', subjectId: MATHS, subjectName: 'Mathematics', before: { examName: 'Unit test 1', rounded: 54 }, after: { examName: 'Half-yearly', rounded: 66 }, points: 12, line: 10 },
      { rule: 'above_own', subjectId: MATHS, subjectName: 'Mathematics', examName: 'Half-yearly', rounded: 66, overall: 53, points: 13, line: 10 },
      { rule: 'understood', subjectId: MATHS, subjectName: 'Mathematics', chapter: 'Decimals', className: '5-A', count: 3, line: 3 },
    ]);
    expect(g.gaps.map((f) => [f.subjectName, f.rule])).toEqual([['English', 'falling'], ['English', 'below_own'], ['Mathematics', 'needs_help'], ['Mathematics', 'homework']]);
    expect(g.gaps.find((f) => f.rule === 'homework')).toMatchObject({ done: 2, checked: 6, line: 60, min: 5 });
    expect(g.gaps.find((f) => f.rule === 'needs_help')).toMatchObject({ chapter: 'Fractions', count: 2, line: 2 });

    // The office, the school admin and the academic coordinator read the same genome.
    for (const who of [admin, coordinator]) expect(await genomeOf(who), who.role).toEqual(g);
  });

  it('an exam counts only while it is published for the class: entered is not enough, and a reopened class is left out until it is published again', async () => {
    const examsOf = async () => Object.fromEntries((await genomeOf(principal))!.subjects.map((s) => [s.subjectName, s.exams.map((e) => e.examName)]));
    const before = await examsOf();
    expect(before).toEqual({ English: ['Unit test 1', 'Half-yearly'], Mathematics: ['Unit test 1', 'Half-yearly'], Science: ['Half-yearly'] });
    // Every paper of the half-yearly is entered, and it is published; the principal reopens it, with a reason.
    expect(await as(principal, (c) => reopenClass(c, actor(principal), E2, C5A, 'an English mark was entered wrongly'))).toMatchObject({ ok: true });
    expect(await examsOf()).toEqual({ English: ['Unit test 1'], Mathematics: ['Unit test 1'] });
    // Published again (version 2), it counts again; the reader's own database rule says the same.
    expect(await as(principal, (c) => publishClass(c, actor(principal), E2, C5A))).toEqual({ ok: true, version: 2 });
    expect(await examsOf()).toEqual(before);
    // The entered, unpublished Unit test 2 never counted.
    expect(JSON.stringify(await genomeOf(principal))).not.toContain(P_M3);
  });

  it('no other child’s data appears: not their marks, homework, replies or name', async () => {
    const g = (await genomeOf(principal))!;
    const text = JSON.stringify(g);
    for (const other of [BELA, FARAH, 'Bela Madeup', 'Farah Madeup', G_BELA, P_F1]) expect(text).not.toContain(other);
    // Bela's own genome is her own: different numbers from the same papers.
    const bela = (await genomeOf(principal, BELA))!;
    expect(bela.subjects.find((s) => s.subjectName === 'Mathematics')!.exams.map((e) => e.shown.rounded)).toEqual([90, 88]);
    expect(bela.subjects.find((s) => s.subjectName === 'Mathematics')!.homework).toMatchObject({ done: 6, checked: 6 });
    expect(bela.chapters.map((c) => [c.chapter, c.needsHelp, c.understood])).toEqual([['Fractions', 0, 1], ['Decimals', 1, 0]]);
    expect(JSON.stringify(bela)).not.toContain(ASHA);
    // No rank, position or comparison with another child anywhere in it.
    for (const word of ['rank', 'position', 'topper', 'percentile', 'average']) expect(text.toLowerCase()).not.toContain(word);
  });

  it('a change of a line in Settings is used the next time a genome is opened; a teacher cannot change it', async () => {
    const schema = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'learning-genome')!;
    expect(await as(tara, (c) => saveSettings(c, actor(tara), schema, { moduleId: 'learning-genome', baseRevision: 0, set: { trend_points: 15 } }))).toMatchObject({ ok: false, reason: 'forbidden' });
    expect(await as(principal, (c) => saveSettings(c, actor(principal), schema, { moduleId: 'learning-genome', baseRevision: 0, set: { trend_points: 15, homework_min_checked: 7 } }))).toMatchObject({ ok: true });
    const g = (await genomeOf(principal))!;
    expect(g.settings).toMatchObject({ trendPoints: 15, homeworkMinChecked: 7 });
    // Mathematics rose 12 points: under 15 now. English fell 20: still a gap. Six homeworks checked: under 7 now.
    expect(g.strengths.map((f) => f.rule)).toEqual(['above_own', 'understood']);
    expect(g.gaps.map((f) => [f.subjectName, f.rule])).toEqual([['English', 'falling'], ['English', 'below_own'], ['Mathematics', 'needs_help']]);
    expect(g.gaps[0]).toMatchObject({ points: 20, line: 15 });
    // Back to the defaults.
    expect(await as(principal, (c) => saveSettings(c, actor(principal), schema, { moduleId: 'learning-genome', baseRevision: 1, resetToDefault: ['trend_points', 'homework_min_checked'] }))).toMatchObject({ ok: true });
    expect((await genomeOf(principal))!.settings).toEqual(DEFAULT_GENOME_SETTINGS);
    // Points keep a decimal the school typed; a count of replies is a whole number.
    expect(await as(principal, (c) => saveSettings(c, actor(principal), schema, { moduleId: 'learning-genome', baseRevision: 2, set: { trend_points: 12.5, needs_help_replies: 2.7 } }))).toMatchObject({ ok: true });
    const decimal = (await genomeOf(principal))!;
    expect(decimal.settings).toMatchObject({ trendPoints: 12.5, needsHelpReplies: 2 });
    expect(decimal.strengths.map((f) => f.rule)).not.toContain('rising'); // 12 points, under 12.5
    expect(decimal.gaps.find((f) => f.rule === 'needs_help')).toMatchObject({ count: 2, line: 2 });
    expect(await as(principal, (c) => saveSettings(c, actor(principal), schema, { moduleId: 'learning-genome', baseRevision: 3, resetToDefault: ['trend_points', 'needs_help_replies'] }))).toMatchObject({ ok: true });
    expect((await genomeOf(principal))!.settings).toEqual(DEFAULT_GENOME_SETTINGS);
  });

  it('the child’s own teachers read it: a teacher of the child’s class sees every chapter of that class, as the office does', async () => {
    const office = (await genomeOf(principal))!;
    const own = (await genomeOf(tara))!;
    // Marks and homework of her own class, every subject: the same as the office's.
    expect(own.subjects).toEqual(office.subjects);
    // Through genome_chapter_replies (C217): the replies to Tanvi's English lesson are counted for Tara too, and the
    // other way round; counts and days only, never the lesson's note.
    expect(own.chapters).toEqual(office.chapters);
    expect((await genomeOf(tanvi))!.chapters).toEqual(office.chapters);
    // The picker: her own class only, its children in roll order.
    expect(await as(tara, (c) => genomePicker(c, actor(tara), null))).toEqual({ role: 'teacher', classes: [{ classId: C5A, name: '5-A' }], classId: null, children: null });
    expect(await as(tara, (c) => genomePicker(c, actor(tara), C5A))).toMatchObject({ classId: C5A, children: [{ studentId: ASHA, name: 'Asha Madeup', rollNo: '1' }, { studentId: BELA, name: 'Bela Madeup', rollNo: '2' }] });
    expect((await as(principal, (c) => genomePicker(c, actor(principal), null)))).toMatchObject({ classes: [{ classId: C5A, name: '5-A' }, { classId: C6B, name: '6-B' }] });
  });

  it('a teacher of another class is refused by the app and the database', async () => {
    // The app: no genome, no picker for the class, and the class is not in the list.
    expect(await genomeOf(tarun)).toBeNull();
    expect(await as(tarun, (c) => genomePicker(c, actor(tarun), C5A))).toBe('not_found');
    expect(await as(tarun, (c) => genomePicker(c, actor(tarun), null))).toMatchObject({ classes: [{ classId: C6B, name: '6-B' }] });
    // The database, asked directly as Tarun: the child, her marks, papers, homework and the replies read through
    // their lessons are none of his.
    expect(await count(tarun, `select 1 from students where student_id = $1`, [ASHA])).toBe(0);
    expect(await count(tarun, `select 1 from marks where student_id = $1`, [ASHA])).toBe(0);
    expect(await count(tarun, `select 1 from exam_papers where class_id = $1`, [C5A])).toBe(0);
    expect(await count(tarun, `select 1 from homework_status where student_id = $1`, [ASHA])).toBe(0);
    expect(await count(tarun, `select 1 from pulse_messages where class_id = $1`, [C5A])).toBe(0);
    expect(await count(tarun, `select 1 from syllabus_units where class_id = $1`, [C5A])).toBe(0);
    expect(await count(tarun, `select 1 from pulse_response_log r join pulse_messages pm on pm.pulse_id = r.pulse_id where r.student_id = $1`, [ASHA])).toBe(0);
    // While his own class's child is his to read.
    expect((await genomeOf(tarun, FARAH))!.subjects.map((s) => [s.subjectName, s.exams.map((e) => e.shown.rounded)])).toEqual([['Mathematics', [20]]]);
  });

  it('the accountant and another school are refused; a child not on a roll is not found', async () => {
    expect(await genomeOf(accountant)).toBeNull();
    expect(await as(accountant, (c) => genomePicker(c, actor(accountant), null))).toBeNull();
    // An accountant reads no mark and no homework in the database either (docs/27 section 3 rule 5).
    expect(await count(accountant, `select 1 from marks where student_id = $1`, [ASHA])).toBe(0);
    expect(await count(accountant, `select 1 from homework_status where student_id = $1`, [ASHA])).toBe(0);
    expect(await genomeOf(otherSchool)).toBeNull();
    expect(await count(otherSchool, `select 1 from marks where student_id = $1`, [ASHA])).toBe(0);
    await owner(`update students set status = 'transferred' where student_id = $1`, [BELA]);
    expect(await genomeOf(principal, BELA)).toBeNull();
    await owner(`update students set status = 'active' where student_id = $1`, [BELA]);
  });

  it('through its routes: the right people read it, the rest are refused, nothing is written and no model is asked', async () => {
    const claims = (who: Who) => ({ sub: who.user, role: who.role, schoolId: who.school ?? A, membershipId: u(990), tokenVersion: 0, aal: 'aal1', sessionId: u(991) });
    const call = async (who: Who, fn: () => Promise<Response>) => {
      state.claims = claims(who);
      const res = await fn();
      return { status: res.status, body: await res.json() };
    };
    const picker = (who: Who, q = '') => call(who, () => getPicker(new NextRequest(`http://localhost/api/app/learning-genome${q}`)));
    const genome = (who: Who, id: string) => call(who, () => getGenome(new NextRequest(`http://localhost/api/app/learning-genome/${id}`), { params: { studentId: id } }));
    const before = await owner(`select (select count(*)::int from audit_log) as audit, (select count(*)::int from communication_log) as messages, (select count(*)::int from jobs) as jobs, (select count(*)::int from school_settings) as settings`);
    state.asked = 0;

    const ok = await genome(tara, ASHA);
    expect(ok.status).toBe(200);
    expect((ok.body as Genome).child.studentId).toBe(ASHA);
    expect((await picker(principal, `?class=${C5A}`)).body.children.map((c: { studentId: string }) => c.studentId)).toEqual([ASHA, BELA]);
    expect((await picker(coordinator)).status).toBe(200);
    // Another class's teacher: not found, the same answer as a child who does not exist.
    expect(await genome(tarun, ASHA)).toMatchObject({ status: 404, body: { code: 'not_found' } });
    expect(await genome(tarun, u(9999))).toMatchObject({ status: 404, body: { code: 'not_found' } });
    expect(await picker(tarun, `?class=${C5A}`)).toMatchObject({ status: 404, body: { code: 'not_found' } });
    expect(await genome(accountant, ASHA)).toMatchObject({ status: 403, body: { code: 'not_allowed' } });
    expect(await picker(accountant)).toMatchObject({ status: 403, body: { code: 'not_allowed' } });
    expect(await genome(otherSchool, ASHA)).toMatchObject({ status: 404 });
    expect(await genome(principal, 'not-an-id')).toMatchObject({ status: 400, body: { code: 'not_sent_properly' } });
    expect(await picker(principal, '?class=nope')).toMatchObject({ status: 400 });
    // Switched off for the school: neither route answers.
    await owner(`update school_module_entitlements set enabled = false where school_id = $1 and module_id = 'learning-genome'`, [A]);
    expect(await genome(principal, ASHA)).toMatchObject({ status: 403, body: { code: 'module_off' } });
    expect(await picker(principal)).toMatchObject({ status: 403, body: { code: 'module_off' } });
    await owner(`update school_module_entitlements set enabled = true where school_id = $1 and module_id = 'learning-genome'`, [A]);

    // Reading writes nothing, queues nothing, sends nothing to a parent, and asks no model.
    expect(await owner(`select (select count(*)::int from audit_log) as audit, (select count(*)::int from communication_log) as messages, (select count(*)::int from jobs) as jobs, (select count(*)::int from school_settings) as settings`)).toEqual(before);
    expect(state.asked).toBe(0);
  });

  it('the screen says every number with where it comes from, the lines in use, and no rank', async () => {
    const g = (await genomeOf(principal))!;
    const html = renderToStaticMarkup(h(GenomeChild, { genome: g })).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    for (const words of [
      'Mathematics rose 12 points: 54% in Unit test 1, then 66% in Half-yearly.',
      'The line: 10 points against their own previous exam in the subject.',
      'Mathematics was 13 points above their own overall in Half-yearly: 66% against 53%.',
      'Mathematics, Fractions (5-A): parents replied “needs help” 2 times.',
      'Mathematics: homework done 2 of 6 checked.',
      'The line: fewer than 60 done in every 100 checked, once 5 were checked.',
      'From the marks: Written 27/40 · Oral 6/10',
      'From the marks: Marks: absent',
      'Needs help: 2 · Understood: 1',
      'From the parents’ replies to 2 lessons,',
      'Their own overall in Half-yearly: 53%',
    ]) expect(html).toContain(words);
    expect(html).not.toMatch(/\brank|position|topper|percentile|class average/i);
    // A teacher of the child's class sees the same chapters as the office (C217: genome_chapter_replies).
    const teacherHtml = renderToStaticMarkup(h(GenomeChild, { genome: (await genomeOf(tara))! }));
    expect(teacherHtml).toContain('Grammar');
  });
});

describe('the module', () => {
  it('is partly built, for staff only, with its own classes for a teacher; its words, tour, guide and settings', () => {
    const m = moduleById('learning-genome');
    expect(m).toMatchObject({ status: 'partial', teacherScope: 'ownClassesOnly', roles: ['principal', 'school_admin', 'teacher', 'academic_coordinator'] });
    expect(m.roles).not.toContain('accountant');
    for (const part of ['staff only', 'comparing the child only with themselves', 'nothing is sent to parents']) expect(m.phaseNote, part).toContain(part);
    expect(en['moduleOff.learning-genome'].length).toBeLessThanOrEqual(200);
    expect(TOURS['learning-genome'].steps).toHaveLength(3);
    for (const n of [1, 2, 3]) {
      expect(en[`tour.learning-genome.${n}.title` as keyof typeof en].length).toBeLessThanOrEqual(40);
      expect(en[`tour.learning-genome.${n}.text` as keyof typeof en].length).toBeLessThanOrEqual(160);
    }
    const guide = helpArticle('read-a-learning-genome')!;
    expect(guide).toMatchObject({ audience: 'office_and_teachers', start: { href: '/app/learning-genome' } });
    expect(guide.tips!.map((x) => x.en).join(' ')).toContain('no AI model is used');
    const schema = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'learning-genome')!;
    expect(schema.fields.map((f) => [f.key, f.default])).toEqual([['trend_points', 10], ['spread_points', 10], ['needs_help_replies', 2], ['understood_replies', 3], ['homework_done_below', 60], ['homework_min_checked', 5], ['window_days', 90], ['mistake_min_questions', 3], ['mistake_min_papers', 2]]);
    expect(schema.fields.every((f) => (f.editableBy as readonly string[]).join() === 'principal,school_admin')).toBe(true);
    // Reads only: both routes belong to the module, and nothing under it writes.
    expect(readModuleFor('/api/app/learning-genome')).toBe('learning-genome');
    expect(readModuleFor(`/api/app/learning-genome/${ASHA}`)).toBe('learning-genome');
    expect(writeModuleFor('/api/app/learning-genome')).toBeNull();
  });

  it('no model is called: nothing of the genome imports the AI provider, Teacher Copilot or Parent AI, and nothing writes', () => {
    const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => (statSync(path.join(dir, name)).isDirectory() ? files(path.join(dir, name)) : [path.join(dir, name)]));
    const ours = [...files(path.join(SRC, 'lib/genome')), ...files(path.join(SRC, 'components/genome')), ...files(path.join(SRC, 'app/api/app/learning-genome')), ...files(path.join(SRC, 'app/(school)/app/learning-genome'))];
    expect(ours.length).toBeGreaterThanOrEqual(7);
    for (const f of ours) {
      const text = readFileSync(f, 'utf8');
      expect(text, path.relative(SRC, f)).not.toMatch(/@\/lib\/(ai|copilot|parent-ai)\b|lib\/ai\/|anthropic|openai|configuredProvider|standInProvider/i);
      // Nothing is stored, queued or sent.
      expect(text, path.relative(SRC, f)).not.toMatch(/\b(insert into|update \w+ set|delete from)\b|writeAuditLog|enqueue|communication_log|export (async )?function (POST|PUT|PATCH|DELETE)/i);
    }
  });
});
