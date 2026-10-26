import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// Learning intelligence from approved answer-sheet marks (docs/35 section 1 step 8, C352), on the whole schema as the
// app's own database role. The acceptance test: "Every number traces to its questions; no AI import; roll order."
//   - the Learning Genome by topic: marks got out of marks possible per chapter and topic with the answers they come
//     from, the kinds of mistake that keep coming back, progress by chapter, what to practise next;
//   - a paper's class view: per question the average, how many attempted and the most common mistake; per topic the
//     class's marks; the children who may need support, by the school's own line, in roll order;
//   - Control's monitor for AI marking: counts and ages only.
// Every school, child, mark and word below is made up.

const state = vi.hoisted(() => ({ claims: null as unknown, tenant: null as unknown, asked: 0 }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/server-session', () => ({ getServerSession: async () => state.claims }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => (state.tenant as any)(claims, fn),
}));
// The AI provider, watched: asking for one is counted. Reading learning intelligence must never ask.
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
// The Retry button asks the router to read the page again; there is no router in a test.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));

import { GET as getInsights } from '@/app/api/app/exams/papers/[paperId]/insights/route';
import { GET as getGenome } from '@/app/api/app/learning-genome/[studentId]/route';
import { LangProvider } from '@/components/app-shell/LangContext';
import { MarkingMonitor } from '@/components/control/MarkingMonitor';
import { ageWords, MonitoringView } from '@/components/control/MonitoringView';
import { GenomeChild } from '@/components/genome/GenomeChild';
import { PaperInsightsBody } from '@/components/insights/PaperInsightsView';
import { loadMarkingMonitor, markingNeedsALook, atLimit, backedUp, type MarkingMonitor as MarkingData } from '@/lib/control/marking-monitor';
import { loadMonitoring } from '@/lib/control/monitoring';
import { saveMarks } from '@/lib/exams/marks';
import { publishClass, reopenClass } from '@/lib/exams/publish';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { childGenome } from '@/lib/genome/genome';
import { DEFAULT_GENOME_SETTINGS, type Genome } from '@/lib/genome/rules';
import { chaptersOf, mistakesOf, practiceOf, type CountedAnswer, type UnitInfo } from '@/lib/genome/topics';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';
import { APPROVED_SHEET, finalMark } from '@/lib/marking/approved';
import { approveSheets, changeSheet } from '@/lib/marking/review';
import { paperInsights, type PaperInsights } from '@/lib/marking/insights';
import { indiaDate } from '@/lib/time/india';

const SRC = path.resolve(__dirname, '../../src');

// ---- the rules on their own ------------------------------------------------------------------------------------------

const answer = (o: Partial<CountedAnswer> & Pick<CountedAnswer, 'paperId' | 'label' | 'marks' | 'max'>): CountedAnswer => ({
  examId: o.paperId, examName: `Exam ${o.paperId}`, date: null, subjectId: 's1', subjectName: 'Mathematics', classId: 'c1', className: '7-A', questionId: `${o.paperId}-${o.label}`, position: 1, unitId: null, errorType: null, ...o,
});
const unit = (unitId: string, position: number, chapter: string, topic: string): UnitInfo => ({ unitId, classId: 'c1', subjectId: 's1', position, chapter, topic });

describe('the rules compare the child only with themselves, in syllabus order, never by marks', () => {
  const units = new Map([unit('u1', 1, 'Fractions', 'Adding'), unit('u2', 2, 'Fractions', 'Comparing'), unit('u3', 3, 'Decimals', 'Tenths')].map((u) => [u.unitId, u]));
  const S = { trendPoints: 10, mistakeMinQuestions: 3, mistakeMinPapers: 2 };

  it('chapters and topics come from the answers’ units, in the map’s order, with the marks over the marks possible', () => {
    const answers = [
      answer({ paperId: 'p1', label: '1', marks: 3, max: 4, unitId: 'u3' }),
      answer({ paperId: 'p1', label: '2', marks: 1, max: 2, unitId: 'u2' }),
      answer({ paperId: 'p1', label: '3', marks: 2, max: 2, unitId: 'u1' }),
      answer({ paperId: 'p1', label: '4', marks: 1, max: 1, unitId: null }),
    ];
    const { chapters, unlinked } = chaptersOf(answers, units, S);
    expect(unlinked).toBe(1);
    // Fractions before Decimals, as the map has them, although Decimals has the highest percent.
    expect(chapters.map((c) => [c.chapter, c.marks, c.max, c.rounded, c.questions])).toEqual([['Fractions', 3, 4, 75, 2], ['Decimals', 3, 4, 75, 1]]);
    expect(chapters[0].topics.map((t) => [t.topic, t.marks, t.max, t.rounded, t.evidence.map((e) => e.label)])).toEqual([['Adding', 2, 2, 100, ['3']], ['Comparing', 1, 2, 50, ['2']]]);
    // A mark above the question’s marks is held at them, and a percent never leaves 0 to 100.
    expect(chaptersOf([answer({ paperId: 'p1', label: '1', marks: 9, max: 4, unitId: 'u1' })], units, S).chapters[0].rounded).toBe(100);
  });

  it('progress is a chapter against the child’s own previous exam by the trend line: on the line counts, under it is steady', () => {
    const asked = (paper: string, marks: number, max: number) => answer({ paperId: paper, label: '1', marks, max, unitId: 'u1' });
    const change = (a: number, b: number) => chaptersOf([asked('p1', a, 20), asked('p2', b, 20)], units, S).chapters[0].change;
    expect(change(10, 12)).toMatchObject({ direction: 'up', points: 10, line: 10 }); // 50 -> 60: on the line
    expect(change(12, 10)).toMatchObject({ direction: 'down', points: 10 });
    expect(change(10, 11.8)).toMatchObject({ direction: 'steady', points: 9 }); // 50 -> 59: under it
    // One exam is not progress.
    expect(chaptersOf([asked('p1', 10, 20)], units, S).chapters[0].change).toBeNull();
    // Only the latest two exams are compared.
    expect(chaptersOf([asked('p1', 1, 20), asked('p2', 10, 20), asked('p3', 10, 20)], units, S).chapters[0].change).toMatchObject({ direction: 'steady', points: 0, from: { paperId: 'p2' }, to: { paperId: 'p3' } });
  });

  it('a kind of mistake keeps coming back at both lines: enough answers that lost marks, across enough papers', () => {
    const lost = (paper: string, label: string, kind: CountedAnswer['errorType'], marks = 0) => answer({ paperId: paper, label, marks, max: 4, errorType: kind });
    const three = [lost('p1', '1', 'calculation'), lost('p1', '2', 'calculation'), lost('p1', '3', 'calculation')];
    expect(mistakesOf(three, S)).toEqual([]); // three answers, but one paper
    expect(mistakesOf([...three, lost('p2', '1', 'calculation')], S)).toMatchObject([{ kind: 'calculation', questions: 4, papers: 2 }]);
    expect(mistakesOf([lost('p1', '1', 'calculation'), lost('p2', '1', 'calculation')], S)).toEqual([]); // two papers, but two answers
    expect(mistakesOf(three, { ...S, mistakeMinPapers: 1 })).toMatchObject([{ kind: 'calculation', questions: 3, papers: 1 }]);
    // An answer that kept its full marks is not a mistake, whatever kind was recorded; "none" is not a kind.
    const fine = [lost('p1', '1', 'concept', 4), lost('p1', '2', 'concept', 4), lost('p2', '1', 'concept', 4), lost('p2', '2', 'none'), lost('p2', '3', 'none'), lost('p2', '4', 'none')];
    expect(mistakesOf(fine, S)).toEqual([]);
    // The kinds come in the contract's order, with the answers they come from.
    const both = ['incomplete', 'calculation'].flatMap((k) => ['p1', 'p2', 'p3'].map((p) => lost(p, k, k as CountedAnswer['errorType'])));
    expect(mistakesOf(both, S).map((m) => m.kind)).toEqual(['calculation', 'incomplete']);
    expect(mistakesOf(both, S)[0].evidence.map((e) => [e.paperId, e.label, e.marks, e.max])).toEqual([['p1', 'calculation', 0, 4], ['p2', 'calculation', 0, 4], ['p3', 'calculation', 0, 4]]);
  });

  it('practise next is the latest script’s list in each subject, with the topic of each item and no repeats', () => {
    const script = (paperId: string, subjectId: string, subjectName: string, practice: { unitId: string | null; text: string }[]) => ({ subjectId, subjectName, paperId, examId: paperId, examName: `Exam ${paperId}`, date: null, className: '7-A', practice });
    const out = practiceOf(
      [
        script('p1', 's1', 'Mathematics', [{ unitId: 'u1', text: 'Old list' }]),
        script('p2', 's1', 'Mathematics', [{ unitId: 'u3', text: 'Money as tenths' }, { unitId: null, text: 'Read each question twice' }, { unitId: 'u3', text: 'Money as tenths' }]),
        script('p3', 's1', 'Mathematics', []), // a newer script with no list leaves the last list standing
        script('p4', 's2', 'English', [{ unitId: null, text: 'Write five sentences' }]),
      ],
      units
    );
    expect(out.map((g) => [g.subjectName, g.paperId, g.items.map((i) => [i.text, i.chapter, i.topic])])).toEqual([
      ['English', 'p4', [['Write five sentences', null, null]]],
      ['Mathematics', 'p2', [['Money as tenths', 'Decimals', 'Tenths'], ['Read each question twice', null, null]]],
    ]);
  });
});

