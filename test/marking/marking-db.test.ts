import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { schoolJobContextStatements } from '@/lib/auth/db';
import type { PageReading } from '@/lib/contracts/marking';
import { makeExam } from '@/lib/exams/exams';
import { publishClass, reopenClass } from '@/lib/exams/publish';
import { examCandidates, setNumbering, undoWithdrawal, withdrawCandidate } from '@/lib/marking/candidates';
import { aiMarkingState } from '@/lib/marking/context';
import { approveSheets, changeSheet, chooseChild, markAbsent, markingOverview, setAside, sheetDetail } from '@/lib/marking/review';
import { readSetup, saveSetup } from '@/lib/marking/setup';
import { formSheets, recordPageReading, recordSheetResult, takeSheetForMarking } from '@/lib/marking/store';

// AI answer-sheet marking on the whole schema, as the app's own database role (docs/35, C347, C348, C351). The
// acceptance test: "a teacher of another class reads nothing; a job's session cannot write marks; approval writes the
// rolled-up marks; a published class refuses approval; candidates count from rows; a late joiner gets the next
// number; a guardian sees only their own child's approved script of a publication in force." Every name and number is
// made up.

const u = (n: number) => `a7000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B] = [u(1), u(2)];
const [PRINCIPAL, T_MATHS, T_OTHER, ACCOUNTANT, B_PRINCIPAL] = [u(11), u(12), u(13), u(14), u(15)];
const [C7A, C7B, CB] = [u(21), u(22), u(23)];
const [MATHS, B_MATHS] = [u(31), u(32)];
const SESSION = u(41);
const [UNIT_FR, UNIT_DEC, UNIT_7B] = [u(51), u(52), u(53)];
const [K1, K2, K3, LATE, K7B, BK] = [u(61), u(62), u(63), u(64), u(65), u(66)];
const PARENT_K1 = u(71);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const tMaths: Who = { role: 'teacher', user: T_MATHS, school: A }; // teaches Mathematics in 7-A
const tOther: Who = { role: 'teacher', user: T_OTHER, school: A }; // teaches Mathematics in 7-B only
const accountant: Who = { role: 'accountant', user: ACCOUNTANT, school: A };
const bPrincipal: Who = { role: 'principal', user: B_PRINCIPAL, school: B };
const guardian: Who = { role: 'parent', user: PARENT_K1, school: A };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// The school's marking job, exactly as production opens it (withSchoolJobContext's statements).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asJob = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    for (const s of schoolJobContextStatements(A, 'marking.pipeline')) await tx.query(s.sql, s.params);
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asPlatform = (fn: (client: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const actor = (who: Who) => ({ schoolId: who.school, userId: who.user, role: who.role as never });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (who: Who, sql: string, params: unknown[] = []) => as<{ rows: any[]; rowCount: number }>(who, (c) => c.query(sql, params));
const owner = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;

let examId = '';
let paperA = '';
let paperB = '';
const QUESTIONS = [
  { label: '1', component: 'theory', maxMarks: 4, unitId: UNIT_FR, kind: 'short', prompt: 'Add 1/2 and 1/4.', answerKey: '3/4', steps: [{ step: 'Common denominator', marks: 2 }, { step: 'Sum', marks: 2 }] },
  { label: '2', component: 'theory', maxMarks: 6, unitId: UNIT_DEC, kind: 'numerical', prompt: 'Write 0.7 as a fraction.', answerKey: '7/10', steps: [] },
  { label: '3(a)', component: 'theory', maxMarks: 10, choiceGroup: 'A', unitId: UNIT_FR, kind: 'long', prompt: 'Fractions on a number line.', answerKey: '', steps: [] },
  { label: '3(b)', component: 'theory', maxMarks: 10, choiceGroup: 'A', unitId: UNIT_DEC, kind: 'long', prompt: 'Decimals in money.', answerKey: '', steps: [] },
];

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, board, is_test_fixture) values ('${A}', 'School A', 'IN-HR', 'CBSE', true), ('${B}', 'School B', 'IN-DL', 'CBSE', true);
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'principal@a.example', 'principal', 'Priya Principal', true), ('${T_MATHS}', '${A}', 'tara@a.example', 'teacher', 'Tara Maths', true),
      ('${T_OTHER}', '${A}', 'omar@a.example', 'teacher', 'Omar Other', true), ('${ACCOUNTANT}', '${A}', 'anil@a.example', 'accountant', 'Anil Accountant', true),
      ('${B_PRINCIPAL}', '${B}', 'principal@b.example', 'principal', 'Bela Principal', true);
    insert into teachers (teacher_id, school_id, user_id, name) values (gen_random_uuid(), '${A}', '${T_MATHS}', 'Tara Maths'), (gen_random_uuid(), '${A}', '${T_OTHER}', 'Omar Other');
    insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values ('${SESSION}', '${A}', '2026-27', '2026-04-01', '2027-03-31', true);
    insert into classes (class_id, school_id, name, grade, section) values ('${C7A}', '${A}', '7', '7', 'A'), ('${C7B}', '${A}', '7', '7', 'B'), ('${CB}', '${B}', '7', '7', 'A');
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Mathematics'), ('${B_MATHS}', '${B}', 'Mathematics');
    insert into teacher_subjects (school_id, teacher_id, subject_id, class_id)
      select '${A}', t.teacher_id, x.subject_id, x.class_id from teachers t join (values ('${T_MATHS}'::uuid, '${MATHS}'::uuid, '${C7A}'::uuid), ('${T_OTHER}', '${MATHS}', '${C7B}')) x(user_id, subject_id, class_id) on x.user_id = t.user_id;
    insert into students (student_id, school_id, admission_no, name, class_id, roll_no, status) values
      ('${K1}', '${A}', 'A-1', 'Meera Sharma', '${C7A}', '1', 'active'), ('${K2}', '${A}', 'A-2', 'Zoya Khan', '${C7A}', '2', 'active'),
      ('${K3}', '${A}', 'A-3', 'Dev Patel', '${C7A}', '3', 'active'), ('${K7B}', '${A}', 'B-1', 'Kabir Rao', '${C7B}', '1', 'active'),
      ('${BK}', '${B}', 'Z-1', 'Rohan Das', '${CB}', '1', 'active');
    insert into syllabus_units (unit_id, school_id, class_id, subject_id, position, chapter, topic) values
      ('${UNIT_FR}', '${A}', '${C7A}', '${MATHS}', 1, 'Fractions', 'Adding fractions'), ('${UNIT_DEC}', '${A}', '${C7A}', '${MATHS}', 2, 'Decimals', 'Tenths'),
      ('${UNIT_7B}', '${A}', '${C7B}', '${MATHS}', 1, 'Fractions', 'Adding fractions');
    insert into school_module_entitlements (school_id, module_id, enabled, source) select s, 'exams', true, 'plan' from unnest(array['${A}', '${B}']::uuid[]) s
      on conflict (school_id, module_id) do update set enabled = true;
    insert into parents (parent_id, school_id, name, phone) values ('${PARENT_K1}', '${A}', 'Asha Sharma', '+919800000001');
    insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${PARENT_K1}', '${K1}');
  `);
  await owner(`insert into grading_schemes (school_id, version, scheme, made_by) values ($1, 1, $2::jsonb, $3)`, [
    A,
    JSON.stringify({
      bands: [{ from: 50, to: 100, grade: 'A', meaning: null }, { from: 0, to: 49, grade: 'B', meaning: null }],
      decimals: 0,
      passMark: 33,
      components: [
        { key: 'theory', kind: 'theory', name: 'Theory', share: 80, passMark: null, parts: [] },
        { key: 'internal', kind: 'internal', name: 'Internal', share: 20, passMark: null, parts: [] },
      ],
      terms: [{ name: 'Term 1' }],
      layout: { components: true, total: true, percent: true, grade: true, attendance: false, remarks: false, coScholastic: false },
      coScholastic: null,
    }),
    PRINCIPAL,
  ]);
  const made = await as(principal, (c) =>
    makeExam(c, actor(principal), {
      name: 'Half-yearly',
      sessionId: SESSION,
      term: 'Term 1',
      papers: [
        { classId: C7A, subjectId: MATHS, date: '2026-10-01', unitIds: [UNIT_FR, UNIT_DEC], maxima: { theory: 20, internal: 5 } },
        { classId: C7B, subjectId: MATHS, date: '2026-10-01', unitIds: [UNIT_7B], maxima: { theory: 20 } },
      ],
    })
  );
  examId = (made as { examId: string }).examId;
  const papers = await owner(`select paper_id, class_id from exam_papers where exam_id = $1`, [examId]);
  paperA = papers.find((p: { class_id: string }) => p.class_id === C7A).paper_id;
  paperB = papers.find((p: { class_id: string }) => p.class_id === C7B).paper_id;
}, 120_000);
afterAll(async () => db?.stop());

