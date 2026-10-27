import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { anthropicOk } from '../ai/streams';
import { fakeJpeg, labelOf } from '../marking/fake-jpeg';

// Bubble (OMR) sheets (docs/36 §1.2, C364) on the whole schema, as the app's own database role, through the app's own
// routes. A paper of only choice questions: printing numbers the sheets in roll order; read sheets become scripts marked
// by the key and the paper's wrong marks; a smudge or two marks is flagged, never guessed; a second sheet of one child and
// a sheet of no one wait for a person. A mixed paper: the bubble read fills the choice questions and the AI (a stand-in)
// is asked only for the written one. Another class's teacher sees nothing. No bubble page counts against the month's AI
// pages. Every name and number is made up.

const state = vi.hoisted(() => ({ claims: null as unknown, tenant: null as unknown }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => (state.tenant as any)(claims, fn),
}));
vi.mock('@/lib/storage/supabase-file-storage', async () => {
  const { MemoryFileStorage } = await import('@/lib/storage/file-storage');
  return { supabaseFileStorage: new MemoryFileStorage() };
});

import { schoolJobContextStatements } from '@/lib/auth/db';
import { sealAiKey, aiEncryptionKey } from '@/lib/ai/credentials';
import { layoutOfQuestions } from '@/lib/bubbles/layout';
import type { BubbleReading } from '@/lib/contracts/marking';
import { makeExam } from '@/lib/exams/exams';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import { runJobs } from '@/lib/jobs/runner';
import type { JobHandler } from '@/lib/jobs/types';
import { aiMarkingState } from '@/lib/marking/context';
import { markingGroupHandler, markingMarkHandler, markingReadHandler } from '@/lib/marking/pipeline';
import { approveSheets, chooseChild } from '@/lib/marking/review';
import { questionsOf, saveSetup } from '@/lib/marking/setup';
import type { MemoryFileStorage } from '@/lib/storage/file-storage';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';
import { GET as bubbleGet, POST as bubblePost } from '@/app/api/app/marking/papers/[paperId]/bubbles/route';
import { POST as startRoute } from '@/app/api/app/marking/papers/[paperId]/uploads/route';
import { POST as bubblePagesRoute } from '@/app/api/app/marking/uploads/[uploadId]/bubbles/route';
import { POST as pagesRoute } from '@/app/api/app/marking/uploads/[uploadId]/pages/route';
import { POST as closeRoute } from '@/app/api/app/marking/uploads/[uploadId]/close/route';
import { GET as sheetBubblesGet } from '@/app/api/app/marking/sheets/[sheetId]/bubbles/route';

const store = supabaseFileStorage as unknown as MemoryFileStorage;
const u = (n: number) => `ac000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const A = u(1);
const [PRINCIPAL, T_MATHS, T_OTHER, FOUNDER] = [u(11), u(12), u(13), u(19)];
const [C7A, C7B] = [u(21), u(22)];
const [MATHS, SCIENCE] = [u(31), u(32)];
const SESSION = u(41);
const UNIT = u(51);
const [K1, K2, K3, K4, K7B] = [u(61), u(62), u(63), u(64), u(65)];
const ANTHROPIC_KEY = `sk-ant-${'c'.repeat(30)}WXYZ`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const tMaths: Who = { role: 'teacher', user: T_MATHS, school: A };
const tOther: Who = { role: 'teacher', user: T_OTHER, school: A };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asSchool = <T>(schoolId: string, job: 'marking.pipeline', fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    for (const s of schoolJobContextStatements(schoolId, job)) await tx.query(s.sql, s.params);
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const actor = (who: Who) => ({ schoolId: who.school, userId: who.user, role: who.role as never });
const owner = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;

const claims = (who: Who) => ({ sub: who.user, role: who.role, schoolId: who.school, membershipId: u(80), tokenVersion: 0, aal: 'aal1', sessionId: u(81) });
const json = (url: string, body?: unknown) => new NextRequest(`http://localhost${url}`, { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = async (who: Who, fn: () => Promise<Response>): Promise<{ status: number; body: any }> => {
  state.claims = claims(who);
  state.tenant = (c: { role: string; sub: string; schoolId: string }, fn2: (x: unknown) => Promise<unknown>) => as({ role: c.role, user: c.sub, school: c.schoolId }, fn2);
  const res = await fn();
  return { status: res.status, body: await res.json() };
};
const post = (who: Who, paperId: string, body: unknown) => call(who, () => bubblePost(json(`/api/app/marking/papers/${paperId}/bubbles`, body), { params: { paperId } }));
const screen = (who: Who, paperId: string) => call(who, () => bubbleGet(new NextRequest(`http://localhost/api/app/marking/papers/${paperId}/bubbles`), { params: { paperId } }));
type Sheet = { fileNo: number; pageNo: number; label: string; reading: Partial<BubbleReading> };
const sendSheets = (who: Who, uploadId: string, sheets: Sheet[], layoutKey: string) => {
  const f = new FormData();
  for (const s of sheets) {
    f.append('fileNo', String(s.fileNo));
    f.append('pageNo', String(s.pageNo));
    f.append('reading', JSON.stringify({ layout: layoutKey, sheetNo: null, roll: null, rollUnclear: false, answers: {}, unclear: [], multiple: [], confidence: 0.97, ...s.reading }));
    f.append('page', new Blob([fakeJpeg(s.label, 1050, 1485)], { type: 'image/jpeg' }), 'sheet.jpg');
  }
  return call(who, () => bubblePagesRoute(new NextRequest(`http://localhost/api/app/marking/uploads/${uploadId}/bubbles`, { method: 'POST', body: f }), { params: { uploadId } }));
};
const close = (uploadId: string) => call(tMaths, () => closeRoute(json(`/api/app/marking/uploads/${uploadId}/close`), { params: { uploadId } }));
const countAs = async (who: Who, table: string): Promise<number> => Number((await as<{ rows: { n: number }[] }>(who, (c) => c.query(`select count(*)::int as n from ${table}`))).rows[0].n);
const sheetView = (who: Who, sheetId: string) => call(who, () => sheetBubblesGet(new NextRequest(`http://localhost/api/app/marking/sheets/${sheetId}/bubbles`), { params: { sheetId } }));

