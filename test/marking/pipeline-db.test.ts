import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { anthropicOk } from '../ai/streams';
import { fakeJpeg, labelOf } from './fake-jpeg';

// AI answer-sheet marking's pipeline (docs/35 §5 AM-2; C347, C349, C350) on the whole schema, as the app's own database
// role: the upload routes, the page picture route, and the school's marking jobs through the job runner, in the
// school's own job session. The AI platform runs for real (the task switched on in Control, the minors check, the key
// opened, the metering); only the vendor is replaced, at fetch, by a stand-in that answers as a model would from the
// page pictures it is sent. The acceptance test: "a whole class's pages, read and marked by a stand-in model's answers,
// end as matched, marked scripts; a bad answer fails one script, not the class; a retry runs once." Every name and
// number is made up.

const state = vi.hoisted(() => ({ claims: null as unknown, tenant: null as unknown }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => (state.tenant as any)(claims, fn),
}));
// The file store, in memory.
vi.mock('@/lib/storage/supabase-file-storage', async () => {
  const { MemoryFileStorage } = await import('@/lib/storage/file-storage');
  return { supabaseFileStorage: new MemoryFileStorage() };
});

import { schoolJobContextStatements } from '@/lib/auth/db';
import { sealAiKey, aiEncryptionKey } from '@/lib/ai/credentials';
import { PAGE_MAX_BYTES } from '@/lib/contracts/marking';
import { makeExam } from '@/lib/exams/exams';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import { runJobs } from '@/lib/jobs/runner';
import type { ClaimedJob, JobHandler } from '@/lib/jobs/types';
import { pagesThisMonth } from '@/lib/marking/context';
import { markingGroupHandler, markingMarkHandler, markingReadHandler } from '@/lib/marking/pipeline';
import { askToMarkAgain, changeSheet } from '@/lib/marking/review';
import { saveSetup } from '@/lib/marking/setup';
import type { MemoryFileStorage } from '@/lib/storage/file-storage';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';
import { POST as startRoute } from '@/app/api/app/marking/papers/[paperId]/uploads/route';
import { POST as pagesRoute } from '@/app/api/app/marking/uploads/[uploadId]/pages/route';
import { POST as closeRoute } from '@/app/api/app/marking/uploads/[uploadId]/close/route';
import { GET as pageRoute } from '@/app/api/app/marking/pages/[pageId]/route';
import { POST as markAgainRoute } from '@/app/api/app/marking/sheets/[sheetId]/mark-again/route';

