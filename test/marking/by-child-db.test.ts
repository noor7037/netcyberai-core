import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { anthropicOk } from '../ai/streams';
import { fakeJpeg, labelOf } from './fake-jpeg';

// Scanning child by child (C230-AJ part 4) on the whole schema, as the app's own database role: the phone's scan screen
// starts a by_child upload, sends each child's pages naming the child the teacher chose in roll order, and closes it;
// the school's marking jobs read, group and mark as they always do. The acceptance test: three children; child 2's sheet
// reads another child's roll number, so script 2 is flagged 'mismatch' and is still child 2's (never moved); Absent
// marks child 3 absent. Every name and number is made up.

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
import { makeExam } from '@/lib/exams/exams';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import { runJobs } from '@/lib/jobs/runner';
import type { JobHandler } from '@/lib/jobs/types';
import { markingGroupHandler, markingMarkHandler, markingReadHandler } from '@/lib/marking/pipeline';
import { approveSheets, chooseChild, markingOverview } from '@/lib/marking/review';
import { saveSetup } from '@/lib/marking/setup';
import type { MemoryFileStorage } from '@/lib/storage/file-storage';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';
import { POST as startRoute } from '@/app/api/app/marking/papers/[paperId]/uploads/route';
import { POST as absentRoute } from '@/app/api/app/marking/papers/[paperId]/absent/route';
import { POST as pagesRoute } from '@/app/api/app/marking/uploads/[uploadId]/pages/route';
import { POST as closeRoute } from '@/app/api/app/marking/uploads/[uploadId]/close/route';

const store = supabaseFileStorage as unknown as MemoryFileStorage;
const u = (n: number) => `ab000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const A = u(1);
const [PRINCIPAL, T_MATHS, FOUNDER] = [u(11), u(12), u(19)];
const [C7A, C7B] = [u(21), u(22)];
const MATHS = u(31);
const SESSION = u(41);
const UNIT = u(51);
const [K1, K2, K3, K7B] = [u(61), u(62), u(63), u(65)];
const ANTHROPIC_KEY = `sk-ant-${'b'.repeat(30)}WXYZ`;

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
type Page = { fileNo: number; pageNo: number; bytes: Uint8Array; childId?: string };
const form = (uploadId: string, pages: Page[]) => {
  const f = new FormData();
  for (const p of pages) {
    f.append('fileNo', String(p.fileNo));
    f.append('pageNo', String(p.pageNo));
    if (p.childId) f.append('childId', p.childId);
    f.append('page', new Blob([p.bytes], { type: 'image/jpeg' }), 'page.jpg');
  }
  return new NextRequest(`http://localhost/api/app/marking/uploads/${uploadId}/pages`, { method: 'POST', body: f });
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = async (who: Who, fn: () => Promise<Response>): Promise<{ status: number; body: any }> => {
  state.claims = claims(who);
  state.tenant = (c: { role: string; sub: string; schoolId: string }, fn2: (x: unknown) => Promise<unknown>) => as({ role: c.role, user: c.sub, school: c.schoolId }, fn2);
  const res = await fn();
  return { status: res.status, body: await res.json() };
};
const start = (body: unknown) => call(tMaths, () => startRoute(json(`/api/app/marking/papers/${paperA}/uploads`, body), { params: { paperId: paperA } }));
const send = (uploadId: string, pages: Page[], who: Who = tMaths) => call(who, () => pagesRoute(form(uploadId, pages), { params: { uploadId } }));
const close = (uploadId: string) => call(tMaths, () => closeRoute(json(`/api/app/marking/uploads/${uploadId}/close`), { params: { uploadId } }));
const absent = (studentIds: string[]) => call(tMaths, () => absentRoute(json(`/api/app/marking/papers/${paperA}/absent`, { studentIds }), { params: { paperId: paperA } }));

// ---- the stand-in model: what each page shows, by the label in its picture ------------------------------------------------