describe('candidates and exam numbers (C348)', () => {
  it('counts candidates from the rows, and numbers them in class and roll order once the office turns numbers on', async () => {
    expect(await as(principal, (c) => setNumbering(c, actor(principal), examId, 'seat', 'hy'))).toEqual({ ok: true });
    const seats = await owner(`select student_id, seat_no from exam_seat_numbers where exam_id = $1 order by seq`, [examId]);
    expect(seats.map((s: { seat_no: string }) => s.seat_no)).toEqual(['HY0001', 'HY0002', 'HY0003', 'HY0004']);
    expect(seats.map((s: { student_id: string }) => s.student_id)).toEqual([K1, K2, K3, K7B]);
    const view = await as(principal, (c) => examCandidates(c, actor(principal), examId));
    expect(view?.classes.map((k) => [k.className, k.onRoll, k.candidates, k.numbered])).toEqual([['7-A', 3, 3, 3], ['7-B', 1, 1, 1]]);
  });

  it('a child who joins later gets the next number at once; a withdrawn child keeps theirs and stops counting', async () => {
    await owner(`insert into students (student_id, school_id, admission_no, name, class_id, roll_no, status) values ($1, $2, 'A-4', 'Late Joiner', $3, '4', 'active')`, [LATE, A, C7A]);
    expect((await owner(`select seat_no from exam_seat_numbers where exam_id = $1 and student_id = $2`, [examId, LATE]))[0].seat_no).toBe('HY0005');
    expect(await as(principal, (c) => withdrawCandidate(c, actor(principal), examId, LATE, 'Long medical leave'))).toEqual({ ok: true });
    const view = await as(principal, (c) => examCandidates(c, actor(principal), examId));
    expect(view?.classes[0]).toMatchObject({ onRoll: 4, withdrawn: 1, candidates: 3, numbered: 3 });
    expect(view?.withdrawals.map((w) => w.name)).toEqual(['Late Joiner']);
    // The prefix is fixed once numbers exist; a teacher withdraws no one.
    expect(await as(principal, (c) => setNumbering(c, actor(principal), examId, 'seat', 'X'))).toEqual({ ok: false, reason: 'fixed' });
    expect(await as(tMaths, (c) => withdrawCandidate(c, actor(tMaths), examId, K2, 'No reason at all'))).toEqual({ ok: false, reason: 'not_allowed' });
    await expect(run(tMaths, `insert into exam_withdrawals (school_id, exam_id, student_id, reason, withdrawn_by) values ($1, $2, $3, 'test', $4)`, [A, examId, K2, T_MATHS])).rejects.toThrow(/row-level security/);
    await expect(run(principal, `insert into exam_seat_numbers (school_id, exam_id, student_id, seq, seat_no) values ($1, $2, $3, 99, 'HY0099')`, [A, examId, K2])).rejects.toThrow(/permission denied/);
    expect(await as(principal, (c) => undoWithdrawal(c, actor(principal), examId, LATE))).toEqual({ ok: true });
    expect((await owner(`select count(*)::int as n from exam_seat_numbers where exam_id = $1 and student_id = $2`, [examId, LATE]))[0].n).toBe(1);
    // Back out of the class for the rest of the test (the paper's roll is three).
    await owner(`update students set status = 'transferred' where student_id = $1`, [LATE]);
  });
});