const store = supabaseFileStorage as unknown as MemoryFileStorage;
const u = (n: number) => `a9000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B] = [u(1), u(2)];
const [PRINCIPAL, T_MATHS, T_OTHER, ACCOUNTANT, FOUNDER] = [u(11), u(12), u(13), u(14), u(19)];
const [C7A, C7B] = [u(21), u(22)];
const MATHS = u(31);
const SESSION = u(41);
const [UNIT_FR, UNIT_DEC, UNIT_7B] = [u(51), u(52), u(53)];
const [K1, K2, K3, K7B] = [u(61), u(62), u(63), u(65)];
const NAMES = ['Meera', 'Sharma', 'Zoya', 'Khan', 'Dev Patel', 'Kabir', 'School A', 'Half-yearly'];
const ANTHROPIC_KEY = `sk-ant-${'a'.repeat(30)}WXYZ`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const tMaths: Who = { role: 'teacher', user: T_MATHS, school: A }; // teaches Mathematics in 7-A
const tOther: Who = { role: 'teacher', user: T_OTHER, school: A }; // teaches Mathematics in 7-B only
const accountant: Who = { role: 'accountant', user: ACCOUNTANT, school: A };

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

// ---- the routes, as the app's own session calls them ----------------------------------------------------------------

const claims = (who: Who) => ({ sub: who.user, role: who.role, schoolId: who.school, membershipId: u(80), tokenVersion: 0, aal: 'aal1', sessionId: u(81) });
const json = (url: string, body?: unknown) => new NextRequest(`http://localhost${url}`, { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const form = (uploadId: string, pages: { fileNo: number; pageNo: number; bytes: Uint8Array }[]) => {
  const f = new FormData();
  for (const p of pages) {
    f.append('fileNo', String(p.fileNo));
    f.append('pageNo', String(p.pageNo));
    f.append('page', new Blob([p.bytes], { type: 'image/jpeg' }), 'page.jpg');
  }
  return new NextRequest(`http://localhost/api/app/marking/uploads/${uploadId}/pages`, { method: 'POST', body: f });
};
const enter = (who: Who) => {
  state.claims = claims(who);
  state.tenant = (c: { role: string; sub: string; schoolId: string }, fn2: (x: unknown) => Promise<unknown>) => as({ role: c.role, user: c.sub, school: c.schoolId }, fn2);
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = async (who: Who, fn: () => Promise<Response>): Promise<{ status: number; body: any }> => {
  enter(who);
  const res = await fn();
  return { status: res.status, body: await res.json() };
};
const start = (who: Who, paperId: string, body: unknown = { mode: 'combined', files: 1 }) => call(who, () => startRoute(json(`/api/app/marking/papers/${paperId}/uploads`, body), { params: { paperId } }));
const send = (who: Who, uploadId: string, pages: { fileNo: number; pageNo: number; bytes: Uint8Array }[]) => call(who, () => pagesRoute(form(uploadId, pages), { params: { uploadId } }));
const close = (who: Who, uploadId: string) => call(who, () => closeRoute(json(`/api/app/marking/uploads/${uploadId}/close`), { params: { uploadId } }));
const markAgain = (who: Who, sheetId: string) => call(who, () => markAgainRoute(json(`/api/app/marking/sheets/${sheetId}/mark-again`), { params: { sheetId } }));
const picture = async (who: Who, pageId: string) => {
  enter(who);
  return pageRoute(new NextRequest(`http://localhost/api/app/marking/pages/${pageId}`), { params: { pageId } });
};

// ---- the stand-in model ------------------------------------------------------------------------------------------------

// What each page shows, by the label in its picture (the reading prompt's own schema). A label not here gets no entry.
const READINGS: Record<string, Record<string, unknown>> = {
  m1: { first_page: true, name: 'Meera Sharma', roll_no: '1', exam_no: null, class_section: '7-A', page_number: 1, blank: false, legible: true },
  m2: { first_page: false, name: null, roll_no: null, exam_no: null, class_section: null, page_number: 2, blank: false, legible: true },
  m3: { first_page: false, name: null, roll_no: null, exam_no: null, class_section: null, page_number: 3, blank: false, legible: true },
  z1: { first_page: true, name: 'Zoya Khan', roll_no: '2', exam_no: null, class_section: '7-A', page_number: 1, blank: false, legible: true },
  z2: { first_page: false, name: null, roll_no: null, exam_no: null, class_section: null, page_number: 2, blank: false, legible: true },
  z3: { first_page: false, name: null, roll_no: null, exam_no: null, class_section: null, page_number: null, blank: true, legible: true },
  d1: { first_page: true, name: 'Dev Patel', roll_no: '3', exam_no: null, class_section: '7-A', page_number: 1, blank: false, legible: true },
  d2: { first_page: false, name: null, roll_no: null, exam_no: null, class_section: null, page_number: 2, blank: false, legible: true },
  d3: { first_page: false, name: null, roll_no: null, exam_no: null, class_section: null, page_number: 3, blank: false, legible: true },
};
const marked = (q1: number) =>
  '```json\n' +
  JSON.stringify({
    questions: [
      { label: '1', attempted: true, marks: q1, steps: [{ step: 'Common denominator', awarded: 2, note: null }], note: 'Check the sum.', reason: 'Method right.', error_type: 'calculation', confidence: 0.9, page: 1, y_from: 0.1, y_to: 0.3 },
      { label: '2', attempted: true, marks: 6, steps: [], note: 'Well done.', reason: 'Complete.', error_type: 'none', confidence: 0.95, page: 1, y_from: 0.4, y_to: 0.5 },
      { label: '3(A)', attempted: true, marks: 8, steps: [], note: 'Good.', reason: 'One point missing.', error_type: 'incomplete', confidence: 0.85, page: 2, y_from: 0.1, y_to: 0.7 },
      { label: '3(b)', attempted: false, marks: 0, steps: [], note: null, reason: null, error_type: 'not_attempted', confidence: 0.99, page: null, y_from: null, y_to: null },
    ],
    strengths: 'Neat working.',
    improve: 'Check sums.',
    practice: [{ topic: 1, text: 'Five sums adding fractions.' }],
  }) +
  '\n```';
// A script's answer by the label of its first page. Dev's is broken the first time.
let devAnswers = 0;
const MARKS: Record<string, () => string> = {
  m1: () => marked(3),
  z1: () => marked(4),
  d1: () => (devAnswers++ === 0 ? 'I am not able to mark this script.' : marked(2)),
};
type SentBody = { system: string; messages: { content: ({ type: 'image'; source: { data: string } } | { type: 'text'; text: string })[] }[] };
const sent: SentBody[] = [];
function stubVendor() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as SentBody;
      sent.push(body);
      const labels = body.messages[0].content.flatMap((p) => (p.type === 'image' ? [labelOf(new Uint8Array(Buffer.from(p.source.data, 'base64'))) ?? ''] : []));
      if (body.system.includes('photographed page')) {
        return anthropicOk([JSON.stringify({ pages: labels.flatMap((l, i) => (READINGS[l] ? [{ page: i + 1, ...READINGS[l] }] : [])) })]);
      }
      return anthropicOk([(MARKS[labels[0]] ?? (() => 'Sorry.'))()]);
    })
  );
}