// ---- the stand-in model, for the mixed paper's answer books --------------------------------------------------------------

const READINGS: Record<string, Record<string, unknown>> = {
  m1: { first_page: true, name: 'Meera Sharma', roll_no: '1', exam_no: null, class_section: '7-A', page_number: 1, blank: false, legible: true, answer_page: true, id_document: false },
  m2: { first_page: true, name: 'Zoya Khan', roll_no: '2', exam_no: null, class_section: '7-A', page_number: 1, blank: false, legible: true, answer_page: true, id_document: false },
};
const markRequests: string[] = [];
const marked = '```json\n' + JSON.stringify({ questions: [{ label: '3', attempted: true, marks: 6, steps: [], note: 'Good.', reason: 'Clear.', error_type: 'none', confidence: 0.9, page: 1, y_from: 0.2, y_to: 0.5 }], strengths: 'Clear writing.', improve: 'Label diagrams.', practice: [] }) + '\n```';
function stubVendor() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { system: string; messages: { content: ({ type: 'image'; source: { data: string } } | { type: 'text'; text: string })[] }[] };
      const labels = body.messages[0].content.flatMap((p) => (p.type === 'image' ? [labelOf(new Uint8Array(Buffer.from(p.source.data, 'base64'))) ?? ''] : []));
      if (body.system.includes('photographed page')) return anthropicOk([JSON.stringify({ pages: labels.flatMap((l, i) => (READINGS[l] ? [{ page: i + 1, ...READINGS[l] }] : [])) })]);
      markRequests.push(String(init.body));
      return anthropicOk([marked]);
    })
  );
}
const queue = createPgJobQueue(platform as never);
const deps = { asSchool, queue, storage: store };
const handlers: Record<string, JobHandler> = { 'marking.read': markingReadHandler(deps), 'marking.group': markingGroupHandler(deps), 'marking.mark': markingMarkHandler(deps) };
async function drain() {
  for (let i = 0; i < 60; i++) {
    await owner(`update jobs set next_run_at = now() - interval '1 second' where status = 'pending'`);
    if ((await runJobs({ handlers, queue, longJobs: true })).claimed === 0) return;
  }
  throw new Error('the jobs did not settle');
}

let choicePaper = '';
let mixedPaper = '';
let otherPaper = '';
let key = '';
const choiceQuestions = (q4Options: number) =>
  [
    { label: '1', correct: ['B'] },
    { label: '2', correct: ['C'] },
    { label: '3', correct: ['A'] },
    { label: '4', correct: ['D'] },
  ].map((q, i) => ({
    label: q.label,
    component: 'theory',
    maxMarks: 1,
    unitId: UNIT,
    kind: 'objective',
    prompt: `Choice ${i + 1}`,
    answerKey: '',
    steps: [],
    options: Array.from({ length: i === 3 ? q4Options : 4 }, (_, k) => ({ key: 'ABCDEF'[k], text: `Option ${'ABCDEF'[k]}` })),
    correct: { keys: q.correct },
  }));
const scriptOf = async (paperId: string, student: string) =>
  (await owner(`select sheet_id, student_id, matched_by, state, flags, source, ai_confidence from marking_sheets where paper_id = $1 and student_id = $2 and state <> 'set_aside'`, [paperId, student]))[0];
const marksOf = async (sheetId: string) =>
  Object.fromEntries(
    (
      await owner(`select q.label, m.attempted, m.ai_marks::float8 as ai, m.error_type, m.confidence::float8 as confidence from marking_marks m join marking_questions q on q.question_id = m.question_id where m.sheet_id = $1 order by q.position`, [sheetId])
    ).map((r: { label: string }) => [r.label, r])
  );