describe('the school’s lines for the monitor', () => {
  it('a school at its page limit, and a script that has waited past the job queue’s minutes', () => {
    expect(atLimit({ limit: 100, pagesThisMonth: 99 })).toBe(false);
    expect(atLimit({ limit: 100, pagesThisMonth: 100 })).toBe(true);
    expect(atLimit({ limit: null, pagesThisMonth: 9999 })).toBe(false);
    expect(backedUp({ oldestWaitingSeconds: 600 }, 10)).toBe(false);
    expect(backedUp({ oldestWaitingSeconds: 601 }, 10)).toBe(true);
    expect(backedUp({ oldestWaitingSeconds: null }, 10)).toBe(false);
  });
});

// ---- on the whole schema ---------------------------------------------------------------------------------------------

const u = (n: number) => `b6000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B, TESTSCHOOL] = [u(1), u(2), u(3)];
const [PRINCIPAL, COORDINATOR, TARA, OMAR, ACCOUNTANT, B_PRINCIPAL] = [u(11), u(12), u(13), u(14), u(15), u(16)];
const [C7A, C7B, CB] = [u(21), u(22), u(23)];
const [MATHS, B_MATHS] = [u(31), u(32)];
const [MEERA, ZOYA, DEV, ESHA, KABIR, ROHAN] = [u(41), u(42), u(43), u(44), u(45), u(46)];
const [FR1, FR2, DEC, U7B] = [u(51), u(52), u(53), u(54)];
const [E1, E2] = [u(61), u(62)];
const [P1, P2, P7B] = [u(71), u(72), u(73)];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school?: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const coordinator: Who = { role: 'academic_coordinator', user: COORDINATOR };
const tara: Who = { role: 'teacher', user: TARA }; // class teacher of 7-A, teaches Mathematics there
const omar: Who = { role: 'teacher', user: OMAR }; // teaches Mathematics in 7-B: another class
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const actor = (who: Who) => ({ schoolId: who.school ?? A, userId: who.user, role: who.role as never });
const owner = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;
const TODAY = indiaDate();
const day = (back: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - back * 86_400_000).toISOString().slice(0, 10);
const genomeOf = (who: Who, studentId: string) => as(who, (c) => childGenome(c, actor(who), studentId, TODAY));
const insightsOf = (who: Who, paperId: string) => as(who, (c) => paperInsights(c, actor(who), paperId));
// The school's own lines, set directly.
const setLines = async (moduleId: string, version: number, values: object | null) => {
  await owner(`delete from school_settings where school_id = $1 and module_id = $2`, [A, moduleId]);
  if (values) await owner(`insert into school_settings (school_id, module_id, schema_version, setting_values) values ($1, $2, $3, $4::jsonb)`, [A, moduleId, version, JSON.stringify(values)]);
};

const THEORY = [{ key: 'theory', name: 'Theory', max: 20, share: null }];
const SCHEME = {
  bands: [{ from: 50, to: 100, grade: 'A', meaning: null }, { from: 0, to: 49, grade: 'B', meaning: null }],
  decimals: 0, passMark: 33, components: [], terms: [{ name: 'Term 1' }],
  layout: { components: true, total: true, percent: true, grade: true, attendance: false, remarks: false, coScholastic: false }, coScholastic: null,
};

// The questions of the two papers (the label, its marks, the unit it is set under, its choice group). Paper 1: Q4(a) or
// Q4(b), the better counts. Paper 2 has no choice.
const Q1 = [['1', 3, FR1, null], ['2', 3, FR2, null], ['3', 4, DEC, null], ['4a', 10, FR1, 'A'], ['4b', 10, DEC, 'A']] as const;
const Q2 = [['1', 4, FR1, null], ['2', 6, FR2, null], ['3', 10, DEC, null]] as const;
const QID: Record<string, string> = {};
const qid = (paper: string, label: string) => QID[`${paper}:${label}`];

type Row = [label: string, ai: number, error: string | null, attempted?: boolean];
// A script: its marks per question (the AI's), the kind of mistake, and its practice list.
let sheetNo = 0;
async function script(paperId: string, studentId: string, rows: Row[], practice: { unitId: string | null; text: string }[] = [], flags: string[] = []) {
  sheetNo += 1;
  const sheetId = u(1000 + sheetNo);
  const upload = (await owner(`select upload_id from marking_uploads where paper_id = $1 limit 1`, [paperId]))[0]?.upload_id ?? u(900 + sheetNo);
  if (!(await owner(`select 1 from marking_uploads where upload_id = $1`, [upload])).length) await owner(`insert into marking_uploads (school_id, upload_id, paper_id, mode, created_by, closed_at) values ($1, $2, $3, 'per_file', $4, now())`, [A, upload, paperId, TARA]);
  await owner(
    `insert into marking_sheets (school_id, sheet_id, paper_id, upload_id, student_id, matched_by, state, flags, practice, ai_confidence, strengths, improve, marked_at)
     values ($1, $2, $3, $4, $5, 'roll', 'marked', $6::text[], $7::jsonb, 0.9, 'Neat working.', 'Check the last line.', now())`,
    [A, sheetId, paperId, upload, studentId, flags, JSON.stringify(practice)]
  );
  for (const [label, ai, error, attempted] of rows) {
    await owner(
      `insert into marking_marks (school_id, sheet_id, paper_id, question_id, attempted, ai_marks, error_type, confidence) values ($1, $2, $3, $4, $5, $6, $7, 0.9)`,
      [A, sheetId, paperId, qid(paperId, label), attempted ?? true, ai, error]
    );
  }
  return sheetId;
}
const sheetOf = async (paperId: string, studentId: string) => (await owner(`select sheet_id from marking_sheets where paper_id = $1 and student_id = $2`, [paperId, studentId]))[0].sheet_id as string;

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction) values ('${A}', 'Sunrise Made-up School', 'IN-HR'), ('${B}', 'Hilltop Made-up School', 'IN-DL');
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${TESTSCHOOL}', 'Made-up Test School', 'IN-HR', true);
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'principal@a.example', 'principal', 'Priya Principal', true), ('${COORDINATOR}', '${A}', 'chitra@a.example', 'academic_coordinator', 'Chitra Coordinator', true),
      ('${TARA}', '${A}', 'tara@a.example', 'teacher', 'Tara Teacher', true), ('${OMAR}', '${A}', 'omar@a.example', 'teacher', 'Omar Other', true),
      ('${ACCOUNTANT}', '${A}', 'anil@a.example', 'accountant', 'Anil Accountant', true), ('${B_PRINCIPAL}', '${B}', 'principal@b.example', 'principal', 'Bela Principal', true);
    insert into teachers (teacher_id, school_id, user_id, name) values (gen_random_uuid(), '${A}', '${TARA}', 'Tara Teacher'), (gen_random_uuid(), '${A}', '${OMAR}', 'Omar Other');
    insert into classes (class_id, school_id, name, grade, section, class_teacher_id) values ('${C7A}', '${A}', '7', '7', 'A', '${TARA}'), ('${C7B}', '${A}', '7', '7', 'B', '${OMAR}'), ('${CB}', '${B}', '7', '7', 'A', null);
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Mathematics'), ('${B_MATHS}', '${B}', 'Mathematics');
    insert into teacher_subjects (school_id, teacher_id, subject_id, class_id)
      select '${A}', t.teacher_id, x.subject_id, x.class_id from teachers t join (values ('${TARA}'::uuid, '${MATHS}'::uuid, '${C7A}'::uuid), ('${OMAR}', '${MATHS}', '${C7B}')) x(user_id, subject_id, class_id) on x.user_id = t.user_id;
    insert into students (student_id, school_id, admission_no, name, class_id, roll_no, status) values
      ('${MEERA}', '${A}', 'A-1', 'Meera Sharma', '${C7A}', '1', 'active'), ('${ZOYA}', '${A}', 'A-2', 'Zoya Khan', '${C7A}', '2', 'active'),
      ('${DEV}', '${A}', 'A-3', 'Dev Patel', '${C7A}', '3', 'active'), ('${ESHA}', '${A}', 'A-4', 'Esha Rao', '${C7A}', '4', 'active'),
      ('${KABIR}', '${A}', 'B-1', 'Kabir Nair', '${C7B}', '1', 'active'), ('${ROHAN}', '${B}', 'Z-1', 'Rohan Das', '${CB}', '1', 'active');
    insert into syllabus_units (unit_id, school_id, class_id, subject_id, position, chapter, topic) values
      ('${FR1}', '${A}', '${C7A}', '${MATHS}', 1, 'Fractions', 'Adding fractions'), ('${FR2}', '${A}', '${C7A}', '${MATHS}', 2, 'Fractions', 'Comparing fractions'),
      ('${DEC}', '${A}', '${C7A}', '${MATHS}', 3, 'Decimals', 'Tenths'), ('${U7B}', '${A}', '${C7B}', '${MATHS}', 1, 'Fractions', 'Adding fractions');
    insert into school_module_entitlements (school_id, module_id, enabled, source) select s, m, true, 'plan' from unnest(array['${A}', '${B}']::uuid[]) s, unnest(array['learning-genome', 'exams']) m
      on conflict (school_id, module_id) do update set enabled = true;
    insert into exams (exam_id, school_id, name, term, created_by, created_at) values
      ('${E1}', '${A}', 'Unit test 1', 'Term 1', '${PRINCIPAL}', now() - interval '50 days'), ('${E2}', '${A}', 'Half-yearly', 'Term 1', '${PRINCIPAL}', now() - interval '10 days');
  `);
  await owner(`insert into grading_schemes (school_id, version, scheme, made_by) values ($1, 1, $2::jsonb, $3)`, [A, JSON.stringify(SCHEME), PRINCIPAL]);
  for (const [paper, exam, classId, back] of [[P1, E1, C7A, 40], [P2, E2, C7A, 5], [P7B, E1, C7B, 40]] as const) {
    await owner(`insert into exam_papers (paper_id, school_id, exam_id, class_id, subject_id, paper_date, components, created_by) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`, [paper, A, exam, classId, MATHS, day(back), JSON.stringify(THEORY), PRINCIPAL]);
  }
  // The questions, as a teacher listed them. Paper 1's Q4 is "attempt (a) or (b)": the best one counts.
  const ask = async (paper: string, list: readonly (readonly [string, number, string, string | null])[], counts: object) => {
    await owner(`insert into marking_setups (school_id, paper_id, language, guidance, choice_counts, updated_by) values ($1, $2, 'en', '', $3::jsonb, $4)`, [A, paper, JSON.stringify(counts), TARA]);
    for (const [i, [label, max, unitId, group]] of list.entries()) {
      QID[`${paper}:${label}`] = u(2000 + Object.keys(QID).length);
      await owner(
        `insert into marking_questions (school_id, question_id, paper_id, position, label, component, max_marks, choice_group, unit_id, kind, prompt, answer_key, steps, updated_by)
         values ($1, $2, $3, $4, $5, 'theory', $6, $7, $8, 'short', 'A made-up question.', 'A made-up key.', '[]'::jsonb, $9)`,
        [A, QID[`${paper}:${label}`], paper, i + 1, label, max, group, unitId, TARA]
      );
    }
  };
  await ask(P1, Q1, { A: 1 });
  await ask(P2, Q2, {});
  state.tenant = (claims: { role: string; sub: string; schoolId: string }, fn: (c: unknown) => Promise<unknown>) => as({ role: claims.role, user: claims.sub, school: claims.schoolId }, fn);

  // Paper 1 (Unit test 1): the AI's marks and kinds of mistake. Meera's Q2 is raised to 3 by the teacher below.
  await script(P1, MEERA, [['1', 3, 'none'], ['2', 2, 'calculation'], ['3', 4, 'none'], ['4a', 6, 'concept'], ['4b', 8, 'incomplete']], [{ unitId: FR1, text: 'Five sums adding fractions.' }]);
  await script(P1, ZOYA, [['1', 1, 'calculation'], ['2', 1, 'calculation'], ['3', 2, 'incomplete'], ['4a', 5, 'concept'], ['4b', 5, 'concept']]);
  await script(P1, DEV, [['1', 0, 'not_attempted', false], ['2', 1, 'calculation'], ['3', 1, 'calculation'], ['4a', 2, 'concept'], ['4b', 3, 'calculation']]);
  await script(P1, ESHA, [['1', 3, 'none'], ['2', 3, 'none'], ['3', 4, 'none'], ['4a', 10, 'none'], ['4b', 0, 'not_attempted', false]]);
  // Paper 2 (Half-yearly). Esha's script is flagged unsure and stays unapproved.
  await script(P2, MEERA, [['1', 4, 'none'], ['2', 5, 'calculation'], ['3', 9, 'none']], [{ unitId: DEC, text: 'Money as tenths.' }, { unitId: null, text: 'Read each question twice.' }, { unitId: DEC, text: 'Money as tenths.' }]);
  await script(P2, ZOYA, [['1', 2, 'calculation'], ['2', 2, 'calculation'], ['3', 6, 'incomplete']]);
  await script(P2, DEV, [['1', 1, 'calculation'], ['2', 2, 'calculation'], ['3', 3, 'concept']]);
  await script(P2, ESHA, [['1', 4, 'none'], ['2', 6, 'none'], ['3', 10, 'none']], [], ['unsure']);
  // 7-B's paper: Kabir's script, approved by Omar.
  QID[`${P7B}:1`] = u(2900);
  await owner(`insert into marking_questions (school_id, question_id, paper_id, position, label, component, max_marks, unit_id, kind, prompt, answer_key, steps, updated_by) values ($1, $2, $3, 1, '1', 'theory', 20, $4, 'short', 'x', 'x', '[]'::jsonb, $5)`, [A, QID[`${P7B}:1`], P7B, U7B, OMAR]);
  await script(P7B, KABIR, [['1', 11, 'calculation']]);

  // The teacher raises Meera's Q2 to its full marks (the AI gave 2), then approves every script with no flag.
  const meera1 = await sheetOf(P1, MEERA);
  expect(await as(tara, (c) => changeSheet(c, actor(tara), meera1, { questions: [{ questionId: qid(P1, '2'), marks: 3, note: 'Right after all.' }] }))).toEqual({ ok: true });
  expect(await as(tara, (c) => approveSheets(c, actor(tara), P1, 'unflagged'))).toMatchObject({ ok: true, approved: 4 });
  expect(await as(tara, (c) => approveSheets(c, actor(tara), P2, 'unflagged'))).toMatchObject({ ok: true, approved: 3 });
  expect(await as(omar, (c) => approveSheets(c, actor(omar), P7B, 'unflagged'))).toMatchObject({ ok: true, approved: 1 });
  // Esha’s Half-yearly mark is typed by hand (the AI’s sheet waits for a person), so the paper can be entered.
  expect((await as(tara, (c) => saveMarks(c, actor(tara), P2, [{ studentId: ESHA, component: 'theory', kind: 'score', score: 15 }]))).ok).toBe(true);
  for (const paper of [P1, P2]) await as(principal, (c) => c.query(`update exam_papers set entered_by = $2 where paper_id = $1`, [paper, PRINCIPAL]));
  for (const exam of [E1, E2]) expect(await as(principal, (c) => publishClass(c, actor(principal), exam, C7A)), exam).toMatchObject({ ok: true });
}, 180_000);
afterAll(async () => db?.stop());