// ---- the school's marking jobs through the runner ------------------------------------------------------------------------

const queue = createPgJobQueue(platform as never);
const deps = { asSchool, queue, storage: store };
const handlers: Record<string, JobHandler> = {
  'marking.read': markingReadHandler(deps),
  'marking.group': markingGroupHandler(deps),
  'marking.mark': markingMarkHandler(deps),
};
// The sweeper's runs until nothing is due; a job waiting to retry is made due at once.
async function drain() {
  for (let i = 0; i < 60; i++) {
    await owner(`update jobs set next_run_at = now() - interval '1 second' where status = 'pending'`);
    if ((await runJobs({ handlers, queue, longJobs: true })).claimed === 0) return;
  }
  throw new Error('the jobs did not settle');
}
const jobRow = (r: Record<string, unknown>): ClaimedJob => ({
  jobId: r.job_id as string,
  type: r.type as string,
  payload: r.payload as Record<string, unknown>,
  attempts: Number(r.attempts),
  maxAttempts: Number(r.max_attempts),
  schoolId: r.school_id as string,
  idempotencyKey: r.idempotency_key as string,
});

let examId = '';
let paperA = '';
let paperB = '';
let upload = '';
const ids: Record<string, string> = {};
const pageBytes: Record<string, Uint8Array> = {};
const LABELS = ['m1', 'm2', 'm3', 'z1', 'z2', 'z3', 'd1', 'd2', 'd3'];
for (const l of LABELS) pageBytes[l] = fakeJpeg(l);
const sheetOf = async (student: string) => (await owner(`select sheet_id from marking_sheets where paper_id = $1 and student_id = $2 and state <> 'set_aside'`, [paperA, student]))[0]?.sheet_id as string;
const switchAi = (on: boolean, profiles = ['exams.read_pages', 'exams.mark']) =>
  owner(`update control.ai_profiles set provider_id = $2, model = $3, enabled = $4 where profile_id = any($1::text[])`, [profiles, on ? 'anthropic' : null, on ? 'test-vision' : null, on]);

beforeAll(async () => {
  process.env.AI_CREDENTIALS_KEY = randomBytes(32).toString('base64');
  process.env.AI_CREDENTIALS_KEY_VERSION = '1';
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, board, is_test_fixture) values ('${A}', 'School A', 'IN-HR', 'CBSE', true), ('${B}', 'School B', 'IN-DL', 'CBSE', true);
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'principal@a.example', 'principal', 'Priya Principal', true), ('${T_MATHS}', '${A}', 'tara@a.example', 'teacher', 'Tara Maths', true),
      ('${T_OTHER}', '${A}', 'omar@a.example', 'teacher', 'Omar Other', true), ('${ACCOUNTANT}', '${A}', 'anil@a.example', 'accountant', 'Anil Accountant', true);
    insert into teachers (teacher_id, school_id, user_id, name) values (gen_random_uuid(), '${A}', '${T_MATHS}', 'Tara Maths'), (gen_random_uuid(), '${A}', '${T_OTHER}', 'Omar Other');
    insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values ('${SESSION}', '${A}', '2026-27', '2026-04-01', '2027-03-31', true);
    insert into classes (class_id, school_id, name, grade, section) values ('${C7A}', '${A}', '7', '7', 'A'), ('${C7B}', '${A}', '7', '7', 'B');
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Mathematics');
    insert into teacher_subjects (school_id, teacher_id, subject_id, class_id)
      select '${A}', t.teacher_id, x.subject_id, x.class_id from teachers t join (values ('${T_MATHS}'::uuid, '${MATHS}'::uuid, '${C7A}'::uuid), ('${T_OTHER}', '${MATHS}', '${C7B}')) x(user_id, subject_id, class_id) on x.user_id = t.user_id;
    insert into students (student_id, school_id, admission_no, name, class_id, roll_no, status) values
      ('${K1}', '${A}', 'A-1', 'Meera Sharma', '${C7A}', '1', 'active'), ('${K2}', '${A}', 'A-2', 'Zoya Khan', '${C7A}', '2', 'active'),
      ('${K3}', '${A}', 'A-3', 'Dev Patel', '${C7A}', '3', 'active'), ('${K7B}', '${A}', 'B-1', 'Kabir Rao', '${C7B}', '1', 'active');
    insert into syllabus_units (unit_id, school_id, class_id, subject_id, position, chapter, topic) values
      ('${UNIT_FR}', '${A}', '${C7A}', '${MATHS}', 1, 'Fractions', 'Adding fractions'), ('${UNIT_DEC}', '${A}', '${C7A}', '${MATHS}', 2, 'Decimals', 'Tenths'),
      ('${UNIT_7B}', '${A}', '${C7B}', '${MATHS}', 1, 'Fractions', 'Adding fractions');
    insert into school_module_entitlements (school_id, module_id, enabled, source, limits) values ('${A}', 'exams', true, 'plan', '{"ai_marking_pages": 100}')
      on conflict (school_id, module_id) do update set enabled = true, limits = excluded.limits;
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
  const saved = await as(tMaths, (c) =>
    saveSetup(c, actor(tMaths), paperA, {
      setup: { language: 'en', guidance: 'Method marks count.', choiceCounts: { A: 1 } },
      questions: [
        { label: '1', component: 'theory', maxMarks: 4, unitId: UNIT_FR, kind: 'short', prompt: 'Add 1/2 and 1/4.', answerKey: '3/4', steps: [{ step: 'Common denominator', marks: 2 }, { step: 'Sum', marks: 2 }] },
        { label: '2', component: 'theory', maxMarks: 6, unitId: UNIT_DEC, kind: 'numerical', prompt: 'Write 0.7 as a fraction.', answerKey: '7/10', steps: [] },
        { label: '3(a)', component: 'theory', maxMarks: 10, choiceGroup: 'A', unitId: UNIT_FR, kind: 'long', prompt: 'Fractions on a number line.', answerKey: '', steps: [] },
        { label: '3(b)', component: 'theory', maxMarks: 10, choiceGroup: 'A', unitId: UNIT_DEC, kind: 'long', prompt: 'Decimals in money.', answerKey: '', steps: [] },
      ],
    })
  );
  expect(saved.ok).toBe(true);
  // Control: Anthropic cleared for children by the founder, its key saved; the two tasks wait for their switch.
  await owner(`update control.ai_providers set cleared_for_minors = true, cleared_terms_url = 'https://example.org/terms', cleared_at = now(), cleared_by = $1 where provider_id = 'anthropic'`, [FOUNDER]);
  const sealed = sealAiKey(aiEncryptionKey()!, 'anthropic', ANTHROPIC_KEY);
  await owner(`insert into control.ai_credentials (provider_id, ciphertext, iv, tag, key_version, key_last4, set_by) values ('anthropic', $1, $2, $3, $4, 'WXYZ', $5)`, [sealed.ciphertext, sealed.iv, sealed.tag, sealed.keyVersion, FOUNDER]);
  stubVendor();
}, 120_000);
afterAll(async () => {
  vi.unstubAllGlobals();
  await db?.stop();
});