beforeAll(async () => {
  process.env.AI_CREDENTIALS_KEY = randomBytes(32).toString('base64');
  process.env.AI_CREDENTIALS_KEY_VERSION = '1';
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, board, is_test_fixture) values ('${A}', 'School A', 'IN-HR', 'CBSE', true);
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'principal@a.example', 'principal', 'Priya Principal', true),
      ('${T_MATHS}', '${A}', 'tara@a.example', 'teacher', 'Tara Maths', true),
      ('${T_OTHER}', '${A}', 'omar@a.example', 'teacher', 'Omar Other', true);
    insert into teachers (teacher_id, school_id, user_id, name) values (gen_random_uuid(), '${A}', '${T_MATHS}', 'Tara Maths'), (gen_random_uuid(), '${A}', '${T_OTHER}', 'Omar Other');
    insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values ('${SESSION}', '${A}', '2026-27', '2026-04-01', '2027-03-31', true);
    insert into classes (class_id, school_id, name, grade, section) values ('${C7A}', '${A}', '7', '7', 'A'), ('${C7B}', '${A}', '7', '7', 'B');
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Mathematics'), ('${SCIENCE}', '${A}', 'Science');
    insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) select '${A}', t.teacher_id, s.subject_id, '${C7A}' from teachers t, subjects s where t.user_id = '${T_MATHS}';
    insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) select '${A}', t.teacher_id, '${MATHS}', '${C7B}' from teachers t where t.user_id = '${T_OTHER}';
    insert into students (student_id, school_id, admission_no, name, class_id, roll_no, status) values
      ('${K1}', '${A}', 'A-1', 'Meera Sharma', '${C7A}', '1', 'active'), ('${K2}', '${A}', 'A-2', 'Zoya Khan', '${C7A}', '2', 'active'),
      ('${K3}', '${A}', 'A-3', 'Dev Patel', '${C7A}', '3', 'active'), ('${K4}', '${A}', 'A-4', 'Ira Nair', '${C7A}', '10', 'active'),
      ('${K7B}', '${A}', 'B-1', 'Kabir Rao', '${C7B}', '1', 'active');
    insert into syllabus_units (unit_id, school_id, class_id, subject_id, position, chapter, topic) values ('${UNIT}', '${A}', '${C7A}', '${MATHS}', 1, 'Fractions', 'Adding fractions');
    insert into school_module_entitlements (school_id, module_id, enabled, source, limits) values ('${A}', 'exams', true, 'plan', '{"ai_marking_pages": 3}')
      on conflict (school_id, module_id) do update set enabled = true, limits = excluded.limits;
  `);
  await owner(`insert into grading_schemes (school_id, version, scheme, made_by) values ($1, 1, $2::jsonb, $3)`, [
    A,
    JSON.stringify({
      bands: [{ from: 50, to: 100, grade: 'A', meaning: null }, { from: 0, to: 49, grade: 'B', meaning: null }],
      decimals: 0,
      passMark: 33,
      components: [{ key: 'theory', kind: 'theory', name: 'Theory', share: 100, passMark: null, parts: [] }],
      terms: [{ name: 'Term 1' }],
      layout: { components: true, total: true, percent: true, grade: true, attendance: false, remarks: false, coScholastic: false },
      coScholastic: null,
    }),
    PRINCIPAL,
  ]);
  const made = (await as({ role: 'principal', user: PRINCIPAL, school: A }, (c) =>
    makeExam(c, actor({ role: 'principal', user: PRINCIPAL, school: A }), {
      name: 'Unit test',
      sessionId: SESSION,
      term: 'Term 1',
      papers: [
        { classId: C7A, subjectId: MATHS, date: '2026-10-01', unitIds: [UNIT], maxima: { theory: 4 } },
        { classId: C7A, subjectId: SCIENCE, date: '2026-10-02', unitIds: [], maxima: { theory: 10 } },
        { classId: C7B, subjectId: MATHS, date: '2026-10-01', unitIds: [], maxima: { theory: 4 } },
      ],
    })
  )) as { examId: string };
  const papers = await owner(`select paper_id, class_id, subject_id from exam_papers where exam_id = $1`, [made.examId]);
  choicePaper = papers.find((p: { class_id: string; subject_id: string }) => p.class_id === C7A && p.subject_id === MATHS).paper_id;
  mixedPaper = papers.find((p: { subject_id: string }) => p.subject_id === SCIENCE).paper_id;
  otherPaper = papers.find((p: { class_id: string }) => p.class_id === C7B).paper_id;
  expect((await as(tMaths, (c) => saveSetup(c, actor(tMaths), choicePaper, { setup: { language: 'en', guidance: '', choiceCounts: {} }, questions: choiceQuestions(4) }))).ok).toBe(true);
  expect(
    (
      await as(tMaths, (c) =>
        saveSetup(c, actor(tMaths), mixedPaper, {
          setup: { language: 'en', guidance: '', choiceCounts: {} },
          questions: [
            { label: '1', component: 'theory', maxMarks: 1, unitId: null, kind: 'objective', prompt: 'Which gas do plants take in for food making?', answerKey: '', steps: [], options: [{ key: 'A', text: 'Oxygen' }, { key: 'B', text: 'Carbon dioxide' }, { key: 'C', text: 'Nitrogen' }], correct: { keys: ['B'] } },
            { label: '2', component: 'theory', maxMarks: 1, unitId: null, kind: 'objective', prompt: 'Which part of a plant takes in water from the soil?', answerKey: '', steps: [], options: [{ key: 'A', text: 'Root' }, { key: 'B', text: 'Leaf' }], correct: { keys: ['A'] } },
            { label: '3', component: 'theory', maxMarks: 8, unitId: null, kind: 'long', prompt: 'Explain how a leaf makes food.', answerKey: 'Sunlight, water, carbon dioxide, chlorophyll.', steps: [] },
          ],
        })
      )
    ).ok
  ).toBe(true);
  await owner(`update control.ai_providers set cleared_for_minors = true, cleared_terms_url = 'https://example.org/terms', cleared_at = now(), cleared_by = $1 where provider_id = 'anthropic'`, [FOUNDER]);
  const sealed = sealAiKey(aiEncryptionKey()!, 'anthropic', ANTHROPIC_KEY);
  await owner(`insert into control.ai_credentials (provider_id, ciphertext, iv, tag, key_version, key_last4, set_by) values ('anthropic', $1, $2, $3, $4, 'WXYZ', $5)`, [sealed.ciphertext, sealed.iv, sealed.tag, sealed.keyVersion, FOUNDER]);
  await owner(`update control.ai_profiles set provider_id = 'anthropic', model = 'test-vision', enabled = true where profile_id in ('exams.read_pages', 'exams.mark')`);
  stubVendor();
}, 120_000);
afterAll(async () => {
  vi.unstubAllGlobals();
  await db?.stop();
});

describe('printing a paper’s bubble sheets (C364)', () => {
  it('a paper is sat with a bubble sheet by whoever may mark it; numbers are issued by the database in roll order', async () => {
    expect(await post(tMaths, choicePaper, { action: 'print', blanks: 0 })).toMatchObject({ status: 409, body: { code: 'not_bubble' } });
    expect(await post(tMaths, choicePaper, { action: 'sitting', sitting: 'bubble' })).toMatchObject({ status: 200 });
    const printed = await post(tMaths, choicePaper, { action: 'print', blanks: 2 });
    expect(printed.status).toBe(200);
    // Roll 1, 2, 3, then 10 (a number, not a word), then the two blank sheets.
    expect(printed.body.print.sheets).toEqual([
      { sheetNo: 1, child: { name: 'Meera Sharma', rollNo: '1', seatNo: null } },
      { sheetNo: 2, child: { name: 'Zoya Khan', rollNo: '2', seatNo: null } },
      { sheetNo: 3, child: { name: 'Dev Patel', rollNo: '3', seatNo: null } },
      { sheetNo: 4, child: { name: 'Ira Nair', rollNo: '10', seatNo: null } },
      { sheetNo: 5, child: null },
      { sheetNo: 6, child: null },
    ]);
    expect(printed.body.print).toMatchObject({ school: 'School A', examName: 'Unit test', subjectName: 'Mathematics', questions: [{ label: '1', options: 4 }, { label: '2', options: 4 }, { label: '3', options: 4 }, { label: '4', options: 4 }] });
    // Printing again prints the same numbers; no new blank sheet unless asked.
    expect((await post(tMaths, choicePaper, { action: 'print', blanks: 0 })).body.print.sheets.map((s: { sheetNo: number }) => s.sheetNo)).toEqual([1, 2, 3, 4]);
    // Once printed, the paper stays sat with a bubble sheet.
    expect(await post(tMaths, choicePaper, { action: 'sitting', sitting: 'written' })).toMatchObject({ status: 409, body: { code: 'sitting_fixed' } });
  });

  it('questions changed after printing: the children get new numbers and the old sheets are never read', async () => {
    const old = (await screen(tMaths, choicePaper)).body.layoutKey as string;
    expect((await as(tMaths, (c) => saveSetup(c, actor(tMaths), choicePaper, { setup: { language: 'en', guidance: '', choiceCounts: {} }, questions: choiceQuestions(5) }))).ok).toBe(true);
    key = (await screen(tMaths, choicePaper)).body.layoutKey;
    expect(key).not.toBe(old);
    const again = await post(tMaths, choicePaper, { action: 'print', blanks: 1 });
    expect(again.body.print.sheets.map((s: { sheetNo: number }) => s.sheetNo)).toEqual([7, 8, 9, 10, 11]);
    const s = (await screen(tMaths, choicePaper)).body;
    expect(s.printed).toMatchObject({ candidates: 4, blanks: 1, replaced: 6 });
    // The database: a printed sheet stays as printed; a teacher cannot print for another class's child.
    await expect(as(tMaths, (c) => c.query(`update bubble_sheets set student_id = $2 where paper_id = $1 and sheet_no = 7`, [choicePaper, K2]))).rejects.toThrow(/stays as printed/);
    await expect(as(tMaths, (c) => c.query(`insert into bubble_sheets (school_id, paper_id, sheet_no, student_id, layout) values ($1, $2, 99, $3, $4)`, [A, choicePaper, K7B, key]))).rejects.toThrow(/class roll/);
  });
});

describe('reading a paper of only choice questions (C364)', () => {
  let upload = '';
  it('a bubble upload needs no AI and starts on the paper’s bubble sheets only', async () => {
    expect(await call(tMaths, () => startRoute(json(`/api/app/marking/papers/${choicePaper}/uploads`, { mode: 'per_file', files: 1 }), { params: { paperId: choicePaper } }))).toMatchObject({ status: 403 });
    const made = await post(tMaths, choicePaper, { action: 'upload', mode: 'combined', files: 1 });
    expect(made.status).toBe(201);
    upload = made.body.uploadId;
    expect((await owner(`select kind from marking_uploads where upload_id = $1`, [upload]))[0].kind).toBe('bubble');
    // Its pages come only with their readings: the answer books' page route does not take them.
    const f = new FormData();
    f.append('fileNo', '1');
    f.append('pageNo', '1');
    f.append('page', new Blob([fakeJpeg('x', 1050, 1485)], { type: 'image/jpeg' }), 'p.jpg');
    expect((await call(tMaths, () => pagesRoute(new NextRequest(`http://localhost/api/app/marking/uploads/${upload}/pages`, { method: 'POST', body: f }), { params: { uploadId: upload } }))).status).toBe(404);
  });

  it('read sheets become scripts marked by the key and the wrong marks; unclear and double marks are flagged, never guessed', async () => {
    expect(await post(tMaths, choicePaper, { action: 'wrong_marks', wrongMarks: 0.5 })).toMatchObject({ status: 200 });
    const before = (await as(tMaths, (c) => aiMarkingState(c, A))).pagesThisMonth;
    const sent = await sendSheets(
      tMaths,
      upload,
      [
        // Meera (sheet 7): 1 right, 2 wrong, 3 blank, 4 right.
        { fileNo: 1, pageNo: 1, label: 's7', reading: { sheetNo: 7, answers: { '1': ['B'], '2': ['A'], '4': ['D'] } } },
        // Zoya (sheet 8): 1 smudged, 2 two marks, 3 and 4 right.
        { fileNo: 1, pageNo: 2, label: 's8', reading: { sheetNo: 8, answers: { '2': ['A', 'C'], '3': ['A'], '4': ['D'] }, unclear: ['1'], multiple: ['2'] } },
        // A blank sheet (11) on which Dev shaded roll 0003.
        { fileNo: 1, pageNo: 3, label: 's11', reading: { sheetNo: 11, roll: '0003', answers: { '1': ['B'], '2': ['C'], '3': ['A'], '4': ['D'] } } },
        // Meera's sheet again, another picture: the second waits for a person.
        { fileNo: 1, pageNo: 4, label: 's7b', reading: { sheetNo: 7, answers: { '1': ['B'] } } },
        // No number read and nothing shaded: no one.
        { fileNo: 1, pageNo: 5, label: 'sx', reading: { answers: { '1': ['A'] } } },
      ],
      key
    );
    expect(sent.status).toBe(200);
    expect(sent.body.pages.map((p: { outcome: string; sheetNo: number | null; child: { name: string } | null; flagged: boolean }) => [p.outcome, p.sheetNo, p.child?.name ?? null, p.flagged])).toEqual([
      ['script', 7, 'Meera Sharma', false],
      ['script', 8, 'Zoya Khan', true],
      ['script', 11, 'Dev Patel', true],
      ['script', 7, null, true],
      ['script', null, null, true],
    ]);
    const meera = await scriptOf(choicePaper, K1);
    expect(meera).toMatchObject({ source: 'bubble', matched_by: 'bubble', state: 'marked', flags: [] });
    expect(await marksOf(meera.sheet_id)).toEqual({
      '1': { label: '1', attempted: true, ai: 1, error_type: 'none', confidence: 0.97 },
      '2': { label: '2', attempted: true, ai: -0.5, error_type: null, confidence: 0.97 },
      '3': { label: '3', attempted: false, ai: 0, error_type: 'not_attempted', confidence: 0.97 },
      '4': { label: '4', attempted: true, ai: 1, error_type: 'none', confidence: 0.97 },
    });
    const zoya = await scriptOf(choicePaper, K2);
    expect(zoya.flags.sort()).toEqual(['not_all_read', 'unsure']);
    const z = await marksOf(zoya.sheet_id);
    expect([z['1'].ai, z['2'].ai, z['3'].ai, z['4'].ai]).toEqual([null, null, 1, 1]);
    const dev = await scriptOf(choicePaper, K3);
    expect(dev).toMatchObject({ matched_by: 'roll', flags: ['check_child'] });
    const nobody = await owner(`select flags, match_note from marking_sheets where paper_id = $1 and student_id is null order by created_at`, [choicePaper]);
    expect(nobody.map((s: { flags: string[] }) => s.flags)).toEqual([['two_scripts'], ['identity']]);
    expect(nobody[0].match_note.candidates).toEqual([K1]);
    // Five pages kept, and none counted against the month's AI pages (3 a month here).
    expect(await owner(`select count(*)::int as n from marking_pages where upload_id = $1 and state = 'read'`, [upload])).toEqual([{ n: 5 }]);
    expect((await as(tMaths, (c) => aiMarkingState(c, A))).pagesThisMonth).toBe(before);
    // Sent again (a retry): the same answer, nothing new.
    const retry = await sendSheets(tMaths, upload, [{ fileNo: 1, pageNo: 1, label: 's7', reading: { sheetNo: 7, answers: { '1': ['B'], '2': ['A'], '4': ['D'] } } }], key);
    expect(retry.body.pages[0]).toMatchObject({ outcome: 'script', child: { name: 'Meera Sharma' } });
    expect(await owner(`select count(*)::int as n from bubble_reads where paper_id = $1`, [choicePaper])).toEqual([{ n: 5 }]);
  });

  it('a reading is checked strictly: another answer grid, an old sheet, an option a question does not have', async () => {
    const old = (await owner(`select layout from bubble_sheets where paper_id = $1 and sheet_no = 1`, [choicePaper]))[0].layout;
    expect(await sendSheets(tMaths, upload, [{ fileNo: 2, pageNo: 1, label: 'o1', reading: { sheetNo: 1 } }], old)).toMatchObject({ status: 409, body: { code: 'layout' } });
    expect(await sendSheets(tMaths, upload, [{ fileNo: 2, pageNo: 1, label: 'o1', reading: { sheetNo: 1 } }], key)).toMatchObject({ status: 409, body: { code: 'old_sheet', at: 0 } });
    expect(await sendSheets(tMaths, upload, [{ fileNo: 2, pageNo: 1, label: 'o1', reading: { sheetNo: 10, answers: { '1': ['F'] } } }], key)).toMatchObject({ status: 400, body: { code: 'reading', field: 'answers' } });
    expect(await sendSheets(tMaths, upload, [{ fileNo: 2, pageNo: 1, label: 'o1', reading: { sheetNo: 10, answers: { '1': ['A', 'B'] } } }], key)).toMatchObject({ status: 400, body: { code: 'reading', field: 'multiple' } });
    expect(await sendSheets(tMaths, upload, [{ fileNo: 2, pageNo: 1, label: 'o1', reading: { sheetNo: 10, answers: { '9': ['A'] } } }], key)).toMatchObject({ status: 400, body: { code: 'reading', field: 'answers' } });
    // Nothing was kept for any of them.
    expect(await owner(`select count(*)::int as n from marking_pages where upload_id = $1 and file_no = 2`, [upload])).toEqual([{ n: 0 }]);
    // What was read never changes, and only a person records a reading.
    const read = (await owner(`select read_id, page_id from bubble_reads where paper_id = $1 limit 1`, [choicePaper]))[0];
    await expect(as(tMaths, (c) => c.query(`update bubble_reads set answers = '{}'::jsonb where read_id = $1`, [read.read_id]))).rejects.toThrow(/never changes/);
  });

  it('approval: the clean script with the others; a flagged one once a person has settled it', async () => {
    expect(await as(tMaths, (c) => approveSheets(c, actor(tMaths), choicePaper, 'unflagged'))).toMatchObject({ ok: true, approved: 1 });
    expect(await owner(`select score::float8 as score from marks where paper_id = $1 and student_id = $2`, [choicePaper, K1])).toEqual([{ score: 1.5 }]);
    const dev = await scriptOf(choicePaper, K3);
    expect(await as(tMaths, (c) => chooseChild(c, actor(tMaths), dev.sheet_id, K3))).toEqual({ ok: true });
    expect(await as(tMaths, (c) => approveSheets(c, actor(tMaths), choicePaper, [dev.sheet_id]))).toMatchObject({ ok: true, approved: 1 });
    // Zoya's smudge and double mark have no mark until a person gives one.
    const zoya = await scriptOf(choicePaper, K2);
    expect(await as(tMaths, (c) => approveSheets(c, actor(tMaths), choicePaper, [zoya.sheet_id]))).toEqual({ ok: false, reason: 'flagged', sheetId: zoya.sheet_id });
    // The review screen's view of Zoya's sheet: what was read, the key, and where the bubbles are on the picture.
    const view = await sheetView(tMaths, zoya.sheet_id);
    expect(view.status).toBe(200);
    expect(view.body.view.questions.map((q: { label: string; state: string; read: string[]; correct: string[]; right: boolean | null }) => [q.label, q.state, q.read, q.correct, q.right])).toEqual([
      ['1', 'unclear', [], ['B'], null],
      ['2', 'multiple', ['A', 'C'], ['C'], null],
      ['3', 'answer', ['A'], ['A'], true],
      ['4', 'answer', ['D'], ['D'], true],
    ]);
    expect(view.body.view.questions[0].bubbles).toHaveLength(4);
    expect(view.body.view).toMatchObject({ sheetNo: 8, sameQuestions: true, applied: true });
  });

  it('a change of wrong marks marks every sheet again; an approved script that changes waits to be approved again', async () => {
    expect(await post(tMaths, choicePaper, { action: 'wrong_marks', wrongMarks: 1 })).toMatchObject({ status: 200, body: { remarked: 5 } });
    const meera = await scriptOf(choicePaper, K1);
    expect((await marksOf(meera.sheet_id))['2'].ai).toBe(-1);
    expect(meera).toMatchObject({ state: 'approved', flags: ['changed'] });
    const dev = await scriptOf(choicePaper, K3);
    expect(dev.flags).not.toContain('changed');
  });
});