describe('the questions (C347)', () => {
  it('the subject teacher writes the questions; another class’s teacher and the accountant cannot read or write them', async () => {
    const saved = await as(tMaths, (c) => saveSetup(c, actor(tMaths), paperA, { setup: { language: 'en', guidance: 'Method marks count.', choiceCounts: { A: 1 } }, questions: QUESTIONS }));
    expect(saved.ok).toBe(true);
    const screen = await as(tMaths, (c) => readSetup(c, actor(tMaths), paperA));
    expect(screen?.questions.map((q) => [q.label, q.maxMarks, q.choiceGroup])).toEqual([['1', 4, null], ['2', 6, null], ['3(a)', 10, 'A'], ['3(b)', 10, 'A']]);
    // Theory adds up (4 + 6 + the best one of two tens); Internal has no question, so it stays typed by hand.
    expect(screen?.problems).toEqual([]);
    expect(await as(tOther, (c) => readSetup(c, actor(tOther), paperA))).toBeNull();
    expect(await as(accountant, (c) => readSetup(c, actor(accountant), paperA))).toBeNull();
    expect((await run(tOther, `select count(*)::int as n from marking_questions`)).rows[0].n).toBe(0);
    // Refused before the row rules even look: the paper is not one this teacher can see.
    await expect(
      run(tOther, `insert into marking_questions (school_id, paper_id, position, label, component, max_marks, updated_by) values ($1, $2, 9, '9', 'theory', 1, $3)`, [A, paperA, T_OTHER])
    ).rejects.toThrow(/row-level security|counts to one of its paper/);
    expect((await run(bPrincipal, `select count(*)::int as n from marking_questions`)).rows[0].n).toBe(0);
  });

  it('the database refuses a topic of another class and steps worth more than the question', async () => {
    await expect(run(tMaths, `update marking_questions set unit_id = $2 where paper_id = $1 and label = '1'`, [paperA, UNIT_7B])).rejects.toThrow(/unit of its paper's class and subject/);
    await expect(run(tMaths, `update marking_questions set steps = '[{"step":"All","marks":9}]' where paper_id = $1 and label = '1'`, [paperA])).rejects.toThrow(/steps give at most its marks/);
  });
});

let upload = '';
const pages: Record<string, string> = {};
const read = (over: Partial<PageReading>): PageReading => ({ firstPage: false, name: null, rollNo: null, seatNo: null, classSection: '7-A', pageNumber: null, blank: false, legible: true, ...over });

describe('scripts: read, made, matched and marked by the school’s job (C347)', () => {
  it('a teacher uploads a combined scan; the job reads it and makes one script per child, matched to the roll', async () => {
    upload = (await run(tMaths, `insert into marking_uploads (school_id, paper_id, mode, created_by) values ($1, $2, 'combined', $3) returning upload_id`, [A, paperA, T_MATHS])).rows[0].upload_id;
    const add = async (name: string, pageNo: number) => {
      const id = (await owner(`select gen_random_uuid() as id`))[0].id as string;
      pages[name] = id;
      await run(tMaths, `insert into marking_pages (school_id, page_id, upload_id, paper_id, file_no, page_no, storage_key, sha256, bytes, width, height) values ($1, $2, $3, $4, 1, $5, $6, $7, 1000, 1400, 2000)`, [
        A,
        id,
        upload,
        paperA,
        pageNo,
        `${A}/marking/${paperA}/${id}.jpg`,
        createHash('sha256').update(name).digest('hex'),
      ]);
    };
    for (const [i, n] of ['m1', 'm2', 'z1', 'd1', 'z2', 'x1'].entries()) await add(n, i + 1);
    await run(tMaths, `update marking_uploads set closed_at = now() where upload_id = $1`, [upload]);
    // Pages still to read: nothing is made yet.
    expect(await asJob((c) => formSheets(c, A, upload))).toEqual({ formed: 0, toMark: [], waiting: true });
    await asJob(async (c) => {
      await recordPageReading(c, A, pages.m1, read({ firstPage: true, name: 'Meera Sharma', rollNo: '1', seatNo: 'HY0001', pageNumber: 1 }));
      await recordPageReading(c, A, pages.m2, read({ pageNumber: 2 }));
      await recordPageReading(c, A, pages.z1, read({ firstPage: true, name: 'Zoya Khan', rollNo: '2', pageNumber: 1 }));
      await recordPageReading(c, A, pages.d1, read({ firstPage: true, name: 'Dev Patel', rollNo: '3', pageNumber: 1 }));
      await recordPageReading(c, A, pages.z2, read({ firstPage: true, name: 'Zoya Kahn', rollNo: '2', pageNumber: 1 }));
      await recordPageReading(c, A, pages.x1, read({ blank: true }));
    });
    const formed = await asJob((c) => formSheets(c, A, upload));
    expect(formed.formed).toBe(4);
    const sheets = await owner(`select sheet_id, student_id, matched_by, state, flags from marking_sheets where upload_id = $1 order by created_at, sheet_id`, [upload]);
    expect(sheets.find((s: { student_id: string }) => s.student_id === K1)).toMatchObject({ matched_by: 'seat', state: 'waiting', flags: [] });
    expect(sheets.find((s: { student_id: string }) => s.student_id === K3)).toMatchObject({ matched_by: 'roll', state: 'waiting', flags: [] });
    // The blank page stays with the script before it and is never sent to the AI.
    expect((await owner(`select count(*)::int as n from marking_pages where sheet_id is not null and upload_id = $1`, [upload]))[0].n).toBe(6);
    // Two scripts read as Zoya both wait for the teacher.
    expect(sheets.filter((s: { flags: string[] }) => s.flags.includes('two_scripts')).length).toBe(2);
    // Asked again, nothing is made twice.
    expect((await asJob((c) => formSheets(c, A, upload))).formed).toBe(0);
  });

  it('the job marks a script; a mark above the question or for no question of the paper is not kept, and flags it', async () => {
    const meera = (await owner(`select sheet_id from marking_sheets where student_id = $1`, [K1]))[0].sheet_id as string;
    const qs = await owner(`select question_id, label from marking_questions where paper_id = $1`, [paperA]);
    const id = (label: string) => qs.find((q: { label: string }) => q.label === label).question_id as string;
    const taken = await asJob((c) => takeSheetForMarking(c, A, meera));
    expect(taken?.pages.map((p) => p.pageId)).toEqual([pages.m1, pages.m2]);
    expect(taken?.questions).toHaveLength(4);
    const result = {
      questions: [
        { questionId: id('1'), attempted: true, marks: 3, steps: [{ step: 'Common denominator', awarded: 2, note: null }], note: 'Check the last step.', reason: 'Sum wrong.', errorType: 'calculation' as const, confidence: 0.9, pageId: pages.m1, yFrom: 0.1, yTo: 0.3 },
        { questionId: id('2'), attempted: true, marks: 9, steps: [], note: null, reason: null, errorType: 'none' as const, confidence: 0.95, pageId: pages.m1, yFrom: 0.4, yTo: 0.5 },
        { questionId: id('3(a)'), attempted: true, marks: 7, steps: [], note: null, reason: null, errorType: 'incomplete' as const, confidence: 0.6, pageId: pages.m2, yFrom: 0.1, yTo: 0.6 },
        { questionId: id('3(b)'), attempted: false, marks: 4, steps: [], note: null, reason: null, errorType: null, confidence: 0.99, pageId: null, yFrom: null, yTo: null },
        { questionId: u(999), attempted: true, marks: 5, steps: [], note: null, reason: null, errorType: null, confidence: 1, pageId: null, yFrom: null, yTo: null },
      ],
      strengths: 'Neat working.',
      improve: 'Check sums.',
      practice: [{ unitId: UNIT_FR, text: 'Five sums adding fractions.' }, { unitId: UNIT_7B, text: 'Another class’s topic.' }],
    };
    const recorded = await asJob((c) => recordSheetResult(c, A, meera, result, { provider: 'stand-in', model: 'test', promptVersion: 'v1' }));
    expect(recorded?.flags.sort()).toEqual(['not_all_read', 'unsure']);
    const kept = await owner(`select q.label, m.ai_marks::text, m.attempted, m.error_type from marking_marks m join marking_questions q using (school_id, question_id) where m.sheet_id = $1 order by q.position`, [meera]);
    expect(kept).toEqual([
      { label: '1', ai_marks: '3.0', attempted: true, error_type: 'calculation' },
      { label: '2', ai_marks: null, attempted: true, error_type: 'none' },
      { label: '3(a)', ai_marks: '7.0', attempted: true, error_type: 'incomplete' },
      { label: '3(b)', ai_marks: '0.0', attempted: false, error_type: 'not_attempted' },
    ]);
    expect((await owner(`select practice from marking_sheets where sheet_id = $1`, [meera]))[0].practice).toEqual([
      { unitId: UNIT_FR, text: 'Five sums adding fractions.' },
      { unitId: null, text: 'Another class’s topic.' },
    ]);
  });

  it('only the people who mark queue marking jobs (review of #317)', async () => {
    const queue = (who: Who) => run(who, `insert into jobs (type, payload, idempotency_key, school_id) values ('marking.mark', '{}', $1, $2)`, [`t:${who.user}`, A]);
    await expect(queue(accountant)).rejects.toThrow(/row-level security/);
    await expect(queue(tMaths)).resolves.toMatchObject({ rowCount: 1 });
    await owner(`delete from jobs where idempotency_key like 't:%'`);
  });

  it('AI never writes a mark: the job’s session is refused on marks, on a teacher’s mark and on approval', async () => {
    await expect(asJob((c) => c.query(`insert into marks (school_id, exam_id, subject_id, paper_id, component, student_id, kind, score, max_score, entered_by) values ($1, $2, $3, $4, 'theory', $5, 'score', 5, 0, $6)`, [A, examId, MATHS, paperA, K1, '00000000-0000-0000-0000-000000000000']))).rejects.toThrow(/row-level security/);
    const meera = (await owner(`select sheet_id from marking_sheets where student_id = $1`, [K1]))[0].sheet_id as string;
    await expect(asJob((c) => c.query(`update marking_marks set marks = 1 where sheet_id = $1`, [meera]))).rejects.toThrow(/a teacher's mark is a person's/);
    await expect(asJob((c) => c.query(`update marking_sheets set state = 'approved' where sheet_id = $1`, [meera]))).rejects.toThrow(/approved by a person/);
  });
});

describe('review and approval (C347)', () => {
  it('another class’s teacher sees no script; the subject teacher sees each with its pages and the AI’s marks', async () => {
    expect((await run(tOther, `select count(*)::int as n from marking_sheets`)).rows[0].n).toBe(0);
    expect((await run(tOther, `select count(*)::int as n from marking_pages`)).rows[0].n).toBe(0);
    const view = await as(tMaths, (c) => markingOverview(c, actor(tMaths), paperA));
    expect(view?.sheets.map((s) => [s.student?.name ?? null, s.state])).toEqual([['Meera Sharma', 'marked'], ['Dev Patel', 'waiting'], [null, 'waiting'], [null, 'waiting']]);
    expect(view?.withoutScript.map((c) => c.name)).toEqual(['Zoya Khan']);
    expect(view?.pages).toMatchObject({ read: 5, blank: 1 });
    expect(view?.ai).toMatchObject({ on: false, why: 'no_limit' });
    const meera = view!.sheets[0].sheetId;
    const detail = await as(tMaths, (c) => sheetDetail(c, actor(tMaths), meera));
    expect(detail?.pages.map((p) => p.url)).toEqual([`/api/app/marking/pages/${pages.m1}`, `/api/app/marking/pages/${pages.m2}`]);
    expect(detail?.questions.find((q) => q.label === '3(b)')).toMatchObject({ counted: false, final: 0 });
    expect(detail?.totals).toEqual([{ component: 'theory', name: 'Theory', score: 10, max: 20 }]);
  });

  it('a script with a question the AI gave nothing for is not approved until the teacher gives it a mark', async () => {
    const meera = (await owner(`select sheet_id from marking_sheets where student_id = $1`, [K1]))[0].sheet_id as string;
    expect(await as(tMaths, (c) => approveSheets(c, actor(tMaths), paperA, [meera]))).toEqual({ ok: false, reason: 'flagged', sheetId: meera });
    const q2 = (await owner(`select question_id from marking_questions where paper_id = $1 and label = '2'`, [paperA]))[0].question_id;
    expect(await as(tMaths, (c) => changeSheet(c, actor(tMaths), meera, { questions: [{ questionId: q2, marks: 5.5, note: 'Right fraction, not simplified.' }] }))).toEqual({ ok: true });
    expect(await as(tMaths, (c) => changeSheet(c, actor(tMaths), meera, { questions: [{ questionId: q2, marks: 7 }] }))).toEqual({ ok: false, reason: 'marks', questionId: q2 });
    const changed = await owner(`select marks::text, changed_by from marking_marks where sheet_id = $1 and question_id = $2`, [meera, q2]);
    expect(changed).toEqual([{ marks: '5.5', changed_by: T_MATHS }]);
    // "Approve every script with no flag" leaves a flagged one (unsure) for the teacher to approve on its own.
    expect(await as(tMaths, (c) => approveSheets(c, actor(tMaths), paperA, 'unflagged'))).toMatchObject({ ok: true, approved: 0 });
    expect(await as(tMaths, (c) => approveSheets(c, actor(tMaths), paperA, [meera]))).toMatchObject({ ok: true, approved: 1 });
    // Theory: 3 + 5.5 + the better of 7 and 0 = 15.5. Internal is left for the teacher to type.
    expect(await owner(`select component, kind, score::text, entered_by from marks where paper_id = $1 and student_id = $2`, [paperA, K1])).toEqual([
      { component: 'theory', kind: 'score', score: '15.5', entered_by: T_MATHS },
    ]);
    expect((await owner(`select approved_by from marking_sheets where sheet_id = $1`, [meera]))[0].approved_by).toBe(T_MATHS);
  });

  it('the teacher settles the two scripts read as Zoya: one is hers, the other a second copy set aside', async () => {
    const two = await owner(`select sheet_id from marking_sheets where upload_id = $1 and student_id is null order by created_at, sheet_id`, [upload]);
    expect(two).toHaveLength(2);
    expect(await as(tMaths, (c) => chooseChild(c, actor(tMaths), two[0].sheet_id, K2))).toEqual({ ok: true });
    expect(await as(tMaths, (c) => chooseChild(c, actor(tMaths), two[1].sheet_id, K2))).toEqual({ ok: false, reason: 'taken' });
    expect(await as(tMaths, (c) => chooseChild(c, actor(tMaths), two[1].sheet_id, K3))).toEqual({ ok: false, reason: 'taken' });
    expect(await as(tMaths, (c) => setAside(c, actor(tMaths), two[1].sheet_id, true))).toEqual({ ok: true });
    // A child with a script is not marked absent; another class's teacher reaches no script at all.
    expect(await as(tMaths, (c) => markAbsent(c, actor(tMaths), paperA, [K3]))).toEqual({ ok: false, reason: 'child' });
    expect(await as(tOther, (c) => chooseChild(c, actor(tOther), two[0].sheet_id, null))).toEqual({ ok: false, reason: 'not_found' });
    const view = await as(tMaths, (c) => markingOverview(c, actor(tMaths), paperA));
    expect(view?.withoutScript).toEqual([]);
  });
});

describe('publishing, families and the report link (C351)', () => {
  it('a guardian reads their own child’s coming papers and exam number, and nothing of another child', async () => {
    await owner(`update exam_papers set paper_date = (now() at time zone 'Asia/Kolkata')::date + 2 where paper_id = $1`, [paperA]);
    const seen = (await run(guardian, `select student_id, exam_name, subject_name, seat_no from public.guardian_exam_schedule()`)).rows;
    expect(seen).toEqual([{ student_id: K1, exam_name: 'Half-yearly', subject_name: 'Mathematics', seat_no: 'HY0001' }]);
    expect((await run(tMaths, `select count(*)::int as n from public.guardian_exam_schedule()`)).rows[0].n).toBe(0);
  });

  it('a published class refuses every change and approval; a guardian then sees only their own child’s approved script', async () => {
    // Enter the rest so the class can be published: Internal for all three, and Theory for the two still waiting.
    const { saveMarks } = await import('@/lib/exams/marks');
    const entries = [K1, K2, K3].map((s) => ({ studentId: s, component: 'internal', kind: 'score', score: 4 })).concat([K2, K3].map((s) => ({ studentId: s, component: 'theory', kind: 'score', score: 12 })));
    expect((await as(tMaths, (c) => saveMarks(c, actor(tMaths), paperA, entries))).ok).toBe(true);
    const meera = (await owner(`select sheet_id from marking_sheets where student_id = $1`, [K1]))[0].sheet_id as string;
    const q1 = (await owner(`select question_id from marking_questions where paper_id = $1 and label = '1'`, [paperA]))[0].question_id;
    // Review of #317: a script changed after approval keeps the class from being published until it is approved again,
    // and a job's session cannot change an approved script at all.
    await expect(asJob((c) => c.query(`update marking_sheets set strengths = 'by a job' where sheet_id = $1`, [meera]))).rejects.toThrow(/changed by a person only/);
    await expect(asJob((c) => c.query(`update marking_marks set ai_marks = 1 where sheet_id = $1 and question_id = $2`, [meera, q1]))).rejects.toThrow(/changed by a person only/);
    expect(await as(tMaths, (c) => changeSheet(c, actor(tMaths), meera, { strengths: 'Careful working throughout.' }))).toEqual({ ok: true });
    expect((await owner(`select state, flags from marking_sheets where sheet_id = $1`, [meera]))[0]).toEqual({ state: 'approved', flags: ['unsure', 'changed'] });
    expect(await as(principal, (c) => publishClass(c, actor(principal), examId, C7A))).toEqual({ ok: false, reason: 'scripts_changed' });
    expect(await as(tMaths, (c) => approveSheets(c, actor(tMaths), paperA, [meera]))).toMatchObject({ ok: true, approved: 1 });
    expect((await owner(`select flags, match_note from marking_sheets where sheet_id = $1`, [meera]))[0]).toMatchObject({ flags: ['unsure'], match_note: { read: { rollNo: '1' } } });
    expect(await as(principal, (c) => publishClass(c, actor(principal), examId, C7A))).toMatchObject({ ok: true });
    expect(await as(tMaths, (c) => changeSheet(c, actor(tMaths), meera, { questions: [{ questionId: q1, marks: 4 }] }))).toEqual({ ok: false, reason: 'closed' });
    await expect(run(tMaths, `update marking_marks set marks = 4 where sheet_id = $1 and question_id = $2`, [meera, q1])).resolves.toMatchObject({ rowCount: 0 });

    const seen = await as(guardian, async (c) => ({
      sheets: (await c.query(`select sheet_id, student_id from marking_sheets`)).rows,
      marks: (await c.query(`select count(*)::int as n from marking_marks`)).rows[0].n,
      pages: (await c.query(`select page_id from marking_pages order by sheet_position`)).rows.map((r: { page_id: string }) => r.page_id),
      questions: (await c.query(`select count(*)::int as n from marking_questions`)).rows[0].n,
      uploads: (await c.query(`select count(*)::int as n from marking_uploads`)).rows[0].n,
      seats: (await c.query(`select student_id from exam_seat_numbers`)).rows.map((r: { student_id: string }) => r.student_id),
    }));
    expect(seen).toEqual({ sheets: [{ sheet_id: meera, student_id: K1 }], marks: 4, pages: [pages.m1, pages.m2], questions: 4, uploads: 0, seats: [K1] });
    // A parent writes nothing.
    await expect(as(guardian, (c) => c.query(`update marking_sheets set strengths = 'x' where sheet_id = $1`, [meera]))).resolves.toMatchObject({ rowCount: 0 });
  });

  it('the school’s switch hides the scripts from families; reopening hides them too', async () => {
    await owner(`insert into school_settings (school_id, module_id, schema_version, setting_values) values ($1, 'exams', 1, '{"families_see_scripts": false}')`, [A]);
    expect((await run(guardian, `select count(*)::int as n from marking_sheets`)).rows[0].n).toBe(0);
    await owner(`delete from school_settings where school_id = $1 and module_id = 'exams'`, [A]);
    expect((await run(guardian, `select count(*)::int as n from marking_sheets`)).rows[0].n).toBe(1);
  });

  it('a report link opens one child’s published result, with the script only while the publication is in force', async () => {
    const key = 'k'.repeat(43);
    const hash = createHash('sha256').update(key).digest('hex');
    await run(principal, `insert into marking_report_links (school_id, key_hash, exam_id, class_id, student_id, publication_version, made_by) values ($1, $2, $3, $4, $5, 1, $6)`, [A, hash, examId, C7A, K1, PRINCIPAL]);
    await expect(run(tMaths, `insert into marking_report_links (school_id, key_hash, exam_id, class_id, student_id, publication_version, made_by) values ($1, $2, $3, $4, $5, 1, $6)`, [A, 'f'.repeat(64), examId, C7A, K2, T_MATHS])).rejects.toThrow(/row-level security/);
    const report = await asPlatform((c) => c.query(`select student_name, subject_name, sheet_id is not null as has_script, paper_marks from public.marking_report($1)`, [hash]));
    expect(report.rows).toEqual([{ student_name: 'Meera Sharma', subject_name: 'Mathematics', has_script: true, paper_marks: [{ component: 'internal', kind: 'score', score: 4 }, { component: 'theory', kind: 'score', score: 15.5 }] }]);
    expect((await asPlatform((c) => c.query(`select count(*)::int as n from public.marking_report_marks($1)`, [hash]))).rows[0].n).toBe(4);
    expect((await asPlatform((c) => c.query(`select count(*)::int as n from public.marking_report_pages($1)`, [hash]))).rows[0].n).toBe(2);
    expect((await asPlatform((c) => c.query(`select count(*)::int as n from public.marking_report($1)`, ['0'.repeat(64)]))).rows[0].n).toBe(0);
    // The app's role cannot read a link's result itself, nor any school's switch (review of #317).
    await expect(run(principal, `select * from public.marking_report($1)`, [hash])).rejects.toThrow(/permission denied/);
    await expect(run(principal, `select public.families_see_scripts($1)`, [B])).rejects.toThrow(/permission denied/);
    expect((await as(principal, (c) => reopenClass(c, actor(principal), examId, C7A, 'A mark to correct'))).ok).toBe(true);
    expect((await asPlatform((c) => c.query(`select count(*)::int as n from public.marking_report($1)`, [hash]))).rows[0].n).toBe(0);
    expect((await run(guardian, `select count(*)::int as n from marking_sheets`)).rows[0].n).toBe(0);
  });

  it('AI marking is off until the plan gives a monthly page limit and Control chooses a provider for both tasks', async () => {
    expect(await as(principal, (c) => aiMarkingState(c, A))).toMatchObject({ on: false, why: 'no_limit' });
    await owner(`update school_module_entitlements set limits = '{"ai_marking_pages": 500}' where school_id = $1 and module_id = 'exams'`, [A]);
    expect(await as(principal, (c) => aiMarkingState(c, A))).toMatchObject({ on: false, why: 'no_provider', limit: 500, pagesThisMonth: 6 });
    expect((await run(principal, `select profile_id, carries_child_words, enabled from control.ai_profiles where profile_id like 'exams.%' order by profile_id`)).rows).toEqual([
      { profile_id: 'exams.mark', carries_child_words: true, enabled: false },
      { profile_id: 'exams.read_pages', carries_child_words: true, enabled: false },
    ]);
  });
});