describe('the Learning Genome by topic', () => {
  it('every number traces to its questions: the marks got out of the marks possible, the answers they come from, internal choice respected', async () => {
    const g = (await genomeOf(principal, MEERA))!;
    expect(g.topics).toMatchObject({ scripts: 2, answers: 7, unlinked: 0 });
    // Meera: paper 1 counts Q1 3/3, Q2 3/3 (the teacher's mark, not the AI's 2), Q3 4/4 and Q4(b) 8/10 (the better of
    // 6 and 8: Q4(a) is left out); paper 2 counts 4/4, 5/6 and 9/10.
    expect(g.topics.chapters.map((c) => [c.subjectName, c.chapter, c.className, c.marks, c.max, c.rounded, c.questions])).toEqual([
      ['Mathematics', 'Fractions', '7-A', 15, 16, 94, 4],
      ['Mathematics', 'Decimals', '7-A', 21, 24, 88, 3],
    ]);
    const topics = g.topics.chapters.flatMap((c) => c.topics);
    expect(topics.map((t) => [t.topic, t.marks, t.max, t.rounded, t.questions])).toEqual([['Adding fractions', 7, 7, 100, 2], ['Comparing fractions', 8, 9, 89, 2], ['Tenths', 21, 24, 88, 3]]);
    // The evidence: exam name, question label, marks; each is Meera's own row, and the topic's marks are their sum.
    expect(topics[2].evidence.map((e) => [e.examName, e.label, e.marks, e.max])).toEqual([['Unit test 1', '3', 4, 4], ['Unit test 1', '4b', 8, 10], ['Half-yearly', '3', 9, 10]]);
    const rows = await owner(
      `select p.exam_id, q.label, coalesce(m.marks, m.ai_marks)::float as mark, q.max_marks::float as max, q.unit_id
         from marking_marks m join marking_questions q using (school_id, question_id) join marking_sheets s on s.sheet_id = m.sheet_id join exam_papers p on p.paper_id = m.paper_id
        where s.student_id = $1 and ${APPROVED_SHEET}`,
      [MEERA]
    );
    for (const t of topics) {
      expect(t.evidence.reduce((sum, e) => sum + e.marks, 0), t.topic).toBeCloseTo(t.marks, 5);
      expect(t.evidence.reduce((sum, e) => sum + e.max, 0), t.topic).toBeCloseTo(t.max, 5);
      for (const e of t.evidence) {
        const own = rows.find((r: { exam_id: string; label: string; unit_id: string }) => r.exam_id === e.examId && r.label === e.label && r.unit_id === t.unitId);
        expect(own, `${e.examName} ${e.label}`).toMatchObject({ mark: e.marks, max: e.max });
      }
    }
    // Q4(a) (6) lost to Q4(b) (8): it appears nowhere. No other child's answer appears.
    expect(JSON.stringify(g.topics)).not.toContain('"4a"');
    expect(JSON.stringify(g.topics)).not.toMatch(/Zoya|Dev|Esha|Kabir/);
    // The tie: Zoya’s Q4(a) and Q4(b) are both 5, and the one listed first counts.
    const zoya = (await genomeOf(principal, ZOYA))!;
    expect(zoya.topics.chapters.flatMap((c) => c.topics).find((t) => t.topic === 'Adding fractions')!.evidence.map((e) => [e.label, e.marks])).toEqual([['1', 1], ['4a', 5], ['1', 2]]);
  });

  it('topics are in the order of the syllabus map and the exams, never by marks, and no child is ranked', async () => {
    const g = (await genomeOf(principal, MEERA))!;
    expect(g.topics.chapters.map((c) => c.chapter)).toEqual(['Fractions', 'Decimals']); // Decimals has the lower percent here, Fractions the higher: the map’s order, not marks’
    const dev = (await genomeOf(principal, DEV))!;
    expect(dev.topics.chapters.map((c) => [c.chapter, c.rounded])).toEqual([['Fractions', 25], ['Decimals', 29]]); // Decimals is higher here: still the map’s order
    expect(dev.topics.chapters[0].points.map((p) => p.examName)).toEqual(['Unit test 1', 'Half-yearly']);
  });

  it('progress by chapter is against the child’s own previous exam, by the trend line', async () => {
    const meera = (await genomeOf(principal, MEERA))!;
    // Fractions: 6 of 6 (100) in Unit test 1, then 9 of 10 (90) in the Half-yearly: down 10, on the line.
    expect(meera.topics.chapters[0].change).toMatchObject({ direction: 'down', points: 10, line: 10, from: { examName: 'Unit test 1', marks: 6, max: 6, rounded: 100 }, to: { examName: 'Half-yearly', marks: 9, max: 10, rounded: 90 } });
    // Decimals: 12 of 14 (86), then 9 of 10 (90): steady.
    expect(meera.topics.chapters[1].change).toMatchObject({ direction: 'steady', points: 4 });
    const zoya = (await genomeOf(principal, ZOYA))!;
    expect(zoya.topics.chapters[1].change).toMatchObject({ direction: 'up', points: 10 }); // Decimals 50 -> 60, exactly on the line
    const dev = (await genomeOf(principal, DEV))!;
    expect(dev.topics.chapters[0].change).toMatchObject({ direction: 'up', points: 13 }); // Fractions 17 -> 30
    // The line is the school’s own trend_points: the same setting a subject’s trend uses.
    await setLines('learning-genome', 2, { trend_points: 15 });
    expect((await genomeOf(principal, DEV))!.topics.chapters[0].change).toMatchObject({ direction: 'steady', points: 13, line: 15 });
    await setLines('learning-genome', 2, { trend_points: 3 });
    expect((await genomeOf(principal, ZOYA))!.topics.chapters[0].change).toMatchObject({ direction: 'down', points: 4, line: 3 }); // Fractions 44 -> 40
    await setLines('learning-genome', 2, null);
  });

  it('the kinds of mistake that keep coming back: at the school’s lines of answers and papers, from answers that lost marks', async () => {
    // Zoya: calculation in four counted answers across two papers; incomplete twice; concept once (Q4(a)).
    const zoya = (await genomeOf(principal, ZOYA))!;
    expect(zoya.settings).toMatchObject({ mistakeMinQuestions: 3, mistakeMinPapers: 2 });
    expect(zoya.topics.mistakes.map((m) => [m.kind, m.questions, m.papers])).toEqual([['calculation', 4, 2]]);
    expect(zoya.topics.mistakes[0].evidence.map((e) => [e.examName, e.label, e.marks, e.max])).toEqual([['Unit test 1', '1', 1, 3], ['Unit test 1', '2', 1, 3], ['Half-yearly', '1', 2, 4], ['Half-yearly', '2', 2, 6]]);
    // Dev: calculation in five (three in paper 1, two in paper 2); his Q4(a) concept (2) was not counted, only paper 2's.
    const dev = (await genomeOf(principal, DEV))!;
    expect(dev.topics.mistakes.map((m) => [m.kind, m.questions, m.papers])).toEqual([['calculation', 5, 2]]);
    // Meera: Q2's recorded kind "calculation" was given its full marks by the teacher, so it is no mistake: one only.
    const meera = (await genomeOf(principal, MEERA))!;
    expect(meera.topics.mistakes).toEqual([]);
    // The lines are the school’s: more answers, or more papers, than Zoya has, and the kind is no longer listed.
    await setLines('learning-genome', 2, { mistake_min_questions: 5 });
    expect((await genomeOf(principal, ZOYA))!.topics.mistakes).toEqual([]);
    expect((await genomeOf(principal, DEV))!.topics.mistakes).toHaveLength(1);
    await setLines('learning-genome', 2, { mistake_min_papers: 3 });
    expect((await genomeOf(principal, ZOYA))!.topics.mistakes).toEqual([]);
    await setLines('learning-genome', 2, { mistake_min_questions: 2, mistake_min_papers: 2 });
    expect((await genomeOf(principal, ZOYA))!.topics.mistakes.map((m) => [m.kind, m.questions])).toEqual([['calculation', 4], ['incomplete', 2]]);
    await setLines('learning-genome', 2, null);
  });

  it('practise next is the practice list on the latest approved script of each subject', async () => {
    const meera = (await genomeOf(principal, MEERA))!;
    expect(meera.topics.practice).toHaveLength(1);
    expect(meera.topics.practice[0]).toMatchObject({ subjectName: 'Mathematics', paperId: P2, examName: 'Half-yearly' });
    expect(meera.topics.practice[0].items).toEqual([{ text: 'Money as tenths.', chapter: 'Decimals', topic: 'Tenths' }, { text: 'Read each question twice.', chapter: null, topic: null }]);
    expect((await genomeOf(principal, ZOYA))!.topics.practice).toEqual([]);
  });

  it('only approved scripts of papers in force count: an unapproved script, a changed one, and a reopened class drop out', async () => {
    // Esha: paper 1 is approved; paper 2 (flagged unsure) is not. Only paper 1 counts.
    const esha = (await genomeOf(principal, ESHA))!;
    expect(esha.topics.scripts).toBe(1);
    expect(esha.topics.chapters.flatMap((c) => c.points.map((p) => p.examName))).toEqual(['Unit test 1', 'Unit test 1']);
    expect(esha.topics.chapters.every((c) => c.change === null)).toBe(true);
    // A script changed after it was approved waits to be approved again: it is left out until then.
    const zoyaP2 = await sheetOf(P2, ZOYA);
    await owner(`update marking_sheets set flags = array['changed'] where sheet_id = $1`, [zoyaP2]);
    const zoyaChanged = (await genomeOf(principal, ZOYA))!;
    expect(zoyaChanged.topics.scripts).toBe(1);
    expect(zoyaChanged.topics.mistakes).toEqual([]); // calculation: only two answers left
    await owner(`update marking_sheets set flags = '{}' where sheet_id = $1`, [zoyaP2]);
    expect((await genomeOf(principal, ZOYA))!.topics.scripts).toBe(2);
    // A reopened class drops out: nothing of its papers counts, topics, mistakes or practice, until it is published again.
    expect((await as(principal, (c) => reopenClass(c, actor(principal), E2, C7A, 'A mark to correct'))).ok).toBe(true);
    const reopened = (await genomeOf(principal, MEERA))!;
    expect(reopened.topics.scripts).toBe(1);
    expect(reopened.topics.chapters.flatMap((c) => c.points.map((p) => p.examName))).toEqual(['Unit test 1', 'Unit test 1']);
    expect(reopened.topics.practice.map((p) => p.examName)).toEqual(['Unit test 1']);
    expect(reopened.topics.practice[0].items.map((i) => i.text)).toEqual(['Five sums adding fractions.']);
    expect((await as(principal, (c) => publishClass(c, actor(principal), E2, C7A))).ok).toBe(true);
    expect((await genomeOf(principal, MEERA))!.topics.scripts).toBe(2);
  });

  it('a child with no approved script has an empty topics part, not zeros', async () => {
    await owner(`insert into students (student_id, school_id, admission_no, name, class_id, roll_no, status) values ($1, $2, 'A-9', 'Nia Newcomer', $3, '9', 'active')`, [u(49), A, C7A]);
    const g = (await genomeOf(principal, u(49)))!;
    expect(g.topics).toEqual({ scripts: 0, answers: 0, unlinked: 0, chapters: [], mistakes: [], practice: [] });
    const html = renderToStaticMarkup(h(GenomeChild, { genome: g })).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(html).toContain('No approved answer sheet of a published exam yet.');
    expect(html).toContain('No chapter has been asked in two exams yet.');
    expect(html).toContain('Mistakes appear once an answer sheet of a published exam is approved.');
    expect(html).toContain('Nothing to practise yet.');
    await owner(`delete from students where student_id = $1`, [u(49)]);
  });

  it('who reads it: the office and the coordinator every class, a teacher their own; another class’s teacher and the accountant nothing', async () => {
    expect((await genomeOf(principal, MEERA))!.topics.scripts).toBe(2);
    expect((await genomeOf(coordinator, MEERA))!.topics.scripts).toBe(2);
    expect((await genomeOf(tara, MEERA))!.topics.scripts).toBe(2);
    expect(await genomeOf(omar, MEERA)).toBeNull();
    expect(await genomeOf(accountant, MEERA)).toBeNull();
    expect(await genomeOf(otherSchool, MEERA)).toBeNull();
    // The database says the same: another class’s teacher, the accountant and another school read no script, question or mark.
    for (const who of [omar, accountant, otherSchool]) {
      for (const table of ['marking_sheets', 'marking_marks', 'marking_questions']) {
        const n = await as(who, async (c) => (await c.query(`select count(*)::int as n from ${table} where paper_id in ($1, $2)`, [P1, P2])).rows[0].n as number);
        expect(n, `${who.role} ${table}`).toBe(0);
      }
    }
    // Omar reads his own class’s script, and the genome of his own child.
    expect((await genomeOf(omar, KABIR))!.topics.scripts).toBe(0); // 7-B’s exam is not published: not in force
    expect(await as(omar, async (c) => (await c.query(`select count(*)::int as n from marking_sheets`)).rows[0].n)).toBe(1);
  });

  it('the screen says every number with its lines and where it comes from, links each answer to its paper, and ranks no one', async () => {
    const g = (await genomeOf(principal, ZOYA))!;
    const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const html = renderToStaticMarkup(h(GenomeChild, { genome: g }));
    const plain = text(html);
    for (const words of [
      'Topics from answer sheets',
      'From 2 approved answer sheets. Answers counted: 7.',
      'Fractions (7-A)',
      'Adding fractions: 7 of 16 marks · 44% · 3 answers',
      'Unit test 1, question 4a: 5 of 10',
      'Progress by chapter',
      'The line: 10 points against their own previous exam in the chapter.',
      'Decimals rose 10 points: 50% in Unit test 1, then 60% in Half-yearly.',
      'Mistakes that keep coming back',
      'The lines: answers that lost marks to the same kind of mistake, at least 3; papers they come from, at least 2.',
      'Slips in calculation: 4 answers lost marks. Papers: 2.',
      'Practise next',
    ]) expect(plain, words).toContain(words);
    // Each answer is a link to its paper.
    expect(html).toContain(`href="/app/exams/papers/${P1}"`);
    expect(html).toContain(`href="/app/exams/papers/${P2}"`);
    expect(plain).not.toMatch(/\brank|position|topper|percentile|class average|best|worst/i);
    // The same in Hindi, with none of the English sentences left.
    const hindi = text(renderToStaticMarkup(h(LangProvider, { lang: 'hi', children: h(GenomeChild, { genome: g }) })));
    for (const words of ['उत्तर पुस्तिकाओं से विषय-बिंदु', 'अध्याय के अनुसार प्रगति', 'बार-बार लौटने वाली ग़लतियाँ', 'आगे अभ्यास', 'रेखाएँ: एक ही तरह की ग़लती से अंक गँवाने वाले उत्तर कम से कम 3; जिन पेपरों से वे आए, कम से कम 2।']) expect(hindi, words).toContain(words);
    for (const words of ['Topics from answer sheets', 'Progress by chapter', 'Mistakes that keep coming back', 'Practise next', 'The lines:']) expect(hindi, words).not.toContain(words);
  });

  it('the new lines are settings, with their words in both languages', () => {
    const schema = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'learning-genome')!;
    expect(schema.version).toBe(2);
    expect(schema.fields.filter((f) => f.key.startsWith('mistake_')).map((f) => [f.key, f.default, f.min, f.max])).toEqual([['mistake_min_questions', 3, 2, 50], ['mistake_min_papers', 2, 1, 20]]);
    expect(DEFAULT_GENOME_SETTINGS).toMatchObject({ mistakeMinQuestions: 3, mistakeMinPapers: 2 });
    for (const key of ['mistake_min_questions', 'mistake_min_papers']) for (const part of ['label', 'help']) {
      expect((en as Record<string, string>)[`set.learning-genome.${key}.${part}`], `${key} ${part}`).toBeTruthy();
      expect(/[ऀ-ॿ]/.test((hi as Record<string, string>)[`set.learning-genome.${key}.${part}`]), `${key} ${part} in Hindi`).toBe(true);
    }
    // The line is whole numbers: a stored decimal is cut, and one the schema refuses is not used.
  });
});