describe('a mixed paper: choice questions on the bubble sheet, the rest in the answer book (C364)', () => {
  let bubbleUpload = '';
  let mixedKey = '';
  it('a sheet read before its answer book waits for it', async () => {
    expect(await post(tMaths, mixedPaper, { action: 'sitting', sitting: 'bubble' })).toMatchObject({ status: 200 });
    const printed = await post(tMaths, mixedPaper, { action: 'print', blanks: 0 });
    expect(printed.body.print.questions).toEqual([{ label: '1', options: 3 }, { label: '2', options: 2 }]);
    mixedKey = printed.body.print.layoutKey;
    const s = (await screen(tMaths, mixedPaper)).body;
    expect(s).toMatchObject({ onlyChoice: false, sitting: 'bubble' });
    bubbleUpload = (await post(tMaths, mixedPaper, { action: 'upload', mode: 'combined', files: 1 })).body.uploadId;
    const sent = await sendSheets(tMaths, bubbleUpload, [{ fileNo: 1, pageNo: 1, label: 'mx1', reading: { sheetNo: 1, answers: { '1': ['B'], '2': ['B'] } } }], mixedKey);
    expect(sent.body.pages[0]).toMatchObject({ outcome: 'kept', child: { name: 'Meera Sharma' } });
  });

  it('the AI is asked only for the written question; the choice questions are marked from the sheet', async () => {
    const started = await call(tMaths, () => startRoute(json(`/api/app/marking/papers/${mixedPaper}/uploads`, { mode: 'per_file', files: 2 }), { params: { paperId: mixedPaper } }));
    expect(started.status).toBe(201);
    const f = new FormData();
    for (const [fileNo, label] of [[1, 'm1'], [2, 'm2']] as const) {
      f.append('fileNo', String(fileNo));
      f.append('pageNo', '1');
      f.append('page', new Blob([fakeJpeg(label)], { type: 'image/jpeg' }), 'p.jpg');
    }
    const uploadId = started.body.uploadId;
    expect((await call(tMaths, () => pagesRoute(new NextRequest(`http://localhost/api/app/marking/uploads/${uploadId}/pages`, { method: 'POST', body: f }), { params: { uploadId } }))).status).toBe(200);
    expect((await close(uploadId)).status).toBe(200);
    await drain();
    expect(markRequests.length).toBe(2);
    for (const r of markRequests) {
      expect(r).toContain('Explain how a leaf makes food.');
      expect(r).not.toContain('Which gas do plants take in');
      expect(r).not.toContain('Which part of a plant');
    }
    const meera = await scriptOf(mixedPaper, K1);
    expect(meera).toMatchObject({ source: 'scan', state: 'marked' });
    const m = await marksOf(meera.sheet_id);
    expect([m['1'].ai, m['2'].ai, m['3'].ai]).toEqual([1, 0, 6]);
    expect(meera.flags).not.toContain('not_all_read');
    // Zoya's sheet is not in yet: her choice questions wait without a mark.
    const zoya = await scriptOf(mixedPaper, K2);
    expect(zoya.flags).toContain('not_all_read');
    expect((await marksOf(zoya.sheet_id))['3'].ai).toBe(6);
  });

  it('a sheet read after the script is marked fills it; on an approved script it asks for approval again', async () => {
    const sent = await sendSheets(tMaths, bubbleUpload, [{ fileNo: 1, pageNo: 2, label: 'mx2', reading: { sheetNo: 2, answers: { '1': ['B'], '2': ['A'] } } }], mixedKey);
    expect(sent.body.pages[0]).toMatchObject({ outcome: 'filled', child: { name: 'Zoya Khan' }, flagged: false });
    const zoya = await scriptOf(mixedPaper, K2);
    expect(zoya.flags).not.toContain('not_all_read');
    const z = await marksOf(zoya.sheet_id);
    expect([z['1'].ai, z['2'].ai, z['3'].ai]).toEqual([1, 1, 6]);
    expect(await as(tMaths, (c) => approveSheets(c, actor(tMaths), mixedPaper, [zoya.sheet_id]))).toMatchObject({ ok: true, approved: 1 });
    expect(await owner(`select score::float8 as score from marks where paper_id = $1 and student_id = $2`, [mixedPaper, K2])).toEqual([{ score: 8 }]);
    // The sheet was not Zoya's after all: taken off her script, which waits to be approved again; then given back.
    const read = (await owner(`select read_id from bubble_reads where page_id = $1`, [sent.body.pages[0].pageId]))[0].read_id;
    expect(await post(tMaths, mixedPaper, { action: 'read', readId: read, do: 'unmatch' })).toMatchObject({ status: 200 });
    expect((await scriptOf(mixedPaper, K2)).flags.sort()).toEqual(['changed', 'not_all_read']);
    expect((await screen(tMaths, mixedPaper)).body.waiting).toMatchObject([{ readId: read, sheetNo: 2, offered: [K2], why: 'identity' }]);
    expect(await post(tMaths, mixedPaper, { action: 'read', readId: read, do: 'child', studentId: K2 })).toMatchObject({ status: 200 });
    expect((await scriptOf(mixedPaper, K2)).flags).toEqual(['changed']);
  });

  it('an answer-book script given to another child loses the first child’s bubble marks', async () => {
    const meera = await scriptOf(mixedPaper, K1);
    expect(await as(tMaths, (c) => chooseChild(c, actor(tMaths), meera.sheet_id, K3))).toEqual({ ok: true });
    const m = await marksOf(meera.sheet_id);
    expect([m['1'].ai, m['2'].ai, m['3'].ai]).toEqual([null, null, 6]);
    expect((await owner(`select flags from marking_sheets where sheet_id = $1`, [meera.sheet_id]))[0].flags).toContain('not_all_read');
    expect(await owner(`select sheet_id from bubble_reads where paper_id = $1 and student_id = $2`, [mixedPaper, K1])).toEqual([{ sheet_id: null }]);
  });
});