describe('starting an upload (C347)', () => {
  it('refused for the wrong person, a paper with no questions, and while AI marking is off; then made', async () => {
    expect(await start(accountant, paperA)).toMatchObject({ status: 403, body: { code: 'not_allowed' } });
    expect(await start(tOther, paperA)).toMatchObject({ status: 404 });
    expect(await start(tMaths, paperA, { mode: 'everything', files: 1 })).toMatchObject({ status: 400 });
    expect(await start(tMaths, paperA, { mode: 'combined', files: 0 })).toMatchObject({ status: 400 });
    // 7-B's paper has no questions yet.
    expect(await start(tOther, paperB)).toMatchObject({ status: 409, body: { code: 'questions' } });
    // The plan gives pages, but Control has not chosen a provider for the two tasks.
    expect(await start(tMaths, paperA)).toMatchObject({ status: 409, body: { code: 'ai_off', why: 'no_provider' } });
    await switchAi(true);
    const made = await start(tMaths, paperA);
    expect(made.status).toBe(201);
    upload = made.body.uploadId;
    expect((await owner(`select created_by, closed_at from marking_uploads where upload_id = $1`, [upload]))[0]).toEqual({ created_by: T_MATHS, closed_at: null });
  });
});

describe('page pictures (C350)', () => {
  it('a page that is not a JPEG, too large or too small is refused, and nothing is kept', async () => {
    const big = new Uint8Array(PAGE_MAX_BYTES + 1);
    big.set(fakeJpeg('big'));
    expect(await send(tMaths, upload, [{ fileNo: 1, pageNo: 1, bytes: new Uint8Array(Buffer.from('%PDF-1.7')) }])).toMatchObject({ status: 400, body: { code: 'not_a_page', at: 0 } });
    expect(await send(tMaths, upload, [{ fileNo: 1, pageNo: 1, bytes: big }])).toMatchObject({ status: 413, body: { code: 'too_large' } });
    expect(await send(tMaths, upload, [{ fileNo: 1, pageNo: 1, bytes: fakeJpeg('wide', 2600, 2000) }])).toMatchObject({ status: 413, body: { code: 'too_large' } });
    expect(await send(tMaths, upload, [{ fileNo: 1, pageNo: 1, bytes: fakeJpeg('tiny', 120, 160) }])).toMatchObject({ status: 400, body: { code: 'too_small' } });
    expect(await send(tMaths, upload, [{ fileNo: 1, pageNo: 0, bytes: pageBytes.m1 }])).toMatchObject({ status: 400 });
    expect(await send(tMaths, upload, Array.from({ length: 7 }, (_, i) => ({ fileNo: 1, pageNo: i + 1, bytes: pageBytes.m1 })))).toMatchObject({ status: 400 });
    // Another class's teacher reaches no upload of this paper.
    expect(await send(tOther, upload, [{ fileNo: 1, pageNo: 1, bytes: pageBytes.m1 }])).toMatchObject({ status: 404 });
    expect(await send(accountant, upload, [{ fileNo: 1, pageNo: 1, bytes: pageBytes.m1 }])).toMatchObject({ status: 403 });
    expect(store.files.size).toBe(0);
    expect(await owner(`select count(*)::int as n from marking_pages`)).toEqual([{ n: 0 }]);
  });

  it('the class’s scan arrives a few pages at a time; each is kept under the school’s folder before its row', async () => {
    const first = await send(tMaths, upload, LABELS.slice(0, 6).map((l, i) => ({ fileNo: 1, pageNo: i + 1, bytes: pageBytes[l] })));
    expect(first.status).toBe(200);
    const second = await send(tMaths, upload, LABELS.slice(6).map((l, i) => ({ fileNo: 1, pageNo: i + 7, bytes: pageBytes[l] })));
    expect(second.status).toBe(200);
    for (const [i, p] of [...first.body.pages, ...second.body.pages].entries()) {
      expect(p).toMatchObject({ fileNo: 1, pageNo: i + 1, duplicate: false });
      ids[LABELS[i]] = p.pageId;
    }
    const rows = await owner(`select page_id, storage_key, state, width, height, bytes from marking_pages where upload_id = $1 order by page_no`, [upload]);
    expect(rows.map((r: { state: string }) => r.state)).toEqual(Array(9).fill('new'));
    expect(rows[0]).toMatchObject({ storage_key: `${A}/marking/${paperA}/${ids.m1}.jpg`, width: 1400, height: 2000, bytes: pageBytes.m1.length });
    expect([...store.files.keys()].sort()).toEqual(rows.map((r: { storage_key: string }) => r.storage_key).sort());
  });

  it('a retried request answers with the pages already kept and keeps nothing new; a page already on the paper is a duplicate', async () => {
    const again = await send(tMaths, upload, LABELS.slice(6).map((l, i) => ({ fileNo: 1, pageNo: i + 7, bytes: pageBytes[l] })));
    expect(again).toMatchObject({ status: 200 });
    expect(again.body.pages.map((p: { pageId: string }) => p.pageId)).toEqual([ids.d1, ids.d2, ids.d3]);
    expect(store.files.size).toBe(9);
    const twice = await send(tMaths, upload, [{ fileNo: 1, pageNo: 10, bytes: pageBytes.m1 }]);
    expect(twice).toMatchObject({ status: 200, body: { pages: [{ fileNo: 1, pageNo: 10, duplicate: true }] } });
    expect((await owner(`select state from marking_pages where page_id = $1`, [twice.body.pages[0].pageId]))[0].state).toBe('duplicate');
    // A duplicate is never read, so it is not counted against the month's pages.
    expect(await as(tMaths, (c) => pagesThisMonth(c, A))).toBe(9);
  });

  it('the month’s pages: a request that would pass the plan’s limit keeps nothing', async () => {
    await owner(`update school_module_entitlements set limits = '{"ai_marking_pages": 10}' where school_id = $1 and module_id = 'exams'`, [A]);
    expect(await send(tMaths, upload, [{ fileNo: 2, pageNo: 1, bytes: fakeJpeg('n1') }, { fileNo: 2, pageNo: 2, bytes: fakeJpeg('n2') }])).toMatchObject({ status: 409, body: { code: 'limit' } });
    await owner(`update school_module_entitlements set limits = '{"ai_marking_pages": 9}' where school_id = $1 and module_id = 'exams'`, [A]);
    expect(await start(tMaths, paperA)).toMatchObject({ status: 409, body: { code: 'limit' } });
    expect(store.files.size).toBe(10);
    await owner(`update school_module_entitlements set limits = '{"ai_marking_pages": 100}' where school_id = $1 and module_id = 'exams'`, [A]);
  });
});