const READINGS: Record<string, Record<string, unknown>> = {
  // Child 1's sheet: her own name and roll number.
  a1: { first_page: true, name: 'Meera Sharma', roll_no: '1', exam_no: null, class_section: '7-A', page_number: 1, blank: false, legible: true, answer_page: true, id_document: false },
  a2: { first_page: false, name: null, roll_no: null, exam_no: null, class_section: null, page_number: 2, blank: false, legible: true, answer_page: true, id_document: false },
  // Child 2 was chosen, but the sheet reads child 3's roll number (a sheet picked up from the wrong pile).
  b1: { first_page: true, name: null, roll_no: '03', exam_no: null, class_section: '7-A', page_number: 1, blank: false, legible: true, answer_page: true, id_document: false },
  b2: { first_page: false, name: null, roll_no: null, exam_no: null, class_section: null, page_number: 2, blank: false, legible: true, answer_page: true, id_document: false },
};
const marked =
  '```json\n' +
  JSON.stringify({
    questions: [
      { label: '1', attempted: true, marks: 3, steps: [], note: 'Good.', reason: 'Method right.', error_type: 'none', confidence: 0.9, page: 1, y_from: 0.1, y_to: 0.3 },
      { label: '2', attempted: true, marks: 4, steps: [], note: 'Good.', reason: 'Complete.', error_type: 'none', confidence: 0.9, page: 1, y_from: 0.4, y_to: 0.6 },
    ],
    strengths: 'Neat working.',
    improve: 'Check sums.',
    practice: [],
  }) +
  '\n```';
function stubVendor() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { system: string; messages: { content: ({ type: 'image'; source: { data: string } } | { type: 'text' })[] }[] };
      const labels = body.messages[0].content.flatMap((p) => (p.type === 'image' ? [labelOf(new Uint8Array(Buffer.from(p.source.data, 'base64'))) ?? ''] : []));
      if (body.system.includes('photographed page')) return anthropicOk([JSON.stringify({ pages: labels.flatMap((l, i) => (READINGS[l] ? [{ page: i + 1, ...READINGS[l] }] : [])) })]);
      return anthropicOk([marked]);
    })
  );
}

const queue = createPgJobQueue(platform as never);
const deps = { asSchool, queue, storage: store };
const handlers: Record<string, JobHandler> = {
  'marking.read': markingReadHandler(deps),
  'marking.group': markingGroupHandler(deps),
  'marking.mark': markingMarkHandler(deps),
};
async function drain() {
  for (let i = 0; i < 60; i++) {
    await owner(`update jobs set next_run_at = now() - interval '1 second' where status = 'pending'`);
    if ((await runJobs({ handlers, queue, longJobs: true })).claimed === 0) return;
  }
  throw new Error('the jobs did not settle');
}

let paperA = '';
let upload = '';
const sheetOf = async (student: string) => (await owner(`select sheet_id, student_id, matched_by, state, flags, match_note from marking_sheets where paper_id = $1 and student_id = $2`, [paperA, student]))[0];

beforeAll(async () => {
  process.env.AI_CREDENTIALS_KEY = randomBytes(32).toString('base64');
  process.env.AI_CREDENTIALS_KEY_VERSION = '1';
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, board, is_test_fixture) values ('${A}', 'School A', 'IN-HR', 'CBSE', true);
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'principal@a.example', 'principal', 'Priya Principal', true), ('${T_MATHS}', '${A}', 'tara@a.example', 'teacher', 'Tara Maths', true);
    insert into teachers (teacher_id, school_id, user_id, name) values (gen_random_uuid(), '${A}', '${T_MATHS}', 'Tara Maths');
    insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values ('${SESSION}', '${A}', '2026-27', '2026-04-01', '2027-03-31', true);
    insert into classes (class_id, school_id, name, grade, section) values ('${C7A}', '${A}', '7', '7', 'A'), ('${C7B}', '${A}', '7', '7', 'B');
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Mathematics');
    insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) select '${A}', t.teacher_id, '${MATHS}', '${C7A}' from teachers t where t.user_id = '${T_MATHS}';
    insert into students (student_id, school_id, admission_no, name, class_id, roll_no, status) values
      ('${K1}', '${A}', 'A-1', 'Meera Sharma', '${C7A}', '1', 'active'), ('${K2}', '${A}', 'A-2', 'Zoya Khan', '${C7A}', '2', 'active'),
      ('${K3}', '${A}', 'A-3', 'Dev Patel', '${C7A}', '3', 'active'), ('${K7B}', '${A}', 'B-1', 'Kabir Rao', '${C7B}', '1', 'active');
    insert into syllabus_units (unit_id, school_id, class_id, subject_id, position, chapter, topic) values ('${UNIT}', '${A}', '${C7A}', '${MATHS}', 1, 'Fractions', 'Adding fractions');
    insert into school_module_entitlements (school_id, module_id, enabled, source, limits) values ('${A}', 'exams', true, 'plan', '{"ai_marking_pages": 100}')
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
  const made = await as(principal, (c) =>
    makeExam(c, actor(principal), { name: 'Unit test', sessionId: SESSION, term: 'Term 1', papers: [{ classId: C7A, subjectId: MATHS, date: '2026-10-01', unitIds: [UNIT], maxima: { theory: 10 } }] })
  );
  paperA = (await owner(`select paper_id from exam_papers where exam_id = $1`, [(made as { examId: string }).examId]))[0].paper_id;
  const saved = await as(tMaths, (c) =>
    saveSetup(c, actor(tMaths), paperA, {
      setup: { language: 'en', guidance: '', choiceCounts: {} },
      questions: [
        { label: '1', component: 'theory', maxMarks: 5, unitId: UNIT, kind: 'short', prompt: 'Add 1/2 and 1/4.', answerKey: '3/4', steps: [] },
        { label: '2', component: 'theory', maxMarks: 5, unitId: UNIT, kind: 'short', prompt: 'Add 1/3 and 1/6.', answerKey: '1/2', steps: [] },
      ],
    })
  );
  expect(saved.ok).toBe(true);
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

