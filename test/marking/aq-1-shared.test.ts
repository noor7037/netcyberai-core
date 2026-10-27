import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import type { MarkingQuestion } from '@/lib/contracts/marking';
import { makeExam } from '@/lib/exams/exams';
import { cleanCorrect, cleanOptions, cleanWrongMarks, markRange, marksByRule, ruleMarkable } from '@/lib/marking/answers';
import { firstProblem, formFromQuestion, sameAsSaved, toSaveBody } from '@/lib/marking/question-form';
import { changeSheet } from '@/lib/marking/review';
import { partTotals } from '@/lib/marking/rollup';
import { readSetup, saveSetup } from '@/lib/marking/setup';

// One question list for four ways of sitting (docs/36, C361): the rules for choice and number answers, and the shared
// columns on the whole schema as the app's own database role. The acceptance test: "options only on objective
// questions; a sheet without an upload only online; roll-up takes wrong marks off a part but never below 0." Every
// name and number is made up.

const choice = (over: Partial<MarkingQuestion> = {}): MarkingQuestion => ({
  questionId: 'q1',
  position: 1,
  label: '1',
  component: 'theory',
  maxMarks: 1,
  choiceGroup: null,
  unitId: null,
  kind: 'objective',
  prompt: 'Which is a prime number?',
  answerKey: 'C',
  steps: [],
  options: [{ key: 'A', text: '4' }, { key: 'B', text: '6' }, { key: 'C', text: '7' }, { key: 'D', text: '9' }],
  correct: { keys: ['C'] },
  difficulty: 'easy',
  section: 'A',
  ...over,
});
const number = (over: Partial<MarkingQuestion> = {}): MarkingQuestion =>
  choice({ questionId: 'q2', label: '2', kind: 'numerical', maxMarks: 2, options: [], correct: { value: 3.5, tolerance: 0.05 }, ...over });