describe('a page picture, read under the viewer’s own row rules', () => {
  it('the class’s teacher gets the JPEG; another class’s teacher, the accountant and any other page get 404', async () => {
    const res = await picture(tMaths, ids.m1);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toBe('private, max-age=300');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(pageBytes.m1);
    expect((await picture(tOther, ids.m1)).status).toBe(404);
    expect((await picture(accountant, ids.m1)).status).toBe(404);
    expect((await picture(tMaths, u(999))).status).toBe(404);
    expect((await picture(tMaths, 'not-a-page')).status).toBe(404);
  });

  it('503 when the store does not give the picture', async () => {
    const key = `${A}/marking/${paperA}/${ids.m2}.jpg`;
    const kept = store.files.get(key)!;
    store.files.delete(key);
    try {
      expect(await picture(tMaths, ids.m2).then((r) => r.status)).toBe(503);
    } finally {
      store.files.set(key, kept);
    }
  });
});

describe('closing an upload and the school’s marking jobs (C347)', () => {
  it('closing queues the pages for reading, eight a job; closing again queues nothing more; no page comes after', async () => {
    expect(await close(tOther, upload)).toMatchObject({ status: 404 });
    expect(await close(tMaths, upload)).toMatchObject({ status: 200, body: { closed: true, runs: 2 } });
    expect(await close(tMaths, upload)).toMatchObject({ status: 200, body: { closed: true, runs: 2 } });
    const jobs = await owner(`select type, idempotency_key, payload, school_id from jobs where type like 'marking.%' order by idempotency_key`);
    expect(jobs.map((j: { idempotency_key: string }) => j.idempotency_key)).toEqual([`marking.read:${upload}:0`, `marking.read:${upload}:1`]);
    expect(jobs[0].payload.pageIds).toEqual(LABELS.slice(0, 8).map((l) => ids[l]));
    expect(jobs[1].payload.pageIds).toEqual([ids.d3]);
    expect(jobs.every((j: { school_id: string }) => j.school_id === A)).toBe(true);
    expect(await send(tMaths, upload, [{ fileNo: 3, pageNo: 1, bytes: fakeJpeg('late') }])).toMatchObject({ status: 409, body: { code: 'upload_closed' } });
    // Review of #318: an upload closed ten minutes ago whose pages are still unread (their reading stopped) is read
    // again when the teacher presses once more; the new jobs are taken away here so the class below reads once.
    const closedAt = (await owner(`select closed_at from marking_uploads where upload_id = $1`, [upload]))[0].closed_at;
    await owner(`update marking_uploads set closed_at = now() - interval '11 minutes' where upload_id = $1`, [upload]);
    expect(await close(tMaths, upload)).toMatchObject({ status: 200, body: { runs: 2 } });
    const again = await owner(`select idempotency_key from jobs where idempotency_key like $1`, [`marking.read:${upload}:%:again:%`]);
    expect(again).toHaveLength(2);
    await owner(`delete from jobs where idempotency_key like $1`, [`marking.read:${upload}:%:again:%`]);
    await owner(`update marking_uploads set closed_at = $2 where upload_id = $1`, [upload, closedAt]);
  });

  it('a whole class goes through read, group and mark: matched, marked scripts; a bad answer fails that script only', async () => {
    await drain();
    expect((await owner(`select state, count(*)::int as n from marking_pages where upload_id = $1 group by state order by state`, [upload]))).toEqual([
      { state: 'blank', n: 1 },
      { state: 'duplicate', n: 1 },
      { state: 'read', n: 8 },
    ]);
    const sheets = await owner(`select student_id, matched_by, state, flags, failure, ai_provider, ai_model, prompt_version from marking_sheets where upload_id = $1 order by student_id`, [upload]);
    expect(sheets).toEqual([
      { student_id: K1, matched_by: 'roll', state: 'marked', flags: [], failure: null, ai_provider: 'anthropic', ai_model: 'test-vision', prompt_version: 'v1' },
      { student_id: K2, matched_by: 'roll', state: 'marked', flags: [], failure: null, ai_provider: 'anthropic', ai_model: 'test-vision', prompt_version: 'v1' },
      { student_id: K3, matched_by: 'roll', state: 'failed', flags: [], failure: 'bad_answer', ai_provider: null, ai_model: null, prompt_version: null },
    ]);
    const meera = await owner(
      `select q.label, m.ai_marks::text, m.attempted, m.error_type, m.page_id, m.marks from marking_marks m join marking_questions q using (school_id, question_id) where m.sheet_id = $1 order by q.position`,
      [await sheetOf(K1)]
    );
    expect(meera).toEqual([
      { label: '1', ai_marks: '3.0', attempted: true, error_type: 'calculation', page_id: ids.m1, marks: null },
      { label: '2', ai_marks: '6.0', attempted: true, error_type: 'none', page_id: ids.m1, marks: null },
      { label: '3(a)', ai_marks: '8.0', attempted: true, error_type: 'incomplete', page_id: ids.m2, marks: null },
      { label: '3(b)', ai_marks: '0.0', attempted: false, error_type: 'not_attempted', page_id: null, marks: null },
    ]);
    // Zoya's blank page was never sent to the AI to mark: her script went as two pictures.
    const zoyaCall = sent.find((b) => b.system.includes('marking one student') && b.messages[0].content.some((p) => p.type === 'image' && labelOf(new Uint8Array(Buffer.from(p.source.data, 'base64'))) === 'z1'));
    expect(zoyaCall?.messages[0].content.filter((p) => p.type === 'image')).toHaveLength(2);
    // Two reading requests and three marking requests, metered with counts only.
    expect(sent.filter((b) => b.system.includes('photographed page'))).toHaveLength(2);
    expect(sent.filter((b) => b.system.includes('marking one student'))).toHaveLength(3);
    expect(await owner(`select profile_id, sum(requests)::int as requests from control.ai_usage group by profile_id order by profile_id`)).toEqual([
      { profile_id: 'exams.mark', requests: 3 },
      { profile_id: 'exams.read_pages', requests: 2 },
    ]);
    expect((await owner(`select count(*)::int as n from jobs where type like 'marking.%' and status <> 'succeeded'`))[0].n).toBe(0);
  });

  it('nothing sent to the AI names a child, the roster, the school or the exam', () => {
    for (const body of sent) {
      const words = [body.system, ...body.messages.flatMap((m) => m.content.flatMap((p) => (p.type === 'text' ? [p.text] : [])))].join('\n');
      for (const name of NAMES) expect(words, name).not.toContain(name);
      expect(words).not.toContain(A);
    }
  });

  it('every job run twice changes nothing more and asks the AI nothing more', async () => {
    const snapshot = async () => ({
      marks: await owner(`select sheet_id, question_id, ai_marks::text, attempted from marking_marks order by sheet_id, question_id`),
      sheets: await owner(`select sheet_id, state, attempts, flags from marking_sheets order by sheet_id`),
      pages: await owner(`select page_id, state, sheet_id from marking_pages order by page_id`),
      jobs: await owner(`select idempotency_key from jobs order by idempotency_key`),
      usage: await owner(`select profile_id, requests from control.ai_usage order by profile_id`),
    });
    const before = await snapshot();
    const calls = sent.length;
    for (const r of await owner(`select * from jobs where type like 'marking.%' order by created_at`)) await handlers[r.type](jobRow(r));
    expect(await snapshot()).toEqual(before);
    expect(sent.length).toBe(calls);
  });

  it('a crafted job does nothing: pages of another upload, a script or upload that is not there, a bad payload', async () => {
    const before = await owner(`select page_id, state from marking_pages order by page_id`);
    const calls = sent.length;
    const other = (await start(tMaths, paperA, { mode: 'per_file', files: 1 })).body.uploadId as string;
    // Closed with no page of its own (as owner: closing through the route would make its empty scripts at once).
    await owner(`update marking_uploads set closed_at = now() where upload_id = $1`, [other]);
    const job = (type: string, payload: Record<string, unknown>) => jobRow({ job_id: u(701), type, payload, attempts: 1, max_attempts: 3, school_id: A, idempotency_key: 'crafted' });
    // A run naming the first upload's pages under another upload of the same paper.
    await handlers['marking.read'](job('marking.read', { uploadId: other, pageIds: [ids.m1] }));
    await handlers['marking.read'](job('marking.read', { uploadId: u(990), pageIds: [ids.m1] }));
    await handlers['marking.group'](job('marking.group', { uploadId: u(991) }));
    await handlers['marking.mark'](job('marking.mark', { sheetId: u(992) }));
    await expect(handlers['marking.read'](job('marking.read', { uploadId: upload, pageIds: Array(9).fill(ids.m1) }))).rejects.toThrow(/bad payload/);
    await expect(handlers['marking.mark'](job('marking.mark', { sheetId: 'x' }))).rejects.toThrow(/bad payload/);
    await expect(handlers['marking.mark']({ ...job('marking.mark', { sheetId: u(992) }), schoolId: null })).rejects.toThrow(/no school/);
    expect(await owner(`select page_id, state from marking_pages order by page_id`)).toEqual(before);
    expect(await owner(`select count(*)::int as n from jobs where idempotency_key like $1`, [`%${other}%`])).toEqual([{ n: 0 }]);
    expect(sent.length).toBe(calls);
  });

  it('the AI never wrote a mark of the paper', async () => {
    expect(await owner(`select count(*)::int as n from marks where paper_id = $1`, [paperA])).toEqual([{ n: 0 }]);
  });
});

