import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { anthropicOk } from '../ai/streams';

// AQ-4 (docs/36 §1.3, C365): online tests on the whole schema. The teacher's side as the app's own role (app_user) in
// the teacher's tenant session; the family's side through School Link's real guardian context and the real pool, and
// the Family app's own route; the marking job in the school's marking session through the job runner, with the AI
// platform running for real and only the vendor replaced, at fetch, by a stand-in model. The acceptance test: "a child
// of another class or family sees nothing; an answer after the deadline is refused; a second attempt is refused; a
// timed-out test is marked from what was saved". Every name and number is made up.

vi.mock('@/lib/storage/supabase-file-storage', async () => {
  const { MemoryFileStorage } = await import('@/lib/storage/file-storage');
  return { supabaseFileStorage: new MemoryFileStorage() };
});

import { schoolJobContextStatements } from '@/lib/auth/db';
import { aiEncryptionKey, sealAiKey } from '@/lib/ai/credentials';
import type { FamilyOnlineQuestion, FamilyOnlineSitting } from '@/lib/contracts/marking';
import { makeExam } from '@/lib/exams/exams';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import { runJobs } from '@/lib/jobs/runner';
import type { JobHandler } from '@/lib/jobs/types';
import { approveSheets } from '@/lib/marking/review';
import { saveSetup } from '@/lib/marking/setup';
import { onlineMarkHandler, onlineSweepHandler } from '@/lib/online/mark';
import { closeTest, markOnlineAgain, onlineTestScreen, openTest, saveTest, scriptAnswers, setSitting, voidAttempt } from '@/lib/online/tests';
import { isoToIndiaLocal } from '@/lib/online/time';

const u = (n: number) => `a7400000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const f = (n: number) => `f7400000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B] = [u(1), u(2)];
const [PRINCIPAL, T_MATHS, T_OTHER, FOUNDER] = [u(11), u(12), u(13), u(19)];
const [C6A, C6B] = [u(21), u(22)];
const MATHS = u(31);
const SESSION = u(41);
const UNIT = u(51);
const [S1, S2, S3, S4] = [u(61), u(62), u(63), u(64)];
const [P1, P2, P3, P4] = [u(71), u(72), u(73), u(74)];
const [ACC1, ACC2, ACC3] = [f(1), f(2), f(3)];
const [CH1, CH2, CH3] = [f(11), f(12), f(13)];
const [L1, L2, L3] = [f(21), f(22), f(23)];
const ANTHROPIC_KEY = `sk-ant-${'b'.repeat(30)}WXYZ`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const tMaths: Who = { role: 'teacher', user: T_MATHS, school: A }; // teaches Mathematics in 6-A
const tOther: Who = { role: 'teacher', user: T_OTHER, school: A }; // teaches Mathematics in 6-B only
const guardian1: Who = { role: 'parent', user: P1, school: A };

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
const claims = (accountId: string) => ({ accountId, tokenVersion: 0, device: null });

// ---- the stand-in model --------------------------------------------------------------------------------------------------

type SentBody = { system: string; messages: unknown[] };
const sent: SentBody[] = [];
const MARKED = JSON.stringify({
  questions: [{ label: '4', attempted: true, marks: 3, steps: [{ step: 'Names the parts', awarded: 2, note: null }], note: 'Good, add one more point.', reason: 'Most points made.', error_type: 'incomplete', confidence: 0.9, page: null, y_from: null, y_to: null }],
  strengths: 'Clear words.',
  improve: 'Give one more example.',
  practice: [{ topic: 1, text: 'Three sums adding fractions.' }],
});
function stubVendor() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)) as SentBody);
      return anthropicOk([MARKED]);
    })
  );
}

// ---- the jobs ------------------------------------------------------------------------------------------------------------

const queue = createPgJobQueue(platform as never);
const handlers: Record<string, JobHandler> = {
  'online.mark': onlineMarkHandler({ asSchool }),
  'online.sweep': onlineSweepHandler({ platform }),
};
async function drain() {
  for (let i = 0; i < 30; i++) {
    await owner(`update jobs set next_run_at = now() - interval '1 second' where status = 'pending'`);
    if ((await runJobs({ handlers, queue, longJobs: true })).claimed === 0) return;
  }
  throw new Error('the jobs did not settle');
}

let paperA = '';
let paperB = '';
let testA = '';
const local = (ms: number) => isoToIndiaLocal(new Date(Date.now() + ms).toISOString());