describe('a paper’s class view', () => {
  it('per question the average, how many attempted and the most common mistake; each number is the sum of its rows', async () => {
    const v = (await insightsOf(principal, P1))!;
    expect(v.paper).toMatchObject({ paperId: P1, examName: 'Unit test 1', subjectName: 'Mathematics', className: '7-A', published: true });
    expect(v).toMatchObject({ candidates: 4, scripts: { approved: 4, notCounted: 0 }, supportBelow: 40 });
    // Hand-worked from the rows: Q1 3, 1, 0, 3 (Dev did not attempt); Q2 3 (the teacher’s), 1, 1, 3; Q3 4, 2, 1, 4; Q4(a) counts for
    // Zoya (tie, listed first) 5 and Esha 10; Q4(b) for Meera 8 and Dev 3 (Esha’s 0 is left out by the choice).
    expect(v.questions.map((q) => [q.label, q.maxMarks, q.counted, q.attempted, q.average, q.mistake])).toEqual([
      ['1', 3, 4, 3, 1.8, { kind: 'calculation', count: 1 }], // 1.75 to one decimal; calculation and not_attempted tie at 1: the earlier kind
      ['2', 3, 4, 4, 2, { kind: 'calculation', count: 2 }], // Meera’s calculation kind kept her full marks: not a mistake
      ['3', 4, 4, 4, 2.8, { kind: 'calculation', count: 1 }], // 2.75; Zoya incomplete and Dev calculation tie
      ['4a', 10, 2, 2, 7.5, { kind: 'concept', count: 1 }],
      ['4b', 10, 2, 2, 5.5, { kind: 'calculation', count: 1 }], // Meera incomplete, Dev calculation
    ]);
    // Straight from the rows: the sum of the counted final marks of each question.
    const sums = await owner(
      `select q.label, sum(coalesce(m.marks, m.ai_marks))::float as total from marking_marks m join marking_questions q using (school_id, question_id) join marking_sheets s on s.sheet_id = m.sheet_id
        where m.paper_id = $1 and ${APPROVED_SHEET} and (q.choice_group is null or (q.label = '4a' and s.student_id in ($2, $3)) or (q.label = '4b' and s.student_id in ($4, $5))) group by q.label order by q.label`,
      [P1, ZOYA, ESHA, MEERA, DEV]
    );
    for (const row of sums as { label: string; total: number }[]) {
      const q = v.questions.find((x) => x.label === row.label)!;
      expect(Math.round((q.average ?? 0) * q.counted * 10) / 10, row.label).toBeCloseTo(Math.round(row.total * 10) / 10, 0);
    }
  });

  it('per topic the class’s marks out of the marks possible, in the syllabus order, with the questions they come from', async () => {
    const v = (await insightsOf(principal, P1))!;
    expect(v.topics.map((t) => [t.chapter, t.topic, t.marks, t.max, t.rounded, t.answers, t.questions.map((q) => q.label)])).toEqual([
      ['Fractions', 'Adding fractions', 22, 32, 69, 6, ['1', '4a']],
      ['Fractions', 'Comparing fractions', 8, 12, 67, 4, ['2']],
      ['Decimals', 'Tenths', 22, 36, 61, 6, ['3', '4b']],
    ]);
    // A question that names no topic is counted together, last.
    await owner(`update marking_questions set unit_id = null where question_id = $1`, [qid(P1, '2')]);
    const open = (await insightsOf(principal, P1))!;
    expect(open.topics.map((t) => [t.topic, t.marks, t.max])).toEqual([['Adding fractions', 22, 32], ['Tenths', 22, 36], [null, 8, 12]]);
    await owner(`update marking_questions set unit_id = $2 where question_id = $1`, [qid(P1, '2'), FR2]);
  });

  it('the children who may need support are below the school’s line, in roll order, never by marks', async () => {
    // Totals: Meera 18 of 20, Zoya 9, Dev 5, Esha 20. The school’s line is 40 in 100: only Dev.
    const names = (v: PaperInsights) => v.support.map((c) => [c.name, c.rollNo, c.marks, c.max]);
    expect(names((await insightsOf(principal, P1))!)).toEqual([['Dev Patel', '3', 5, 20]]);
    // 50 in 100: Zoya (roll 2, 9 marks) is listed before Dev (roll 3, 5 marks), although Dev has fewer.
    await setLines('exams', 1, { support_below: 50 });
    const fifty = (await insightsOf(principal, P1))!;
    expect(fifty.supportBelow).toBe(50);
    expect(names(fifty)).toEqual([['Zoya Khan', '2', 9, 20], ['Dev Patel', '3', 5, 20]]);
    // Exactly on the line is not below it: Zoya has 45 in 100.
    await setLines('exams', 1, { support_below: 45 });
    expect(names((await insightsOf(principal, P1))!)).toEqual([['Dev Patel', '3', 5, 20]]);
    await setLines('exams', 1, { support_below: 0 });
    expect((await insightsOf(principal, P1))!.support).toEqual([]);
    await setLines('exams', 1, null);
    // The questions and the topics are in the paper’s and the map’s order too.
    const v = (await insightsOf(principal, P1))!;
    expect(v.questions.map((q) => q.label)).toEqual(['1', '2', '3', '4a', '4b']);
  });

  it('a script that is not approved, or was changed after it was approved, is counted apart and left out', async () => {
    const v = (await insightsOf(principal, P2))!;
    expect(v).toMatchObject({ candidates: 4, scripts: { approved: 3, notCounted: 1 } }); // Esha’s waits, flagged unsure
    expect(v.questions.map((q) => [q.label, q.counted, q.average])).toEqual([['1', 3, 2.3], ['2', 3, 3], ['3', 3, 6]]);
    await owner(`update marking_sheets set flags = array['changed'] where sheet_id = $1`, [await sheetOf(P2, ZOYA)]);
    const changed = (await insightsOf(principal, P2))!;
    expect(changed.scripts).toEqual({ approved: 2, notCounted: 2 });
    expect(changed.questions.map((q) => q.average)).toEqual([2.5, 3.5, 6]);
    await owner(`update marking_sheets set flags = '{}' where sheet_id = $1`, [await sheetOf(P2, ZOYA)]);
  });

  it('a reopened class still shows its approved scripts, and says the result is not published', async () => {
    expect((await as(principal, (c) => reopenClass(c, actor(principal), E2, C7A, 'A mark to correct'))).ok).toBe(true);
    const v = (await insightsOf(principal, P2))!;
    expect(v.paper.published).toBe(false);
    expect(v.scripts.approved).toBe(3);
    expect((await as(principal, (c) => publishClass(c, actor(principal), E2, C7A))).ok).toBe(true);
  });

  it('who reads it: the office and the coordinator every class, a teacher their own; another class’s teacher and the accountant nothing', async () => {
    expect((await insightsOf(principal, P1))!.scripts.approved).toBe(4);
    expect((await insightsOf(coordinator, P1))!.scripts.approved).toBe(4);
    expect((await insightsOf(tara, P1))!.scripts.approved).toBe(4);
    expect(await insightsOf(omar, P1)).toBeNull();
    expect(await insightsOf(accountant, P1)).toBeNull();
    expect(await insightsOf(otherSchool, P1)).toBeNull();
    expect((await insightsOf(omar, P7B))!.scripts.approved).toBe(1);
    expect(await insightsOf(tara, P7B)).toBeNull();
    expect(await insightsOf(principal, u(9999))).toBeNull();
  });

  it('the route answers the same, and reads without writing, queueing, or asking a model', async () => {
    const before = await owner(`select (select count(*)::int from audit_log) as audit, (select count(*)::int from jobs) as jobs, (select count(*)::int from communication_log) as messages, (select count(*)::int from school_settings) as settings, (select count(*)::int from marks) as marks`);
    const call = async (who: Who, id: string) => {
      state.claims = { sub: who.user, role: who.role, schoolId: who.school ?? A };
      const res = await getInsights(new NextRequest(`http://localhost/api/app/exams/papers/${id}/insights`), { params: { paperId: id } });
      return { status: res.status, body: await res.json() };
    };
    state.asked = 0;
    const ok = await call(tara, P1);
    expect(ok.status).toBe(200);
    expect(ok.body.scripts).toEqual({ approved: 4, notCounted: 0 });
    expect((await call(coordinator, P2)).status).toBe(200);
    expect(await call(omar, P1)).toMatchObject({ status: 404, body: { code: 'not_found' } });
    expect(await call(accountant, P1)).toMatchObject({ status: 403, body: { code: 'not_allowed' } });
    expect(await call(otherSchool, P1)).toMatchObject({ status: 404 });
    expect(await call(principal, 'not-an-id')).toMatchObject({ status: 400, body: { code: 'not_sent_properly' } });
    // Switched off for the school: the route does not answer.
    await owner(`update school_module_entitlements set enabled = false where school_id = $1 and module_id = 'exams'`, [A]);
    expect(await call(principal, P1)).toMatchObject({ status: 403, body: { code: 'module_off' } });
    await owner(`update school_module_entitlements set enabled = true where school_id = $1 and module_id = 'exams'`, [A]);
    // The genome route carries the topics too.
    state.claims = { sub: TARA, role: 'teacher', schoolId: A };
    const g = await getGenome(new NextRequest(`http://localhost/api/app/learning-genome/${MEERA}`), { params: { studentId: MEERA } });
    expect(((await g.json()) as Genome).topics.scripts).toBe(2);
    expect(await owner(`select (select count(*)::int from audit_log) as audit, (select count(*)::int from jobs) as jobs, (select count(*)::int from communication_log) as messages, (select count(*)::int from school_settings) as settings, (select count(*)::int from marks) as marks`)).toEqual(before);
    expect(state.asked).toBe(0);
  });

  it('the screen says the school’s line where it is used, lists children in roll order, and ranks no one; in Hindi too', async () => {
    await setLines('exams', 1, { support_below: 50 });
    const data = (await insightsOf(principal, P1))!;
    await setLines('exams', 1, null);
    const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const html = renderToStaticMarkup(h(PaperInsightsBody, { data }));
    const plain = text(html);
    for (const words of [
      'Unit test 1 · Mathematics · 7-A',
      'This paper’s result is published for the class.',
      'From 4 approved answer sheets, of 4 candidates.',
      'Question 1 · 3 marks',
      'Average 1.8 of 3',
      'Attempted in 3 of 4 sheets',
      'Most common mistake: Slips in calculation (1)',
      'Fractions · Adding fractions',
      'The class got 22 of 32 marks · 69%',
      'Children who may need support',
      'Below 50 in 100 on this paper: the school’s setting.',
    ]) expect(plain, words).toContain(words);
    // Roll order: Zoya (roll 2) before Dev (roll 3), though Dev has fewer marks.
    expect(plain.indexOf('2. Zoya Khan')).toBeGreaterThan(-1);
    expect(plain.indexOf('2. Zoya Khan')).toBeLessThan(plain.indexOf('3. Dev Patel'));
    expect(plain).toContain('9 of 20 marks');
    expect(plain).not.toMatch(/\brank|position|topper|percentile|best|worst/i);
    // A question card links from its topic.
    expect(html).toContain(`href="#q-${qid(P1, '1')}"`);
    expect(html).toContain(`id="q-${qid(P1, '1')}"`);
    const hindi = text(renderToStaticMarkup(h(LangProvider, { lang: 'hi', children: h(PaperInsightsBody, { data }) })));
    for (const words of ['प्रश्न-दर-प्रश्न', 'जिन बच्चों को मदद की ज़रूरत हो सकती है', 'इस पेपर पर हर 100 में 50 से कम: स्कूल की सेटिंग।', 'प्रश्न 1 · 3 अंक']) expect(hindi, words).toContain(words);
    for (const words of ['Question by question', 'Children who may need support', 'Below 50 in 100']) expect(hindi, words).not.toContain(words);
  });

  it('a paper with no approved script teaches what to do, instead of showing zeros', async () => {
    const empty = (await insightsOf(principal, P7B)) ?? null; // principal reads it: Kabir’s script is approved...
    expect(empty!.scripts.approved).toBe(1);
    await owner(`update marking_sheets set state = 'set_aside' where paper_id = $1`, [P7B]);
    const none = (await insightsOf(principal, P7B))!;
    expect(none.scripts).toEqual({ approved: 0, notCounted: 0 });
    const plain = renderToStaticMarkup(h(PaperInsightsBody, { data: none })).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(plain).toContain('No answer sheet is approved yet');
    expect(plain).not.toContain('Question by question');
    await owner(`update marking_sheets set state = 'approved' where paper_id = $1`, [P7B]);
  });
});