describe('who sees what (C364)', () => {
  it('another class’s teacher sees nothing of the paper’s sheets, cannot print them or send to its upload', async () => {
    expect(await screen(tOther, choicePaper)).toMatchObject({ status: 404 });
    expect(await post(tOther, choicePaper, { action: 'print', blanks: 1 })).toMatchObject({ status: 404 });
    expect(await countAs(tOther, 'bubble_sheets')).toBe(0);
    expect(await countAs(tOther, 'bubble_reads')).toBe(0);
    expect(await countAs(tMaths, 'bubble_reads')).toBeGreaterThan(0);
    await expect(as(tOther, (c) => c.query(`select * from public.issue_bubble_sheets($1, $2, 0)`, [choicePaper, key]))).rejects.toThrow();
    const upload = (await owner(`select upload_id from marking_uploads where paper_id = $1 and kind = 'bubble' limit 1`, [choicePaper]))[0].upload_id;
    expect((await sendSheets(tOther, upload, [{ fileNo: 9, pageNo: 1, label: 'zz', reading: {} }], key)).status).toBe(404);
    // Their own class's paper is theirs: no choice question yet, so nothing to print.
    expect(await post(tOther, otherPaper, { action: 'sitting', sitting: 'bubble' })).toMatchObject({ status: 200 });
    expect(await post(tOther, otherPaper, { action: 'print', blanks: 0 })).toMatchObject({ status: 409, body: { code: 'no_choice' } });
  });

  it('a parent and the platform role hold nothing of them', async () => {
    const asParent = { role: 'parent', user: PRINCIPAL, school: A };
    expect(await countAs(asParent, 'bubble_reads')).toBe(0);
    expect(await countAs(asParent, 'bubble_sheets')).toBe(0);
    await expect(platform((c) => c.query(`select 1 from bubble_sheets`))).rejects.toThrow(/permission denied/);
  });

  it('closing a bubble upload starts no AI job', async () => {
    const upload = (await owner(`select upload_id from marking_uploads where paper_id = $1 and kind = 'bubble' limit 1`, [choicePaper]))[0].upload_id;
    const jobs = (await owner(`select count(*)::int as n from jobs`))[0].n;
    expect(await close(upload)).toMatchObject({ status: 200, body: { closed: true, runs: 0 } });
    expect((await owner(`select count(*)::int as n from jobs`))[0].n).toBe(jobs);
    // The layout the server uses is the browser's own (one function, src/lib/bubbles/layout.ts).
    const qs = await as(tMaths, (c) => questionsOf(c, A, choicePaper));
    expect(layoutOfQuestions(qs).key).toBe(key);
  });
});