describe('marking a script again', () => {
  it('the teacher asks again: the job is queued once, and the script is marked', async () => {
    const dev = await sheetOf(K3);
    expect(await markAgain(tOther, dev)).toMatchObject({ status: 404 });
    expect(await markAgain(accountant, dev)).toMatchObject({ status: 403 });
    expect(await markAgain(tMaths, dev)).toMatchObject({ status: 200, body: { queued: true } });
    // Pressed again: it already waits, so nothing more is queued.
    expect(await markAgain(tMaths, dev)).toMatchObject({ status: 409, body: { code: 'state' } });
    // One job when the script was made, one when the teacher asked again.
    const keys = (await owner(`select idempotency_key, status from jobs where type = 'marking.mark' and payload ->> 'sheetId' = $1 order by created_at`, [dev])) as { idempotency_key: string; status: string }[];
    expect(keys.map((k) => k.status)).toEqual(['succeeded', 'pending']);
    expect(new Set(keys.map((k) => k.idempotency_key)).size).toBe(2);
    expect(keys.every((k) => k.idempotency_key.startsWith(`marking.mark:${dev}:`))).toBe(true);
    await drain();
    expect((await owner(`select state, failure from marking_sheets where sheet_id = $1`, [dev]))[0]).toEqual({ state: 'marked', failure: null });
    expect(await owner(`select count(*)::int as n from marks where paper_id = $1`, [paperA])).toEqual([{ n: 0 }]);
  });

  it('while AI marking is off it is refused before the teacher’s changes are cleared; the job records it as off', async () => {
    const zoya = await sheetOf(K2);
    const q1 = (await owner(`select question_id from marking_questions where paper_id = $1 and label = '1'`, [paperA]))[0].question_id;
    expect(await as(tMaths, (c) => changeSheet(c, actor(tMaths), zoya, { questions: [{ questionId: q1, marks: 3.5 }] }))).toEqual({ ok: true });
    await switchAi(false, ['exams.mark']);
    expect(await markAgain(tMaths, zoya)).toMatchObject({ status: 409, body: { code: 'ai_off', why: 'no_provider' } });
    expect((await owner(`select marks::text from marking_marks where sheet_id = $1 and question_id = $2`, [zoya, q1]))[0].marks).toBe('3.5');
    // Asked while it was on, and switched off before its job ran: the script fails as 'ai_off', for the teacher to retry.
    expect(await as(tMaths, (c) => askToMarkAgain(c, actor(tMaths), zoya))).toEqual({ ok: true });
    const calls = sent.length;
    await handlers['marking.mark'](jobRow({ job_id: u(700), type: 'marking.mark', payload: { sheetId: zoya }, attempts: 1, max_attempts: 3, school_id: A, idempotency_key: 'test' }));
    expect((await owner(`select state, failure from marking_sheets where sheet_id = $1`, [zoya]))[0]).toEqual({ state: 'failed', failure: 'ai_off' });
    expect(sent.length).toBe(calls);
    await switchAi(true, ['exams.mark']);
  });
});