describe('marking by rules (C361)', () => {
  it('a choice answer is right only with exactly the right keys; wrong takes the school’s wrong marks off; none is 0', () => {
    expect(marksByRule(choice(), { keys: ['C'] }, 0)).toEqual({ attempted: true, right: true, marks: 1 });
    expect(marksByRule(choice(), { keys: ['A'] }, 0)).toEqual({ attempted: true, right: false, marks: 0 });
    expect(marksByRule(choice(), { keys: ['A'] }, 0.5)).toEqual({ attempted: true, right: false, marks: -0.5 });
    expect(marksByRule(choice(), { keys: ['C', 'D'] }, 1)).toEqual({ attempted: true, right: false, marks: -1 });
    expect(marksByRule(choice(), { keys: [] }, 1)).toEqual({ attempted: false, right: false, marks: 0 });
    expect(marksByRule(choice(), null, 1)).toEqual({ attempted: false, right: false, marks: 0 });
    expect(marksByRule(choice({ correct: { keys: ['B', 'C'] } }), { keys: ['C', 'B'] }, 0)?.right).toBe(true);
  });
  it('a number answer is right within its tolerance', () => {
    expect(marksByRule(number(), { value: 3.54 }, 0)).toEqual({ attempted: true, right: true, marks: 2 });
    expect(marksByRule(number(), { value: 3.6 }, 0)?.right).toBe(false);
    expect(marksByRule(number({ correct: { value: 12, tolerance: 0 } }), { value: 12 }, 0)?.right).toBe(true);
  });
  it('rules mark only a keyed choice or number question; a teacher goes below nothing only there', () => {
    expect(ruleMarkable(choice({ correct: null }))).toBe(false);
    expect(ruleMarkable(choice({ kind: 'short', options: [] }))).toBe(false);
    expect(marksByRule(choice({ kind: 'long', options: [], correct: null }), { keys: ['A'] }, 1)).toBeNull();
    expect(markRange(choice(), 1)).toEqual({ min: -1, max: 1 });
    expect(markRange(choice(), 0)).toEqual({ min: 0, max: 1 });
    expect(markRange(choice({ kind: 'short', options: [], correct: null }), 1)).toEqual({ min: 0, max: 1 });
  });
  it('a part never goes below 0, and never above its maximum', () => {
    const qs = [choice(), choice({ questionId: 'q3', label: '3' })];
    expect(partTotals([{ key: 'theory', max: 2 }], qs, new Map([['q1', -1], ['q3', -1]]), {})).toEqual([{ component: 'theory', score: 0, max: 2 }]);
    expect(partTotals([{ key: 'theory', max: 2 }], qs, new Map([['q1', 1], ['q3', -0.5]]), {})).toEqual([{ component: 'theory', score: 0.5, max: 2 }]);
  });
  it('checks options and correct answers as the server does, in the browser too', () => {
    expect(cleanOptions([{ key: 'A', text: ' yes ' }, { key: 'B', text: 'no' }], 'objective')).toEqual({ ok: true, options: [{ key: 'A', text: 'yes' }, { key: 'B', text: 'no' }] });
    expect(cleanOptions([{ key: 'A', text: 'only one' }], 'objective').ok).toBe(false);
    expect(cleanOptions([{ key: 'B', text: 'x' }, { key: 'A', text: 'y' }], 'objective').ok).toBe(false);
    expect(cleanOptions([{ key: 'A', text: 'x' }, { key: 'B', text: 'y' }], 'short').ok).toBe(false);
    expect(cleanOptions([{ key: 'A', text: 'x' }, { key: 'B', text: '' }], 'objective').ok).toBe(false);
    const opts = choice().options;
    expect(cleanCorrect({ keys: ['D', 'A'] }, 'objective', opts)).toEqual({ ok: true, correct: { keys: ['A', 'D'] } });
    expect(cleanCorrect({ keys: ['E'] }, 'objective', opts).ok).toBe(false);
    expect(cleanCorrect({ keys: ['A', 'A'] }, 'objective', opts).ok).toBe(false);
    expect(cleanCorrect({ value: 4 }, 'numerical', [])).toEqual({ ok: true, correct: { value: 4, tolerance: 0 } });
    expect(cleanCorrect({ value: 4, tolerance: -1 }, 'numerical', []).ok).toBe(false);
    expect(cleanCorrect({ value: 4 }, 'long', []).ok).toBe(false);
    expect([cleanWrongMarks(null), cleanWrongMarks(0.5), cleanWrongMarks(0.25), cleanWrongMarks(11), cleanWrongMarks('1')]).toEqual([0, 0.5, null, null, null]);
  });
  it('the editor keeps a question’s options and correct answer as saved, and names a wrong one', () => {
    const saved = [choice()];
    const forms = saved.map(formFromQuestion);
    const same = { language: 'en', guidance: '' };
    expect(sameAsSaved(forms, {}, { questions: saved, choiceCounts: {} }, same, same)).toBe(true);
    expect(toSaveBody(forms, {}, { ...same, language: 'en', wrongMarks: 1 }).questions[0]).toMatchObject({ options: saved[0].options, correct: { keys: ['C'] }, difficulty: 'easy', section: 'A' });
    expect(firstProblem([{ ...forms[0], correct: { keys: ['F'] } }], ['theory'], {})).toEqual({ at: 0, field: 'correct' });
    expect(firstProblem([{ ...forms[0], section: 'Z' }], ['theory'], {})).toEqual({ at: 0, field: 'section' });
  });
});