beforeAll(async () => {
  process.env.AI_CREDENTIALS_KEY = randomBytes(32).toString('base64');
  process.env.AI_CREDENTIALS_KEY_VERSION = '1';
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-aq-4-online-tests-0123456789ab';
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, board, is_test_fixture) values ('${A}', 'School A', 'IN-HR', 'CBSE', false), ('${B}', 'School B', 'IN-DL', 'CBSE', false);
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Priya Principal', true), ('${T_MATHS}', '${A}', 't@a.invalid', 'teacher', 'Tara Maths', true),
      ('${T_OTHER}', '${A}', 'o@a.invalid', 'teacher', 'Omar Other', true);
    insert into teachers (teacher_id, school_id, user_id, name) values (gen_random_uuid(), '${A}', '${T_MATHS}', 'Tara Maths'), (gen_random_uuid(), '${A}', '${T_OTHER}', 'Omar Other');
    insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values ('${SESSION}', '${A}', '2026-27', '2026-04-01', '2027-03-31', true);
    insert into classes (class_id, school_id, name, grade, section) values ('${C6A}', '${A}', '6', '6', 'A'), ('${C6B}', '${A}', '6', '6', 'B');
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Mathematics');
    insert into teacher_subjects (school_id, teacher_id, subject_id, class_id)
      select '${A}', t.teacher_id, x.subject_id, x.class_id from teachers t join (values ('${T_MATHS}'::uuid, '${MATHS}'::uuid, '${C6A}'::uuid), ('${T_OTHER}', '${MATHS}', '${C6B}')) x(user_id, subject_id, class_id) on x.user_id = t.user_id;
    insert into students (student_id, school_id, admission_no, name, class_id, roll_no, status) values
      ('${S1}', '${A}', 'A-1', 'Aarav Kumar', '${C6A}', '1', 'active'), ('${S2}', '${A}', 'A-2', 'Bela Singh', '${C6A}', '2', 'active'),
      ('${S3}', '${A}', 'B-1', 'Chirag Rao', '${C6B}', '1', 'active'), ('${S4}', '${A}', 'A-3', 'Dia Shah', '${C6A}', '3', 'active');
    insert into parents (parent_id, school_id, name, phone, relation) values
      ('${P1}', '${A}', 'Rajesh Kumar', '9800000001', 'Father'), ('${P2}', '${A}', 'Sunita Singh', '9800000002', 'Mother'), ('${P3}', '${A}', 'Ravi Rao', '9800000003', 'Father'),
      ('${P4}', '${A}', 'Meena Shah', '9800000004', 'Mother');
    insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${P1}', '${S1}'), ('${A}', '${P2}', '${S2}'), ('${A}', '${P3}', '${S3}'), ('${A}', '${P4}', '${S4}');
    insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values
      ('${A}', '${S1}', 'core_records', true, 'school_attested', 'v1'), ('${A}', '${S2}', 'core_records', true, 'school_attested', 'v1'), ('${A}', '${S3}', 'core_records', true, 'school_attested', 'v1'),
      ('${A}', '${S4}', 'core_records', true, 'school_attested', 'v1');
    insert into syllabus_units (unit_id, school_id, class_id, subject_id, position, chapter, topic) values ('${UNIT}', '${A}', '${C6A}', '${MATHS}', 1, 'Fractions', 'Adding fractions');
    insert into school_module_entitlements (school_id, module_id, enabled, source, limits) values ('${A}', 'exams', true, 'plan', '{"ai_marking_pages": 100}')
      on conflict (school_id, module_id) do update set enabled = true, limits = excluded.limits;
    insert into family.accounts (account_id, email) values ('${ACC1}', 'one@example.org'), ('${ACC2}', 'two@example.org'), ('${ACC3}', 'three@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values
      ('${ACC1}', 'study_core', true, 'parent_tap', 'v1'), ('${ACC2}', 'study_core', true, 'parent_tap', 'v1'), ('${ACC3}', 'study_core', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values
      ('${CH1}', '${ACC1}', 'Aarav', 6, 'CBSE', 'en', 'en', 'IN-HR'), ('${CH2}', '${ACC2}', 'Bela', 6, 'CBSE', 'en', 'en', 'IN-HR'), ('${CH3}', '${ACC3}', 'Chirag', 6, 'CBSE', 'en', 'en', 'IN-HR');
    insert into family.school_links (link_id, account_id, school_id, parent_id) values ('${L1}', '${ACC1}', '${A}', '${P1}'), ('${L2}', '${ACC2}', '${A}', '${P2}'), ('${L3}', '${ACC3}', '${A}', '${P3}');
    insert into family.child_links (child_id, link_id, account_id, student_id) values ('${CH1}', '${L1}', '${ACC1}', '${S1}'), ('${CH2}', '${L2}', '${ACC2}', '${S2}'), ('${CH3}', '${L3}', '${ACC3}', '${S3}');
    update platform_settings set value = '["online.mark", "online.sweep"]'::jsonb where key = 'jobs.handlers';
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
    makeExam(c, actor(principal), {
      name: 'Unit test 2',
      sessionId: SESSION,
      term: 'Term 1',
      papers: [
        { classId: C6A, subjectId: MATHS, date: '2026-10-28', unitIds: [UNIT], maxima: { theory: 10 } },
        { classId: C6B, subjectId: MATHS, date: '2026-10-28', unitIds: [], maxima: { theory: 10 } },
      ],
    })
  );
  const papers = await owner(`select paper_id, class_id from exam_papers where exam_id = $1`, [(made as { examId: string }).examId]);
  paperA = papers.find((p: { class_id: string }) => p.class_id === C6A).paper_id;
  paperB = papers.find((p: { class_id: string }) => p.class_id === C6B).paper_id;
  const saved = await as(tMaths, (c) =>
    saveSetup(c, actor(tMaths), paperA, {
      setup: { language: 'en', guidance: 'Method marks count.', choiceCounts: {}, wrongMarks: 1 },
      questions: [
        { label: '1', component: 'theory', maxMarks: 2, choiceGroup: null, unitId: UNIT, kind: 'objective', prompt: 'Which is half of 1?', answerKey: 'SECRET-KEY-1', steps: [],
          options: [{ key: 'A', text: '1/4' }, { key: 'B', text: '1/2' }, { key: 'C', text: '2' }, { key: 'D', text: '1/3' }], correct: { keys: ['B'] } },
        { label: '2', component: 'theory', maxMarks: 2, choiceGroup: null, unitId: UNIT, kind: 'objective', prompt: 'Choose every fraction equal to one half.', answerKey: '', steps: [],
          options: [{ key: 'A', text: '2/4' }, { key: 'B', text: '2/3' }, { key: 'C', text: '3/6' }], correct: { keys: ['A', 'C'] } },
        { label: '3', component: 'theory', maxMarks: 2, choiceGroup: null, unitId: UNIT, kind: 'numerical', prompt: 'Write 3/4 as a decimal.', answerKey: 'SECRET-KEY-3', steps: [], correct: { value: 0.75, tolerance: 0.01 } },
        { label: '4', component: 'theory', maxMarks: 4, choiceGroup: null, unitId: UNIT, kind: 'short', prompt: 'Explain how to add 1/2 and 1/4.', answerKey: 'SECRET-KEY-4', steps: [{ step: 'SECRET-STEP common denominator', marks: 2 }] },
      ],
    })
  );
  expect(saved.ok).toBe(true);
  // Control: Anthropic chosen for the marking tasks, its key saved, but NOT yet cleared for children's words. The
  // database refuses that choice; were it there anyway (its rule switched off by hand, as test/ai/platform.test.ts
  // does), the AI platform itself refuses to send.
  await owner(`alter table control.ai_profiles disable trigger ai_profiles_minors_check`);
  try {
    await owner(`update control.ai_profiles set provider_id = 'anthropic', model = 'test-model', enabled = true where profile_id in ('exams.read_pages', 'exams.mark')`);
  } finally {
    await owner(`alter table control.ai_profiles enable trigger ai_profiles_minors_check`);
  }
  const sealed = sealAiKey(aiEncryptionKey()!, 'anthropic', ANTHROPIC_KEY);
  await owner(`insert into control.ai_credentials (provider_id, ciphertext, iv, tag, key_version, key_last4, set_by) values ('anthropic', $1, $2, $3, $4, 'WXYZ', $5)`, [sealed.ciphertext, sealed.iv, sealed.tag, sealed.keyVersion, FOUNDER]);
  stubVendor();
}, 120_000);
afterAll(async () => {
  vi.unstubAllGlobals();
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

const guardian = () => import('@/lib/online/guardian');
const familyLinks = async (account: string) => {
  const { withFamilyContext } = await import('@/lib/auth/db');
  const { activeLinks } = await import('@/lib/family/school');
  return withFamilyContext(claims(account), (c) => activeLinks(c, account));
};
const cookieFor = async (account: string, child: string) => {
  const { signFamilySession } = await import('@/lib/family/session');
  return `ncf_session=${await signFamilySession({ accountId: account, tokenVersion: 0, sessionId: `s-${account}` })}; ncf_child=${child}`;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const familyStep = async (cookie: string, testId: string, step: string, body: unknown = {}): Promise<{ status: number; body: any }> => {
  const mod = await import('@/app/api/family/tests/[testId]/[step]/route');
  const res = await mod.POST(new NextRequest(`http://localhost/api/family/tests/${testId}/${step}`, { method: 'POST', body: JSON.stringify(body), headers: { cookie } }), { params: { testId, step } });
  return { status: res.status, body: await res.json() };
};
const byLabel = (qs: FamilyOnlineQuestion[], label: string) => qs.find((q) => q.label === label) as FamilyOnlineQuestion;

describe('the teacher sets the test (C365)', () => {
  it('sits the paper online, saves its times, and opens it; another class’s teacher reaches nothing', async () => {
    expect(await as(tOther, (c) => onlineTestScreen(c, actor(tOther), paperA))).toBeNull();
    expect(await as(tOther, (c) => setSitting(c, actor(tOther), paperA, 'online'))).toEqual({ ok: false, reason: 'not_found' });
    // Times before the paper is sat online, or a window shorter than the minutes, are refused.
    expect(await as(tMaths, (c) => saveTest(c, actor(tMaths), paperA, { opensAt: local(-60_000), closesAt: local(2 * 3600_000), minutes: 30, shuffle: true }))).toEqual({ ok: false, reason: 'sitting' });
    expect(await as(tMaths, (c) => setSitting(c, actor(tMaths), paperA, 'online'))).toEqual({ ok: true });
    expect(await as(tMaths, (c) => saveTest(c, actor(tMaths), paperA, { opensAt: local(-60_000), closesAt: local(10 * 60_000), minutes: 30, shuffle: true }))).toEqual({ ok: false, reason: 'times' });
    expect(await as(tMaths, (c) => saveTest(c, actor(tMaths), paperA, { opensAt: local(-60_000), closesAt: local(2 * 3600_000), minutes: 3, shuffle: true }))).toEqual({ ok: false, reason: 'minutes' });
    expect(await as(tMaths, (c) => saveTest(c, actor(tMaths), paperA, { opensAt: local(-60_000), closesAt: local(2 * 3600_000), minutes: 30, shuffle: true }))).toEqual({ ok: true });
    // Saved but not opened: no family sees it.
    expect(await (await guardian()).readOnlineTests(claims(ACC1), L1, S1)).toEqual([]);
    expect(await as(tMaths, (c) => openTest(c, actor(tMaths), paperA))).toEqual({ ok: true });
    expect(await as(tMaths, (c) => openTest(c, actor(tMaths), paperA))).toEqual({ ok: false, reason: 'state' });
    const screen = await as(tMaths, (c) => onlineTestScreen(c, actor(tMaths), paperA));
    expect(screen).toMatchObject({ sitting: 'online', ready: true, mayChange: true, test: { minutes: 30, shuffle: true, openedBy: 'Tara Maths', closedAt: null } });
    testA = screen!.test!.testId;
    expect((await owner(`select opened_by from online_tests where test_id = $1`, [testA]))[0].opened_by).toBe(T_MATHS);
    // 6-B's paper is sat online too, but its test is never opened.
    expect(await as(tOther, (c) => setSitting(c, actor(tOther), paperB, 'online'))).toEqual({ ok: true });
  });
});

describe('a family sees only its own child’s class’s test (C365)', () => {
  it('lists the test for the child of the class; another class or family sees nothing and starts nothing', async () => {
    const g = await guardian();
    expect(await g.readOnlineTests(claims(ACC1), L1, S1)).toEqual([
      expect.objectContaining({ testId: testA, exam: 'Unit test 2', subject: 'Mathematics', minutes: 30, questions: 4, state: 'open', deadlineAt: null }),
    ]);
    // 6-B's child, and a guardian asking for another family's child.
    expect(await g.readOnlineTests(claims(ACC3), L3, S3)).toEqual([]);
    expect(await g.readOnlineTests(claims(ACC2), L2, S1)).toEqual([]);
    expect(await g.startOnlineTest(claims(ACC3), L3, S3, testA)).toMatchObject({ outcome: 'not_found', attemptId: null, questions: [] });
    expect(await g.startOnlineTest(claims(ACC2), L2, S1, testA)).toMatchObject({ outcome: 'not_found', attemptId: null, questions: [] });
    // Another family's link is not this account's: School Link refuses it outright.
    await expect(g.startOnlineTest(claims(ACC2), L1, S1, testA)).rejects.toThrow();
    // The family door: the child using the app now, matched by the parent.
    const { childOnlineTests } = await import('@/lib/family/online-tests');
    expect((await childOnlineTests(claims(ACC1), await familyLinks(ACC1), CH1)).map((t) => t.testId)).toEqual([testA]);
    expect(await childOnlineTests(claims(ACC3), await familyLinks(ACC3), CH3)).toEqual([]);
    expect(await owner(`select count(*)::int as n from online_attempts`)).toEqual([{ n: 0 }]);
  });
});

let attempt1 = '';
let sitting1: FamilyOnlineSitting;

describe('sitting the test (C365)', () => {
  it('starts one attempt through the Family app’s route, with the questions and never a correct answer, key or step', async () => {
    const r = await familyStep(await cookieFor(ACC1, CH1), testA, 'start');
    expect(r.status).toBe(200);
    sitting1 = r.body as FamilyOnlineSitting;
    expect(sitting1).toMatchObject({ outcome: 'started', attemptId: expect.any(String), deadlineAt: expect.any(String) });
    attempt1 = sitting1.attemptId as string;
    const text = JSON.stringify(r.body);
    for (const secret of ['SECRET', 'correct', 'answerKey', 'answer_key', 'steps', '0.75', 'tolerance']) expect(text).not.toContain(secret);
    expect(sitting1.questions.map((q) => q.label).sort()).toEqual(['1', '2', '3', '4']);
    for (const q of sitting1.questions)
      expect(Object.keys(q).sort()).toEqual(['answer', 'choiceGroup', 'flagged', 'groupCount', 'input', 'kind', 'label', 'maxMarks', 'multi', 'n', 'options', 'prompt', 'questionId', 'section', 'seq'].sort());
    expect(byLabel(sitting1.questions, '1')).toMatchObject({ input: 'choice', multi: false, maxMarks: 2 });
    expect(byLabel(sitting1.questions, '1').options.map((o) => o.key).sort()).toEqual(['A', 'B', 'C', 'D']);
    expect(byLabel(sitting1.questions, '2')).toMatchObject({ input: 'choice', multi: true });
    expect(byLabel(sitting1.questions, '3')).toMatchObject({ input: 'number', options: [] });
    expect(byLabel(sitting1.questions, '4')).toMatchObject({ input: 'text', options: [] });
    // The database set the deadline: the start plus the minutes, by its own clock.
    const row = (await owner(`select extract(epoch from deadline_at - started_at)::int as s, state from online_attempts where attempt_id = $1`, [attempt1]))[0];
    expect(row).toEqual({ s: 30 * 60, state: 'open' });
    // The raw function's columns: none is a key.
    const cols = await owner(`select unnest(proargnames) as n from pg_proc where proname = 'guardian_online_questions'`);
    expect(cols.map((c: { n: string }) => c.n)).not.toEqual(expect.arrayContaining(['correct']));
  });

  it('saves each answer as it is given; an older retried save never overwrites a newer one; a wrong shape is refused', async () => {
    const cookie = await cookieFor(ACC1, CH1);
    const q = (label: string) => byLabel(sitting1.questions, label).questionId;
    const save = (label: string, answer: unknown, seq: number, flagged = false) => familyStep(cookie, testA, 'answer', { attemptId: attempt1, questionId: q(label), answer, flagged, seq });
    expect(await save('1', { keys: ['A'] }, 1)).toMatchObject({ status: 200, body: { result: 'saved' } });
    expect(await save('1', { keys: ['B'] }, 3)).toMatchObject({ status: 200 });
    expect(await save('1', { keys: ['C'] }, 2)).toMatchObject({ status: 200 }); // a late retry of an older save
    expect(await save('2', { keys: ['A'] }, 1, true)).toMatchObject({ status: 200 });
    expect(await save('3', { value: 0.75 }, 1)).toMatchObject({ status: 200 });
    expect(await save('4', { text: 'Aarav says: make the bottoms the same, 1/2 is 2/4, then 2/4 + 1/4 = 3/4.' }, 1)).toMatchObject({ status: 200 });
    // Two keys on a one-answer question, a key it does not have, words for a choice, a number for words.
    expect(await save('1', { keys: ['A', 'B'] }, 9)).toMatchObject({ status: 400, body: { error: 'bad_answer' } });
    expect(await save('1', { keys: ['F'] }, 9)).toMatchObject({ status: 400, body: { error: 'bad_answer' } });
    expect(await save('1', { text: 'B' }, 9)).toMatchObject({ status: 400 });
    expect(await save('4', { value: 3 }, 9)).toMatchObject({ status: 400 });
    expect(await save('4', { text: 'x'.repeat(4001) }, 9)).toMatchObject({ status: 400 });
    // Another family's child's attempt.
    expect(await familyStep(await cookieFor(ACC2, CH2), testA, 'answer', { attemptId: attempt1, questionId: q('1'), answer: { keys: ['D'] }, flagged: false, seq: 99 })).toMatchObject({ status: 404 });
    const kept = await owner(`select q.label, w.answer, w.flagged from online_answers w join marking_questions q on q.question_id = w.question_id where w.attempt_id = $1 order by q.label`, [attempt1]);
    expect(kept.map((r: { label: string; answer: unknown; flagged: boolean }) => [r.label, r.answer, r.flagged])).toEqual([
      ['1', { keys: ['B'] }, false],
      ['2', { keys: ['A'] }, true],
      ['3', { value: 0.75 }, false],
      ['4', { text: 'Aarav says: make the bottoms the same, 1/2 is 2/4, then 2/4 + 1/4 = 3/4.' }, false],
    ]);
  });

  it('counts each time the test screen is left; the teacher sees it in roll order with no score', async () => {
    const cookie = await cookieFor(ACC1, CH1);
    expect(await familyStep(cookie, testA, 'left', { attemptId: attempt1 })).toMatchObject({ status: 200, body: { result: 'noted' } });
    expect(await familyStep(cookie, testA, 'left', { attemptId: attempt1 })).toMatchObject({ status: 200, body: { result: 'noted' } });
    const screen = await as(tMaths, (c) => onlineTestScreen(c, actor(tMaths), paperA));
    expect(screen!.attempts.map((a) => [a.student.name, a.state, a.leftCount])).toEqual([
      ['Aarav Kumar', 'open', 2],
      ['Bela Singh', 'not_started', 0],
      ['Dia Shah', 'not_started', 0],
    ]);
    expect(JSON.stringify(screen)).not.toMatch(/"(marks|score|total|rank)"/);
  });

  it('a child’s answers and attempts are never read by a parent session, and nothing is written outside the functions', async () => {
    expect(await as(guardian1, (c) => c.query(`select count(*)::int as n from online_attempts`).then((r: { rows: unknown[] }) => r.rows))).toEqual([{ n: 0 }]);
    expect(await as(guardian1, (c) => c.query(`select count(*)::int as n from online_answers`).then((r: { rows: unknown[] }) => r.rows))).toEqual([{ n: 0 }]);
    expect(await as(guardian1, (c) => c.query(`select count(*)::int as n from online_tests`).then((r: { rows: unknown[] }) => r.rows))).toEqual([{ n: 0 }]);
    await expect(as(tMaths, (c) => c.query(`insert into online_answers (school_id, attempt_id, paper_id, question_id, answer) values ($1, $2, $3, $4, null)`, [A, attempt1, paperA, byLabel(sitting1.questions, '1').questionId]))).rejects.toThrow(/permission denied/);
    await expect(as(tMaths, (c) => c.query(`update online_attempts set left_count = 0 where attempt_id = $1`, [attempt1]))).rejects.toThrow(/permission denied/);
    await expect(as(tMaths, (c) => c.query(`update online_attempts set state = 'submitted' where attempt_id = $1`, [attempt1]))).rejects.toThrow(/only voided/);
  });

  it('once a child has started, the questions as read are fixed; the key may still be corrected; the times are fixed', async () => {
    const q1 = byLabel(sitting1.questions, '1').questionId;
    await expect(as(tMaths, (c) => c.query(`update marking_questions set prompt = 'Something else?' where question_id = $1`, [q1]))).rejects.toThrow(/fixed once a child has started/);
    await expect(as(tMaths, (c) => c.query(`delete from marking_questions where question_id = $1`, [q1]))).rejects.toThrow(/fixed once a child has started/);
    expect(await as(tMaths, (c) => c.query(`update marking_questions set answer_key = 'SECRET-KEY-1b' where question_id = $1`, [q1]).then((r: { rowCount: number }) => r.rowCount))).toBe(1);
    expect(await as(tMaths, (c) => saveTest(c, actor(tMaths), paperA, { opensAt: local(-60_000), closesAt: local(3 * 3600_000), minutes: 40, shuffle: false }))).toEqual({ ok: false, reason: 'fixed' });
    expect(await as(tMaths, (c) => setSitting(c, actor(tMaths), paperA, 'written'))).toEqual({ ok: false, reason: 'fixed' });
  });
});

describe('submitting, and one attempt only (C365)', () => {
  it('submits; a second start gives no second attempt; an answer after submitting is refused', async () => {
    const cookie = await cookieFor(ACC1, CH1);
    expect(await familyStep(cookie, testA, 'submit', { attemptId: attempt1 })).toMatchObject({ status: 200, body: { result: 'submitted' } });
    expect(await familyStep(cookie, testA, 'submit', { attemptId: attempt1 })).toMatchObject({ status: 200, body: { result: 'done' } });
    expect(await familyStep(cookie, testA, 'start')).toMatchObject({ status: 200, body: { outcome: 'done', attemptId: null, questions: [] } });
    expect(await familyStep(cookie, testA, 'answer', { attemptId: attempt1, questionId: byLabel(sitting1.questions, '1').questionId, answer: { keys: ['C'] }, flagged: false, seq: 50 })).toMatchObject({
      status: 409,
      body: { error: 'closed' },
    });
    expect(await owner(`select count(*)::int as n from online_attempts where student_id = $1`, [S1])).toEqual([{ n: 1 }]);
    // The database holds it too: one attempt per child and test.
    await expect(owner(`insert into online_attempts (school_id, test_id, paper_id, student_id, deadline_at, question_order) values ($1, $2, $3, $4, now() + interval '1 hour', $5)`, [A, testA, paperA, S1, [byLabel(sitting1.questions, '1').questionId]])).rejects.toThrow(/duplicate key/);
    expect((await (await guardian()).readOnlineTests(claims(ACC1), L1, S1))[0]).toMatchObject({ state: 'done' });
  });

  it('the script is made and marked by rules; the written answer never goes to a provider not cleared for children', async () => {
    await drain();
    expect(sent).toHaveLength(0);
    const sheet = (await owner(`select sheet_id, student_id, source, matched_by, upload_id, state, flags from marking_sheets where paper_id = $1`, [paperA]))[0];
    expect(sheet).toMatchObject({ student_id: S1, source: 'online', matched_by: 'online', upload_id: null, state: 'marked', flags: ['not_all_read'] });
    expect((await owner(`select sheet_id from online_attempts where attempt_id = $1`, [attempt1]))[0].sheet_id).toBe(sheet.sheet_id);
    const marks = await owner(`select q.label, m.attempted, m.ai_marks::float as m, m.error_type from marking_marks m join marking_questions q on q.question_id = m.question_id where m.sheet_id = $1 order by q.label`, [sheet.sheet_id]);
    // 1 right: 2; 2 one of two right keys: wrong, the setup's 1 off; 3 within the tolerance: 2. 4 waits for the AI.
    expect(marks).toEqual([
      { label: '1', attempted: true, m: 2, error_type: 'none' },
      { label: '2', attempted: true, m: -1, error_type: null },
      { label: '3', attempted: true, m: 2, error_type: 'none' },
    ]);
    // The review screen reads the typed answers in place of pictures.
    const typed = await as(tMaths, (c) => scriptAnswers(c, actor(tMaths), sheet.sheet_id));
    expect(typed).toMatchObject({ state: 'submitted', leftCount: 2 });
    expect(typed!.answers.map((a) => a.answer)).toEqual([{ keys: ['B'] }, { keys: ['A'] }, { value: 0.75 }, { text: expect.stringContaining('make the bottoms the same') }]);
    expect(await as(tOther, (c) => scriptAnswers(c, actor(tOther), sheet.sheet_id))).toBeNull();
  });

  it('cleared for children, "Mark again" sends only the written answer, the child’s name scrubbed, and keeps the AI’s marks', async () => {
    await owner(`update control.ai_providers set cleared_for_minors = true, cleared_terms_url = 'https://example.org/terms', cleared_at = now(), cleared_by = $1 where provider_id = 'anthropic'`, [FOUNDER]);
    const sheetId = (await owner(`select sheet_id from marking_sheets where paper_id = $1`, [paperA]))[0].sheet_id;
    expect(await as(tMaths, (c) => markOnlineAgain(c, actor(tMaths), sheetId))).toEqual({ ok: true, queued: true });
    await drain();
    expect(sent).toHaveLength(1);
    const body = JSON.stringify(sent[0]);
    expect(body).toContain('make the bottoms the same');
    expect(body).toContain('SECRET-KEY-4');
    expect(body).not.toContain('Aarav');
    expect(body).not.toContain('Kumar');
    // Only the written question: never the choice and number questions, their keys or the child's choices.
    expect(body).not.toContain('Which is half of 1?');
    expect(body).not.toContain('SECRET-KEY-1');
    expect(body).not.toContain('Write 3/4 as a decimal.');
    const sheet = (await owner(`select state, flags, prompt_version, strengths from marking_sheets where sheet_id = $1`, [sheetId]))[0];
    expect(sheet).toEqual({ state: 'marked', flags: [], prompt_version: 'typed-v1', strengths: 'Clear words.' });
    const q4 = (await owner(`select m.ai_marks::float as m, m.ai_note, m.page_id from marking_marks m join marking_questions q on q.question_id = m.question_id where m.sheet_id = $1 and q.label = '4'`, [sheetId]))[0];
    expect(q4).toEqual({ m: 3, ai_note: 'Good, add one more point.', page_id: null });
    // Nothing was ever written to the paper's marks by a job.
    expect(await owner(`select count(*)::int as n from marks where paper_id = $1`, [paperA])).toEqual([{ n: 0 }]);
  });
});

describe('the deadline (C365)', () => {
  it('an answer after the deadline is refused; the sweep times the attempt out and its script is marked from what was saved', async () => {
    const g = await guardian();
    const sitting = await g.startOnlineTest(claims(ACC2), L2, S2, testA);
    expect(sitting.outcome).toBe('started');
    const attempt = sitting.attemptId as string;
    const q = (label: string) => byLabel(sitting.questions, label).questionId;
    expect(await g.saveOnlineAnswer(claims(ACC2), L2, S2, { attemptId: attempt, questionId: q('1'), answer: { keys: ['C'] }, flagged: false, seq: 1 })).toBe('saved');
    expect(await g.saveOnlineAnswer(claims(ACC2), L2, S2, { attemptId: attempt, questionId: q('2'), answer: { keys: ['A', 'C'] }, flagged: false, seq: 1 })).toBe('saved');
    // The clock runs out (the database's: the attempt's own times moved back an hour).
    await owner(`update online_attempts set started_at = started_at - interval '1 hour', deadline_at = deadline_at - interval '1 hour' where attempt_id = $1`, [attempt]);
    expect(await g.saveOnlineAnswer(claims(ACC2), L2, S2, { attemptId: attempt, questionId: q('3'), answer: { value: 0.75 }, flagged: false, seq: 1 })).toBe('closed');
    expect(await g.noteOnlineLeave(claims(ACC2), L2, S2, attempt)).toBe('closed');
    // The questions are no longer given.
    expect((await g.startOnlineTest(claims(ACC2), L2, S2, testA)).questions).toEqual([]);
    await onlineSweepHandler({ platform })({ jobId: u(900), type: 'online.sweep', payload: {}, attempts: 1, maxAttempts: 2, schoolId: null, idempotencyKey: 'test-sweep' });
    expect((await owner(`select state, submitted_at = deadline_at as at_deadline from online_attempts where attempt_id = $1`, [attempt]))[0]).toEqual({ state: 'timed_out', at_deadline: true });
    const before = sent.length;
    await drain();
    // No words were written, so nothing went to the AI.
    expect(sent.length).toBe(before);
    const sheetId = (await owner(`select sheet_id from online_attempts where attempt_id = $1`, [attempt]))[0].sheet_id;
    expect((await owner(`select state, flags, student_id from marking_sheets where sheet_id = $1`, [sheetId]))[0]).toEqual({ state: 'marked', flags: [], student_id: S2 });
    const marks = await owner(`select q.label, m.attempted, m.ai_marks::float as m, m.error_type from marking_marks m join marking_questions q on q.question_id = m.question_id where m.sheet_id = $1 order by q.label`, [sheetId]);
    expect(marks).toEqual([
      { label: '1', attempted: true, m: -1, error_type: null },
      { label: '2', attempted: true, m: 2, error_type: 'none' },
      { label: '3', attempted: false, m: 0, error_type: 'not_attempted' },
      { label: '4', attempted: false, m: 0, error_type: 'not_attempted' },
    ]);
    const screen = await as(tMaths, (c) => onlineTestScreen(c, actor(tMaths), paperA));
    expect(screen!.attempts.map((a) => [a.student.name, a.state, a.marked])).toEqual([
      ['Aarav Kumar', 'submitted', true],
      ['Bela Singh', 'timed_out', true],
      ['Dia Shah', 'not_started', false],
    ]);
  });
});

describe('approval and families (C365, C215)', () => {
  it('a person’s approval writes the paper’s marks through saveMarks; a part never goes below 0', async () => {
    expect(await as(tMaths, (c) => approveSheets(c, actor(tMaths), paperA, 'unflagged'))).toMatchObject({ ok: true, approved: 2 });
    expect(await owner(`select student_id, component, kind, score::float as score, entered_by from marks where paper_id = $1 order by student_id`, [paperA])).toEqual([
      // 2 - 1 + 2 + 3; and -1 + 2 + 0 + 0.
      { student_id: S1, component: 'theory', kind: 'score', score: 6, entered_by: T_MATHS },
      { student_id: S2, component: 'theory', kind: 'score', score: 1, entered_by: T_MATHS },
    ]);
  });

  it('nothing of it reaches the family before publication', async () => {
    expect(await as(guardian1, (c) => c.query(`select count(*)::int as n from marking_sheets`).then((r: { rows: unknown[] }) => r.rows))).toEqual([{ n: 0 }]);
    expect(await as(guardian1, (c) => c.query(`select count(*)::int as n from marking_marks`).then((r: { rows: unknown[] }) => r.rows))).toEqual([{ n: 0 }]);
    expect(await as(guardian1, (c) => c.query(`select count(*)::int as n from public.guardian_marking_sheets()`).then((r: { rows: unknown[] }) => r.rows))).toEqual([{ n: 0 }]);
    const listed = await (await guardian()).readOnlineTests(claims(ACC1), L1, S1);
    expect(JSON.stringify(listed)).not.toMatch(/marks|score/);
  });

  it('voiding ends an attempt being sat and makes no script; once closed, no attempt starts', async () => {
    // Dia's guardian is on record but has no Family app: her attempt is started by the database's own function, in a
    // guardian's session as School Link opens it.
    const asP4 = <T>(sql: string, params: unknown[]) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db.pg.transaction(async (tx: any) => {
        await tx.query('set local role app_user');
        for (const [k, v] of [['app.current_tenant_id', A], ['app.current_role', 'parent'], ['app.current_user_id', P4]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
        return (await tx.query(sql, params)).rows as T[];
      });
    const [started] = await asP4<{ outcome: string; attempt_id: string }>(`select outcome, attempt_id from public.guardian_online_start($1, $2)`, [testA, S4]);
    expect(started.outcome).toBe('started');
    expect(await as(tMaths, (c) => voidAttempt(c, actor(tMaths), paperA, S1))).toEqual({ ok: false, reason: 'marked' });
    expect(await as(tMaths, (c) => voidAttempt(c, actor(tMaths), paperA, S4))).toEqual({ ok: true });
    expect(await as(tMaths, (c) => voidAttempt(c, actor(tMaths), paperA, S4))).toEqual({ ok: false, reason: 'state' });
    expect((await owner(`select state, voided_by from online_attempts where attempt_id = $1`, [started.attempt_id]))[0]).toEqual({ state: 'voided', voided_by: T_MATHS });
    const qid = (await owner(`select question_id from marking_questions where paper_id = $1 and label = '1'`, [paperA]))[0].question_id;
    expect(await asP4(`select public.guardian_online_save($1, $2, $3, '{"keys":["B"]}'::jsonb, false, 1) as r`, [started.attempt_id, S4, qid])).toEqual([{ r: 'closed' }]);
    expect(await asP4(`select public.guardian_online_submit($1, $2) as r`, [started.attempt_id, S4])).toEqual([{ r: 'done' }]);
    await onlineSweepHandler({ platform })({ jobId: u(901), type: 'online.sweep', payload: {}, attempts: 1, maxAttempts: 2, schoolId: null, idempotencyKey: 'test-sweep-2' });
    await drain();
    expect((await owner(`select sheet_id from online_attempts where attempt_id = $1`, [started.attempt_id]))[0].sheet_id).toBeNull();

    expect(await as(tMaths, (c) => closeTest(c, actor(tMaths), paperA))).toEqual({ ok: true });
    expect(await as(tMaths, (c) => closeTest(c, actor(tMaths), paperA))).toEqual({ ok: false, reason: 'state' });
    expect(await (await guardian()).readOnlineTests(claims(ACC1), L1, S1)).toEqual([]);
    expect((await as(tMaths, (c) => onlineTestScreen(c, actor(tMaths), paperA)))!.test).toMatchObject({ closedBy: 'Tara Maths' });
  });
});