describe('pages that cannot be read, and AI marking switched off', () => {
  it('a page the AI gives no reading for is tried again, then kept as failed, and its script waits for the teacher', async () => {
    const second = (await start(tMaths, paperA, { mode: 'per_file', files: 1 })).body.uploadId as string;
    const res = await send(tMaths, second, [{ fileNo: 1, pageNo: 1, bytes: fakeJpeg('x1') }]);
    expect(res.status).toBe(200);
    expect(await close(tMaths, second)).toMatchObject({ status: 200, body: { runs: 1 } });
    await drain();
    const read = await owner(`select attempts, status from jobs where idempotency_key = $1`, [`marking.read:${second}:0`]);
    expect(read).toEqual([{ attempts: 3, status: 'succeeded' }]);
    expect((await owner(`select state, reading from marking_pages where upload_id = $1`, [second]))[0]).toEqual({ state: 'failed', reading: null });
    const sheet = (await owner(`select student_id, state, flags, failure from marking_sheets where upload_id = $1`, [second]))[0];
    // Matched to no one, with an unreadable page; the stand-in had no marks for it either: it fails on its own.
    expect(sheet).toMatchObject({ student_id: null, state: 'failed', failure: 'bad_answer' });
    expect(sheet.flags.sort()).toEqual(['identity', 'unreadable']);
  });

  it('switched off after the upload was closed: the pages wait, and the reading job dies saying why', async () => {
    const third = (await start(tMaths, paperA, { mode: 'per_file', files: 1 })).body.uploadId as string;
    expect((await send(tMaths, third, [{ fileNo: 1, pageNo: 1, bytes: fakeJpeg('m9') }])).status).toBe(200);
    expect((await close(tMaths, third)).status).toBe(200);
    await switchAi(false, ['exams.read_pages']);
    const calls = sent.length;
    await drain();
    const job = (await owner(`select status, last_error from jobs where idempotency_key = $1`, [`marking.read:${third}:0`]))[0];
    expect(job.status).toBe('dead');
    expect(job.last_error).toMatch(/AI marking is off/);
    expect((await owner(`select state from marking_pages where upload_id = $1`, [third]))[0].state).toBe('new');
    expect(sent.length).toBe(calls);
    // While it is off, no upload is closed or started.
    expect(await start(tMaths, paperA)).toMatchObject({ status: 409, body: { code: 'ai_off' } });
    await switchAi(true, ['exams.read_pages']);
  });
});