const u = (n: number) => `a8000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const A = u(1);
const [PRINCIPAL, T_MATHS] = [u(11), u(12)];
const C7A = u(21);
const MATHS = u(31);
const SESSION = u(41);
const UNIT = u(51);
const [K1, K2] = [u(61), u(62)];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const tMaths: Who = { role: 'teacher', user: T_MATHS, school: A };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
const actor = (who: Who) => ({ schoolId: who.school, userId: who.user, role: who.role as never });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (who: Who, sql: string, params: unknown[] = []) => as<{ rows: any[] }>(who, (c) => c.query(sql, params));
const owner = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;

let paper = '';
const QUESTIONS = [
  { label: '1', component: 'theory', maxMarks: 2, kind: 'objective', section: 'a', difficulty: 'easy', prompt: 'Which is prime?', answerKey: 'C', steps: [], unitId: UNIT, options: choice().options, correct: { keys: ['C'] } },
  { label: '2', component: 'theory', maxMarks: 2, kind: 'numerical', section: 'A', prompt: 'Half of 7?', answerKey: '3.5', steps: [], unitId: UNIT, correct: { value: 3.5 } },
  { label: '3', component: 'theory', maxMarks: 16, kind: 'long', section: 'B', prompt: 'Explain primes.', answerKey: '', steps: [], unitId: UNIT },
];

describe('the shared columns on the whole schema (C361)', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, board, is_test_fixture) values ('${A}', 'School A', 'IN-HR', 'CBSE', true);
      insert into users (user_id, school_id, email, role, display_name, is_active) values
        ('${PRINCIPAL}', '${A}', 'principal@a.example', 'principal', 'Priya Principal', true), ('${T_MATHS}', '${A}', 'tara@a.example', 'teacher', 'Tara Maths', true);
      insert into teachers (teacher_id, school_id, user_id, name) values (gen_random_uuid(), '${A}', '${T_MATHS}', 'Tara Maths');
      insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values ('${SESSION}', '${A}', '2026-27', '2026-04-01', '2027-03-31', true);
      insert into classes (class_id, school_id, name, grade, section) values ('${C7A}', '${A}', '7', '7', 'A');
      insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Mathematics');
      insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) select '${A}', teacher_id, '${MATHS}', '${C7A}' from teachers where user_id = '${T_MATHS}';
      insert into students (student_id, school_id, admission_no, name, class_id, roll_no, status) values
        ('${K1}', '${A}', 'A-1', 'Meera Sharma', '${C7A}', '1', 'active'), ('${K2}', '${A}', 'A-2', 'Zoya Khan', '${C7A}', '2', 'active');
      insert into syllabus_units (unit_id, school_id, class_id, subject_id, position, chapter, topic) values ('${UNIT}', '${A}', '${C7A}', '${MATHS}', 1, 'Numbers', 'Primes');
      insert into school_module_entitlements (school_id, module_id, enabled, source) values ('${A}', 'exams', true, 'plan')
        on conflict (school_id, module_id) do update set enabled = true;
    `);
    await owner(`insert into grading_schemes (school_id, version, scheme, made_by) values ($1, 1, $2::jsonb, $3)`, [
      A,
      JSON.stringify({
        bands: [{ from: 0, to: 100, grade: 'A', meaning: null }],
        decimals: 0,
        passMark: 33,
        components: [{ key: 'theory', kind: 'theory', name: 'Theory', share: 100, passMark: null, parts: [] }],
        terms: [{ name: 'Term 1' }],
        layout: { components: true, total: true, percent: true, grade: true, attendance: false, remarks: false, coScholastic: false },
        coScholastic: null,
      }),
      PRINCIPAL,
    ]);
    const made = await as(principal, (c) =>
      makeExam(c, actor(principal), { name: 'Unit test', sessionId: SESSION, term: 'Term 1', papers: [{ classId: C7A, subjectId: MATHS, date: '2026-10-01', unitIds: [UNIT], maxima: { theory: 20 } }] })
    );
    if (!(made as { examId?: string }).examId) throw new Error(JSON.stringify(made));
    paper = (await owner(`select paper_id from exam_papers where exam_id = $1`, [(made as { examId: string }).examId]))[0].paper_id;
  }, 120_000);
  afterAll(async () => db?.stop());

  it('saves and reads back options, correct answers, sections and the wrong marks', async () => {
    const saved = await as(tMaths, (c) => saveSetup(c, actor(tMaths), paper, { setup: { language: 'en', guidance: '', choiceCounts: {}, wrongMarks: 0.5 }, questions: QUESTIONS }));
    expect(saved.ok).toBe(true);
    const screen = await as(tMaths, (c) => readSetup(c, actor(tMaths), paper));
    expect(screen?.setup.wrongMarks).toBe(0.5);
    expect(screen?.questions.map((q) => [q.label, q.section, q.options.length, q.correct])).toEqual([
      ['1', 'A', 4, { keys: ['C'] }],
      ['2', 'A', 0, { value: 3.5, tolerance: 0 }],
      ['3', 'B', 0, null],
    ]);
    const bad = await as(tMaths, (c) => saveSetup(c, actor(tMaths), paper, { setup: { language: 'en', guidance: '', choiceCounts: {} }, questions: [{ ...QUESTIONS[2], options: choice().options }] }));
    expect(bad).toMatchObject({ ok: false, reason: 'question', field: 'options' });
    const badWrong = await as(tMaths, (c) => saveSetup(c, actor(tMaths), paper, { setup: { language: 'en', guidance: '', choiceCounts: {}, wrongMarks: 0.25 }, questions: QUESTIONS }));
    expect(badWrong).toMatchObject({ ok: false, reason: 'setup' });
    // A screen that does not send the wrong marks keeps them.
    expect((await as(tMaths, (c) => saveSetup(c, actor(tMaths), paper, { setup: { language: 'en', guidance: 'kept', choiceCounts: {} }, questions: QUESTIONS }))).ok).toBe(true);
    expect((await as(tMaths, (c) => readSetup(c, actor(tMaths), paper)))?.setup).toMatchObject({ guidance: 'kept', wrongMarks: 0.5 });
  });

  it('the database refuses options on a written question, a correct key that is not a key, and a section past H', async () => {
    await expect(run(tMaths, `update marking_questions set options = $2 where paper_id = $1 and label = '3'`, [paper, JSON.stringify(choice().options)])).rejects.toThrow(/marking_questions_options/);
    await expect(run(tMaths, `update marking_questions set correct = '{"keys":["Z"]}' where paper_id = $1 and label = '1'`, [paper])).rejects.toThrow(/marking_questions_correct/);
    await expect(run(tMaths, `update marking_questions set correct = '{"value":"3.5"}' where paper_id = $1 and label = '2'`, [paper])).rejects.toThrow(/marking_questions_correct/);
    await expect(run(tMaths, `update marking_questions set section = 'J' where paper_id = $1 and label = '1'`, [paper])).rejects.toThrow(/marking_questions_section/);
  });

  it('only an online script has no upload; where a script came from and how a paper is sat stay fixed', async () => {
    await expect(run(tMaths, `insert into marking_sheets (school_id, paper_id, source) values ($1, $2, 'scan')`, [A, paper])).rejects.toThrow(/marking_sheets_upload/);
    const upload = (await run(tMaths, `insert into marking_uploads (school_id, paper_id, mode, kind, created_by) values ($1, $2, 'by_child', 'bubble', $3) returning upload_id`, [A, paper, T_MATHS])).rows[0].upload_id;
    await expect(run(tMaths, `insert into marking_sheets (school_id, paper_id, upload_id, source) values ($1, $2, $3, 'online')`, [A, paper, upload])).rejects.toThrow(/marking_sheets_upload/);
    const online = (await run(tMaths, `insert into marking_sheets (school_id, paper_id, source, student_id, matched_by) values ($1, $2, 'online', $3, 'online') returning sheet_id`, [A, paper, K1])).rows[0].sheet_id;
    const bubble = (await run(tMaths, `insert into marking_sheets (school_id, paper_id, upload_id, source, student_id, matched_by) values ($1, $2, $3, 'bubble', $4, 'bubble') returning sheet_id`, [A, paper, upload, K2])).rows[0].sheet_id;
    await expect(run(tMaths, `update marking_sheets set source = 'scan' where sheet_id = $1`, [bubble])).rejects.toThrow(/where a script came from never changes/);
    await expect(run(principal, `update exam_papers set sitting = 'bubble' where paper_id = $1`, [paper])).rejects.toThrow(/fixed once a script of it exists/);
    // A rule-marked question may hold a mark below nothing, at most ten below; a teacher gives one only where the school
    // takes marks off.
    await run(tMaths, `update marking_sheets set state = 'marked' where sheet_id = $1`, [online]);
    const [q1, q3] = (await owner(`select question_id from marking_questions where paper_id = $1 and label in ('1', '3') order by label`, [paper])).map((r: { question_id: string }) => r.question_id);
    expect(await as(tMaths, (c) => changeSheet(c, actor(tMaths), online, { questions: [{ questionId: q1, marks: -0.5 }] }))).toMatchObject({ ok: true });
    expect(await as(tMaths, (c) => changeSheet(c, actor(tMaths), online, { questions: [{ questionId: q1, marks: -1 }] }))).toMatchObject({ ok: false, reason: 'marks' });
    expect(await as(tMaths, (c) => changeSheet(c, actor(tMaths), online, { questions: [{ questionId: q3, marks: -0.5 }] }))).toMatchObject({ ok: false, reason: 'marks' });
    await expect(run(tMaths, `update marking_marks set ai_marks = -10.5 where sheet_id = $1`, [online])).rejects.toThrow(/marking_marks_ai/);
  });

  it('a paper with no script changes how it is sat', async () => {
    await owner(`delete from marking_marks where paper_id = $1`, [paper]);
    await owner(`delete from marking_sheets where paper_id = $1`, [paper]);
    await run(principal, `update exam_papers set sitting = 'online' where paper_id = $1`, [paper]);
    expect((await owner(`select sitting from exam_papers where paper_id = $1`, [paper]))[0].sitting).toBe('online');
    await expect(run(principal, `update exam_papers set sitting = 'oral' where paper_id = $1`, [paper])).rejects.toThrow(/exam_papers_sitting/);
  });
});