describe('Control’s monitor for AI marking: counts and ages only', () => {
  const JOB_ERROR = 'Mailbox meera.sharma@family.example rejected "Meera Sharma"; try +91 98123 45678';
  let seen: MarkingData;

  beforeAll(async () => {
    // Sunrise (school A, a live school): scripts waiting two hours, being marked, failed; pages kept this month, and a plan limit.
    const upload = (await owner(`select upload_id from marking_uploads where paper_id = $1`, [P2]))[0].upload_id as string;
    const waiting = await owner(`select 1`);
    expect(waiting).toBeTruthy();
    for (const [n, student, st] of [[1, KABIR, 'waiting'], [2, null, 'marking'], [3, null, 'failed']] as const) {
      await owner(
        `insert into marking_sheets (school_id, sheet_id, paper_id, upload_id, student_id, matched_by, state, failure, created_at, updated_at) values ($1, $2, $3, $4, null, 'none', $5, $6, now() - interval '3 hours', now() - interval '2 hours')`,
        [A, u(3000 + n), P2, upload, st, st === 'failed' ? 'bad_answer' : null]
      );
      expect(student === KABIR || student === null).toBe(true);
    }
    for (let i = 0; i < 4; i++) {
      await owner(
        `insert into marking_pages (school_id, page_id, upload_id, paper_id, file_no, page_no, storage_key, sha256, bytes, width, height, state) values ($1, $2, $3, $4, 1, $5, $6, $7, 1000, 1400, 2000, 'read')`,
        [A, u(3100 + i), upload, P2, i + 1, `${A}/marking/${P2}/${u(3100 + i)}.jpg`, 'a'.repeat(63) + String(i)]
      );
    }
    await owner(`update school_module_entitlements set limits = '{"ai_marking_pages": 500}' where school_id = $1 and module_id = 'exams'`, [A]);
    // Hilltop (school B): a plan limit of 3 pages and 3 pages kept: at its limit.
    await owner(`insert into exams (exam_id, school_id, name, term, created_by) values ($1, $2, 'B exam', 'Term 1', $3)`, [u(3200), B, B_PRINCIPAL]);
    await owner(`insert into exam_papers (paper_id, school_id, exam_id, class_id, subject_id, components, created_by) values ($1, $2, $3, $4, $5, $6::jsonb, $7)`, [u(3201), B, u(3200), CB, B_MATHS, JSON.stringify(THEORY), B_PRINCIPAL]);
    await owner(`insert into marking_uploads (school_id, upload_id, paper_id, mode, created_by) values ($1, $2, $3, 'per_file', $4)`, [B, u(3202), u(3201), B_PRINCIPAL]);
    for (let i = 0; i < 3; i++) {
      await owner(
        `insert into marking_pages (school_id, page_id, upload_id, paper_id, file_no, page_no, storage_key, sha256, bytes, width, height, state) values ($1, $2, $3, $4, 1, $5, $6, $7, 1000, 1400, 2000, 'read')`,
        [B, u(3210 + i), u(3202), u(3201), i + 1, `${B}/marking/${u(3201)}/${u(3210 + i)}.jpg`, 'b'.repeat(63) + String(i)]
      );
    }
    await owner(`insert into school_module_entitlements (school_id, module_id, enabled, source, limits) values ($1, 'exams', true, 'plan', '{"ai_marking_pages": 3}') on conflict (school_id, module_id) do update set limits = '{"ai_marking_pages": 3}'`, [B]);
    // A test school’s scripts are left out, as everywhere in Control.
    await owner(`update school_module_entitlements set limits = '{"ai_marking_pages": 50}' where school_id = $1 and module_id = 'exams'`, [A]);
    await owner(`insert into school_module_entitlements (school_id, module_id, enabled, source, limits) values ($1, 'exams', true, 'plan', '{"ai_marking_pages": 10}') on conflict (school_id, module_id) do update set limits = '{"ai_marking_pages": 10}'`, [TESTSCHOOL]);
    // Jobs: a marking job that gave up (its error names a child and a number), one waiting for another try, and a job of another kind.
    await owner(
      `insert into jobs (school_id, type, idempotency_key, status, attempts, max_attempts, last_error, completed_at, updated_at) values
         ($1, 'marking.mark_sheet', 'am6-dead', 'dead', 5, 5, $2, now() - interval '3 hours', now() - interval '3 hours'),
         ($1, 'marking.read_page', 'am6-retry', 'pending', 2, 5, 'timeout', null, now() - interval '5 minutes'),
         ($1, 'email.send', 'am6-other', 'dead', 8, 8, 'not a marking job', now(), now())`,
      [A, JOB_ERROR]
    );
    seen = await platform((c) => loadMarkingMonitor(c));
  }, 60_000);

  it('per school, the pages this month against the plan’s limit, the scripts by state and the age of the oldest waiting; a test school left out', () => {
    expect(seen.schools.map((s) => s.schoolName)).toEqual(['Hilltop Made-up School', 'Sunrise Made-up School']);
    const [hilltop, sunrise] = seen.schools;
    expect(hilltop).toMatchObject({ pagesThisMonth: 3, limit: 3, waiting: 0, marking: 0, marked: 0, failed: 0, approvedThisMonth: 0, oldestWaitingSeconds: null });
    // Sunrise: its earlier scripts are approved (this month) except Esha’s, still marked and waiting for a teacher.
    expect(sunrise).toMatchObject({ pagesThisMonth: 4, limit: 50, waiting: 1, marking: 1, marked: 1, failed: 1, approvedThisMonth: 9 });
    expect(sunrise.oldestWaitingSeconds).toBeGreaterThanOrEqual(2 * 3600 - 5);
    expect(sunrise.oldestWaitingSeconds).toBeLessThan(2 * 3600 + 120);
    expect(atLimit(hilltop)).toBe(true);
    expect(atLimit(sunrise)).toBe(false);
    expect(backedUp(sunrise, seen.backlogAfterMinutes)).toBe(true); // 2 hours is past the job queue’s minutes
    expect(seen.schoolsNotListed).toBe(0);
  });

  it('marking jobs that gave up are counted and listed, with their error cut of a name, an address and a number; other jobs are not', () => {
    expect(seen.jobs).toMatchObject({ dead: 1, retrying: 1 });
    expect(seen.jobs.listed).toHaveLength(1);
    expect(seen.jobs.listed[0]).toMatchObject({ type: 'marking.mark_sheet', schoolName: 'Sunrise Made-up School', attempts: 5, maxAttempts: 5, error: 'Mailbox <email> rejected "<value>"; try <phone>' });
    expect(seen.jobs.listed[0].forSeconds).toBeGreaterThanOrEqual(3 * 3600 - 5);
    expect(markingNeedsALook(seen)).toBe(true);
  });

  it('counts and ages only: no child’s name, no page, no mark and no word of a script is in the answer or on the page', async () => {
    const answer = JSON.stringify(seen);
    const PRIVATE = ['Meera', 'Zoya', 'Dev Patel', 'Esha', 'Kabir', 'Rohan', 'Sharma', 'family.example', '98123', 'Neat working', 'Check the last line', 'Five sums', 'Money as tenths', '/marking/', 'storage', 'sha256', '.jpg', 'A made-up question', 'Made-up Test School'];
    const render = (lang: 'en' | 'hi') => renderToStaticMarkup(h(LangProvider, { lang, children: h(MarkingMonitor, { data: seen, lang, age: (s: number) => ageWords(lang, s) }) }));
    for (const text of [answer, render('en'), render('hi')]) for (const secret of PRIVATE) expect(text, secret).not.toContain(secret);
    // The rows it was read from do hold them: the test would mean nothing otherwise.
    const stored = JSON.stringify(await owner(`select (select jsonb_agg(s) from marking_sheets s) as sheets, (select jsonb_agg(q) from marking_questions q) as questions, (select jsonb_agg(p) from marking_pages p) as pages, (select jsonb_agg(st) from students st) as students`));
    for (const secret of ['Meera Sharma', 'Neat working', 'A made-up question', '/marking/']) expect(stored, secret).toContain(secret);
    // It reads no marks table: not marking_marks, not a student, not a script’s words.
    const source = readFileSync(path.join(SRC, 'lib/control/marking-monitor.ts'), 'utf8').replace(/\/\/.*$/gm, '');
    for (const forbidden of ['marking_marks', 'students', 'marking_questions', 'strengths', 'improve', 'practice', 'storage_key', 'sha256', 'payload']) expect(source, forbidden).not.toContain(forbidden);
  });

  it('the section says what it counts, in both languages, with a line on what to do only for what waits on NetCyberAI', () => {
    const html = (lang: 'en' | 'hi') => renderToStaticMarkup(h(LangProvider, { lang, children: h(MarkingMonitor, { data: seen, lang, age: (s: number) => ageWords(lang, s) }) }));
    const en = html('en').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    for (const words of ['AI marking', 'Needs a look', 'Hilltop Made-up School', 'Sunrise Made-up School', 'Pages this month', '3 of 3', '4 of 50', 'Page limit reached', 'Waiting for the AI', 'Being marked', 'Marked, with a teacher', 'Failed', 'Approved this month', 'Oldest waiting', '2 hours', 'Marking jobs that gave up', 'marking.mark_sheet', 'Gave up: 1. Waiting for another try: 1.']) expect(en, words).toContain(words);
    const todo = (s: string) => [...s.matchAll(/data-monitoring-do="([^"]+)"/g)].map((m) => m[1]);
    expect(todo(html('en'))).toEqual(['marking.limit', 'marking.backlog', 'marking.dead']);
    // Retry is the existing button, once for the job that gave up.
    expect(html('en').match(/data-job-retry="/g)).toHaveLength(1);
    const hi = html('hi').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    for (const words of ['AI से जाँच', 'देखना ज़रूरी', 'इस महीने के पन्ने', 'पन्नों की सीमा पूरी', 'सबसे पुरानी प्रतीक्षा', 'हार मान चुके जाँच के काम']) expect(hi, words).toContain(words);
    for (const words of ['Needs a look', 'Pages this month', 'Waiting for the AI', 'Marking jobs that gave up']) expect(hi, words).not.toContain(words);
    // With nothing to look at the section is clear and teaches how a school starts.
    const quiet: MarkingData = { schools: [], schoolsNotListed: 0, jobs: { dead: 0, retrying: 0, listed: [] }, backlogAfterMinutes: 10 };
    const none = renderToStaticMarkup(h(LangProvider, { lang: 'en', children: h(MarkingMonitor, { data: quiet, lang: 'en', age: (s: number) => ageWords('en', s) }) }));
    expect(none).toContain('data-monitoring-state="clear"');
    expect(none.replace(/<[^>]+>/g, ' ')).toContain('No school has used AI marking yet');
    expect(todo(none)).toEqual([]);
  });

  it('is mounted on the monitoring page, and counts in its summary when it asks for a look', async () => {
    const m = await platform((c) => loadMonitoring(c));
    const page = (marking?: MarkingData) =>
      renderToStaticMarkup(h(LangProvider, { lang: 'en', children: h(MonitoringView, { data: m, invitations: [], applications: {}, lang: 'en', marking }) }));
    expect(page()).not.toContain('data-monitoring-section="marking"');
    const withIt = page(seen);
    expect(withIt).toContain('data-monitoring-section="marking" data-monitoring-state="look"');
    const looking = (html: string) => Number(/data-monitoring-summary="(\d+)"/.exec(html)?.[1]);
    expect(looking(withIt)).toBe(looking(page()) + 1);
    const clear: MarkingData = { ...seen, schools: [], jobs: { dead: 0, retrying: 0, listed: [] } };
    expect(looking(page(clear))).toBe(looking(page()));
  });

  it('a school’s own session cannot read it: the monitor’s tables are the platform’s', async () => {
    await expect(as(principal, (c) => loadMarkingMonitor(c))).rejects.toThrow(/permission denied/);
  });
});

describe('the rules and the screens import no AI and write nothing', () => {
  it('no model is called: the genome, the class view and the monitor read approved marks, queue nothing and send nothing', () => {
    const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => (statSync(path.join(dir, name)).isDirectory() ? files(path.join(dir, name)) : [path.join(dir, name)]));
    const ours = [
      ...files(path.join(SRC, 'lib/genome')),
      ...files(path.join(SRC, 'components/genome')),
      ...files(path.join(SRC, 'components/insights')),
      ...files(path.join(SRC, 'app/api/app/learning-genome')),
      ...files(path.join(SRC, 'app/(school)/app/learning-genome')),
      ...files(path.join(SRC, 'app/api/app/exams/papers/[paperId]/insights')),
      ...files(path.join(SRC, 'app/(school)/app/exams/papers/[paperId]/insights')),
      path.join(SRC, 'lib/marking/approved.ts'),
      path.join(SRC, 'lib/marking/insights.ts'),
      path.join(SRC, 'lib/control/marking-monitor.ts'),
      path.join(SRC, 'components/control/MarkingMonitor.tsx'),
    ];
    expect(ours.length).toBeGreaterThanOrEqual(14);
    for (const f of ours) {
      const text = readFileSync(f, 'utf8');
      expect(text, path.relative(SRC, f)).not.toMatch(/@\/lib\/(ai|copilot|parent-ai)\b|lib\/ai\/|anthropic|openai|configuredProvider|standInProvider/i);
      expect(text, path.relative(SRC, f)).not.toMatch(/\b(insert into|update \w+ set|delete from)\b|writeAuditLog|enqueue|communication_log|export (async )?function (POST|PUT|PATCH|DELETE)/i);
    }
    // The one rule on which scripts count, and on a question’s final mark, is in one place.
    expect(APPROVED_SHEET).toContain(`'approved'`);
    expect(finalMark({ marks: 3, ai_marks: 2 })).toBe(3);
    expect(finalMark({ marks: null, ai_marks: 2 })).toBe(2);
    expect(finalMark({ marks: null, ai_marks: null })).toBeNull();
  });
});