describe('a by_child upload: each file is the child the teacher chose (C230-AJ)', () => {
  it('starts as its own mode; every page must name a candidate, the same one for every page of a file', async () => {
    const made = await start({ mode: 'by_child', files: 3 });
    expect(made.status).toBe(201);
    upload = made.body.uploadId;
    expect((await owner(`select mode from marking_uploads where upload_id = $1`, [upload]))[0].mode).toBe('by_child');
    // No child named, a child of another class, a malformed id: nothing is kept.
    expect(await send(upload, [{ fileNo: 1, pageNo: 1, bytes: fakeJpeg('a1') }])).toMatchObject({ status: 409, body: { code: 'child' } });
    expect(await send(upload, [{ fileNo: 1, pageNo: 1, bytes: fakeJpeg('a1'), childId: K7B }])).toMatchObject({ status: 409, body: { code: 'child' } });
    expect(await send(upload, [{ fileNo: 1, pageNo: 1, bytes: fakeJpeg('a1'), childId: 'not-a-child' }])).toMatchObject({ status: 400 });
    expect(store.files.size).toBe(0);
    // Child 1, two pages; child 2, two pages (sent as the phone sends them, a few at a time).
    expect((await send(upload, [{ fileNo: 1, pageNo: 1, bytes: fakeJpeg('a1'), childId: K1 }, { fileNo: 1, pageNo: 2, bytes: fakeJpeg('a2'), childId: K1 }])).status).toBe(200);
    expect((await send(upload, [{ fileNo: 2, pageNo: 1, bytes: fakeJpeg('b1'), childId: K2 }])).status).toBe(200);
    // The same page sent again (a retry after a lost answer) keeps nothing new.
    expect((await send(upload, [{ fileNo: 2, pageNo: 1, bytes: fakeJpeg('b1'), childId: K2 }, { fileNo: 2, pageNo: 2, bytes: fakeJpeg('b2'), childId: K2 }])).status).toBe(200);
    // The principal may mark the paper, but this phone scan is the teacher's: nothing goes in under another session.
    expect(await send(upload, [{ fileNo: 3, pageNo: 1, bytes: fakeJpeg('c1'), childId: K3 }], principal)).toMatchObject({ status: 403 });
    // A page of file 2 naming another child than the file's: refused.
    expect(await send(upload, [{ fileNo: 2, pageNo: 3, bytes: fakeJpeg('b3'), childId: K3 }])).toMatchObject({ status: 409, body: { code: 'child' } });
    expect(await owner(`select file_no, page_no, claimed_student_id from marking_pages where upload_id = $1 order by file_no, page_no`, [upload])).toEqual([
      { file_no: 1, page_no: 1, claimed_student_id: K1 },
      { file_no: 1, page_no: 2, claimed_student_id: K1 },
      { file_no: 2, page_no: 1, claimed_student_id: K2 },
      { file_no: 2, page_no: 2, claimed_student_id: K2 },
    ]);
  });

  it('another mode names no child; the database holds the claim whatever the code does', async () => {
    const other = await start({ mode: 'per_file', files: 1 });
    expect(await send(other.body.uploadId, [{ fileNo: 1, pageNo: 1, bytes: fakeJpeg('x1'), childId: K1 }])).toMatchObject({ status: 409, body: { code: 'child' } });
    const page = (await owner(`select page_id, storage_key from marking_pages where upload_id = $1 and file_no = 1 and page_no = 1`, [upload]))[0];
    const raw = (claim: string | null, fileNo: number, up = upload) =>
      as(tMaths, (c) =>
        c.query(
          `insert into marking_pages (school_id, page_id, upload_id, paper_id, file_no, page_no, storage_key, sha256, bytes, width, height, claimed_student_id)
           values ($1, $2, $3, $4, $5, 9, $7, repeat('a', 64), 10, 1400, 2000, $6)`,
          [A, u(900 + fileNo), up, paperA, fileNo, claim, `${A}/marking/${paperA}/${u(900 + fileNo)}.jpg`]
        )
      );
    await expect(raw(null, 1)).rejects.toThrow(/names its child/);
    await expect(raw(K7B, 3)).rejects.toThrow(/class roll/);
    await expect(raw(K3, 1)).rejects.toThrow(/one file of a child-by-child upload is one child/);
    await expect(raw(K1, 1, other.body.uploadId)).rejects.toThrow(/only a child-by-child upload/);
    await expect(as(tMaths, (c) => c.query(`update marking_pages set claimed_student_id = $2 where page_id = $1`, [page.page_id, K3]))).rejects.toThrow(/names the child it was scanned for, once/);
  });

  it('read and marked as always: script 2 reads child 3’s roll number, so it is flagged and stays child 2’s', async () => {
    expect(await close(upload)).toMatchObject({ status: 200, body: { closed: true } });
    await drain();
    const one = await sheetOf(K1);
    const two = await sheetOf(K2);
    expect(one).toMatchObject({ matched_by: 'teacher', state: 'marked' });
    expect(one.flags).not.toContain('mismatch');
    expect(two).toMatchObject({ student_id: K2, matched_by: 'teacher', state: 'marked' });
    expect(two.flags).toContain('mismatch');
    expect(two.match_note.read).toEqual({ name: null, rollNo: '03', seatNo: null });
    // Never moved: child 3 has no script, and both of child 2's pages are in script 2.
    expect(await owner(`select count(*)::int as n from marking_sheets where paper_id = $1 and student_id = $2`, [paperA, K3])).toEqual([{ n: 0 }]);
    expect(await owner(`select count(*)::int as n from marking_pages where sheet_id = $1`, [two.sheet_id])).toEqual([{ n: 2 }]);
  });

  it('the hub’s one list shows it; it is not approved until a person confirms the child, by name or in the database', async () => {
    const overview = await as(tMaths, (c) => markingOverview(c, actor(tMaths), paperA));
    const two = await sheetOf(K2);
    expect(overview?.exceptions).toEqual([{ sheetId: two.sheet_id, kind: 'mismatch', student: { studentId: K2, name: 'Zoya Khan', rollNo: '2', seatNo: null }, read: { name: null, rollNo: '03', seatNo: null }, page: null }]);
    expect(await as(tMaths, (c) => approveSheets(c, actor(tMaths), paperA, [two.sheet_id]))).toEqual({ ok: false, reason: 'flagged', sheetId: two.sheet_id });
    expect(await as(tMaths, (c) => approveSheets(c, actor(tMaths), paperA, 'unflagged'))).toMatchObject({ ok: true });
    await expect(as(tMaths, (c) => c.query(`update marking_sheets set state = 'approved', approved_at = now() where sheet_id = $1`, [two.sheet_id]))).rejects.toThrow(/reads another child/);
    // One tap: "It is Zoya". The flag goes, the child stays, and it may be approved.
    expect(await as(tMaths, (c) => chooseChild(c, actor(tMaths), two.sheet_id, K2))).toEqual({ ok: true });
    expect((await sheetOf(K2)).flags).not.toContain('mismatch');
    expect(await as(tMaths, (c) => approveSheets(c, actor(tMaths), paperA, [two.sheet_id]))).toMatchObject({ ok: true, approved: 1 });
    expect(await owner(`select student_id, component, kind, score::float8 as score from marks where paper_id = $1 and student_id = $2`, [paperA, K2])).toEqual([{ student_id: K2, component: 'theory', kind: 'score', score: 7 }]);
    expect((await as(tMaths, (c) => markingOverview(c, actor(tMaths), paperA)))?.exceptions).toEqual([]);
  });

  it('Absent marks child 3 absent, not zero; a child who has a script cannot be', async () => {
    expect(await absent([K3])).toMatchObject({ status: 200, body: { ok: true, absent: 1 } });
    expect(await owner(`select component, kind, score from marks where paper_id = $1 and student_id = $2`, [paperA, K3])).toEqual([{ component: 'theory', kind: 'absent', score: null }]);
    expect(await absent([K1])).toMatchObject({ status: 400, body: { code: 'child' } });
  });
});
