import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { anthropicOk } from '../ai/streams';

// Question papers from what was taught (docs/36 §5 AQ-2; C362, C363) on the whole schema, as the app's own database
// role: the paper maker's routes, and the school's papers.make job through the job runner in the school's own job
// session. The AI platform runs for real (the task switched on in Control, the key opened, the metering); only the
// vendor is replaced, at fetch, by a stand-in that writes a question for each slot it is sent. The acceptance test: "a
// class with a taught log gets a paper whose chapters and marks follow the log and the blueprint; bank questions come
// first; a used question is skipped; nothing unkept prints." Every name and number is made up.

const state = vi.hoisted(() => ({ claims: null as unknown }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (c: any, fn: any) => as({ role: c.role, user: c.sub, school: c.schoolId }, fn),
}));

import { schoolJobContextStatements } from '@/lib/auth/db';
import { aiEncryptionKey, sealAiKey } from '@/lib/ai/credentials';
import { makeExam } from '@/lib/exams/exams';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import { runJobs } from '@/lib/jobs/runner';
import type { JobHandler } from '@/lib/jobs/types';
import { saveSetup } from '@/lib/marking/setup';
import { papersMakeHandler } from '@/lib/papers/make';
import { GET as makeGet, POST as makePost } from '@/app/api/app/marking/papers/[paperId]/make/route';
import { POST as keepPost } from '@/app/api/app/marking/papers/[paperId]/keep/route';
import { GET as printGet } from '@/app/api/app/marking/papers/[paperId]/print/route';
import { GET as bankGet, POST as bankPost } from '@/app/api/app/marking/papers/[paperId]/bank/route';
import { POST as replacePost } from '@/app/api/app/marking/questions/[questionId]/replace/route';
import { POST as makeAllPost } from '@/app/api/app/exams/[examId]/make-papers/route';

const u = (n: number) => `a9200000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B] = [u(1), u(2)];
const [PRINCIPAL, T_MATHS, T_OTHER, ACCOUNTANT, PRINCIPAL_B, FOUNDER] = [u(11), u(12), u(13), u(14), u(15), u(19)];
const [C7A, C7B] = [u(21), u(22)];
const MATHS = u(31);
const SESSION = u(41);
const [FR_ADD, FR_CMP, DEC, GEO, ALG, U7B] = [u(51), u(52), u(53), u(54), u(55), u(56)];
const NAMES = ['Meera Sharma', 'Zoya Khan', 'Tara Maths', 'Omar Other', 'Priya Principal', 'School A', 'Half-yearly'];
const ANTHROPIC_KEY = `sk-ant-${'a'.repeat(30)}WXYZ`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const tMaths: Who = { role: 'teacher', user: T_MATHS, school: A }; // teaches Mathematics in 7-A
const tOther: Who = { role: 'teacher', user: T_OTHER, school: A }; // teaches Mathematics in 7-B only
const accountant: Who = { role: 'accountant', user: ACCOUNTANT, school: A };
const principalB: Who = { role: 'principal', user: PRINCIPAL_B, school: B };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function as<T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
}
// The school's job session, exactly as production opens it (withSchoolJobContext's statements).
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
const owner = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;
const refused = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return 'allowed';
  } catch (err) {
    return (err as Error).message;
  }
};

// ---- the routes, as the app's own session calls them -------------------------------------------------------------------

const claims = (who: Who) => ({ sub: who.user, role: who.role, schoolId: who.school, membershipId: u(80), tokenVersion: 0, aal: 'aal1', sessionId: u(81) });
const req = (url: string, method: 'GET' | 'POST', body?: unknown) => new NextRequest(`http://localhost${url}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = async (who: Who, fn: () => Promise<Response>): Promise<{ status: number; body: any }> => {
  state.claims = claims(who);
  const res = await fn();
  return { status: res.status, body: await res.json() };
};
const screen = (who: Who, paperId: string) => call(who, () => makeGet(req(`/api/app/marking/papers/${paperId}/make`, 'GET'), { params: { paperId } }));
const make = (who: Who, paperId: string, body: unknown = {}) => call(who, () => makePost(req(`/api/app/marking/papers/${paperId}/make`, 'POST', body), { params: { paperId } }));
const keep = (who: Who, paperId: string) => call(who, () => keepPost(req(`/api/app/marking/papers/${paperId}/keep`, 'POST'), { params: { paperId } }));
const print = (who: Who, paperId: string) => call(who, () => printGet(req(`/api/app/marking/papers/${paperId}/print`, 'GET'), { params: { paperId } }));
const bank = (who: Who, paperId: string, query = '') => call(who, () => bankGet(req(`/api/app/marking/papers/${paperId}/bank${query}`, 'GET'), { params: { paperId } }));
const pick = (who: Who, paperId: string, bankIds: string[]) => call(who, () => bankPost(req(`/api/app/marking/papers/${paperId}/bank`, 'POST', { bankIds }), { params: { paperId } }));
const replace = (who: Who, questionId: string, body: unknown) => call(who, () => replacePost(req(`/api/app/marking/questions/${questionId}/replace`, 'POST', body), { params: { questionId } }));
const makeAll = (who: Who, examId: string) => call(who, () => makeAllPost(req(`/api/app/exams/${examId}/make-papers`, 'POST'), { params: { examId } }));

// ---- the stand-in model --------------------------------------------------------------------------------------------------

type Slot = { slot: number; chapter: string; topic: string; kind: string; marks: number; difficulty: string };
type SentBody = { system: string; messages: { content: string }[] };
const sent: SentBody[] = [];
let written = 0;
// Slot numbers the stand-in answers badly the first time it sees them (steps that do not add up): dropped, asked again.
const badOnce = new Set<number>([3]);
const question = (s: Slot) => {
  written += 1;
  const prompt = `${s.chapter}, ${s.topic}: question ${s.slot}.${written} (${s.difficulty})`;
  const steps = badOnce.delete(s.slot) ? [{ step: 'Method', marks: s.marks + 1 }] : [{ step: 'Method and answer', marks: s.marks }];
  if (s.kind === 'objective') {
    return { slot: s.slot, prompt, options: ['one', 'two', 'three', 'four'].map((t, i) => ({ key: 'ABCD'[i], text: `${t} ${written}` })), correct: 'B', answer_key: 'B, because it is two.', steps };
  }
  if (s.kind === 'numerical') return { slot: s.slot, prompt, options: [], correct: null, value: 12, tolerance: 0, answer_key: '12', steps };
  return { slot: s.slot, prompt, options: [], correct: null, answer_key: `A model answer for ${s.topic}.`, steps };
};
function stubVendor() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as SentBody;
      sent.push(body);
      const text = String(body.messages[0].content);
      const slots = JSON.parse(text.split('\n')[1]) as Slot[];
      return anthropicOk(['```json\n', JSON.stringify({ questions: slots.map(question) }), '\n```']);
    })
  );
}

// ---- the job through the runner ------------------------------------------------------------------------------------------

const queue = createPgJobQueue(platform as never);
const handlers: Record<string, JobHandler> = { 'papers.make': papersMakeHandler({ asSchool }) };
async function drain() {
  for (let i = 0; i < 20; i++) {
    await owner(`update jobs set next_run_at = now() - interval '1 second' where status = 'pending'`);
    if ((await runJobs({ handlers, queue, longJobs: true })).claimed === 0) return;
  }
  throw new Error('the jobs did not settle');
}

let halfExam = '';
let paperHalf = ''; // 7-A, half-yearly, theory 80 and internal 20
let paperHalfB = ''; // 7-B, half-yearly
let paperUnit2 = ''; // 7-A, unit test 2, theory 25
const questionsOf = (paperId: string) =>
  owner(
    `select q.question_id, q.label, q.component, q.max_marks::float as marks, q.choice_group, q.kind, q.prompt, q.options, q.correct, q.section, q.difficulty, q.bank_id, q.updated_by, u.chapter
       from marking_questions q left join syllabus_units u on u.unit_id = q.unit_id where q.paper_id = $1 order by q.position`,
    [paperId]
  );

beforeAll(async () => {
  process.env.AI_CREDENTIALS_KEY = randomBytes(32).toString('base64');
  process.env.AI_CREDENTIALS_KEY_VERSION = '1';
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, board, is_test_fixture) values ('${A}', 'School A', 'IN-HR', 'CBSE', true), ('${B}', 'School B', 'IN-DL', 'CBSE', true);
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'principal@a.example', 'principal', 'Priya Principal', true), ('${T_MATHS}', '${A}', 'tara@a.example', 'teacher', 'Tara Maths', true),
      ('${T_OTHER}', '${A}', 'omar@a.example', 'teacher', 'Omar Other', true), ('${ACCOUNTANT}', '${A}', 'anil@a.example', 'accountant', 'Anil Accountant', true),
      ('${PRINCIPAL_B}', '${B}', 'principal@b.example', 'principal', 'Bina Principal', true);
    insert into teachers (teacher_id, school_id, user_id, name) values ('${u(61)}', '${A}', '${T_MATHS}', 'Tara Maths'), ('${u(62)}', '${A}', '${T_OTHER}', 'Omar Other');
    insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values ('${SESSION}', '${A}', '2026-27', '2026-04-01', '2027-03-31', true);
    insert into classes (class_id, school_id, name, grade, section) values ('${C7A}', '${A}', '7', '7', 'A'), ('${C7B}', '${A}', '7', '7', 'B');
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Mathematics');
    insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) values ('${A}', '${u(61)}', '${MATHS}', '${C7A}'), ('${A}', '${u(62)}', '${MATHS}', '${C7B}');
    insert into students (student_id, school_id, admission_no, name, class_id, roll_no, status) values
      ('${u(71)}', '${A}', 'A-1', 'Meera Sharma', '${C7A}', '1', 'active'), ('${u(72)}', '${A}', 'A-2', 'Zoya Khan', '${C7A}', '2', 'active');
    insert into syllabus_units (unit_id, school_id, class_id, subject_id, position, chapter, topic) values
      ('${FR_ADD}', '${A}', '${C7A}', '${MATHS}', 1, 'Fractions', 'Adding fractions'), ('${FR_CMP}', '${A}', '${C7A}', '${MATHS}', 2, 'Fractions', 'Comparing fractions'),
      ('${DEC}', '${A}', '${C7A}', '${MATHS}', 3, 'Decimals', 'Tenths'), ('${GEO}', '${A}', '${C7A}', '${MATHS}', 4, 'Geometry', 'Angles'),
      ('${ALG}', '${A}', '${C7A}', '${MATHS}', 5, 'Algebra', 'Expressions'), ('${U7B}', '${A}', '${C7B}', '${MATHS}', 1, 'Fractions', 'Adding fractions');
    -- 7-A's taught log: Fractions 4 periods (July), Decimals 3 and Geometry 1 (August), Algebra none.
    insert into syllabus_progress (school_id, teacher_id, class_id, subject_id, topic, date, unit_id) values
      ('${A}', '${u(61)}', '${C7A}', '${MATHS}', 'Adding fractions', '2026-07-01', '${FR_ADD}'), ('${A}', '${u(61)}', '${C7A}', '${MATHS}', 'Adding fractions', '2026-07-02', '${FR_ADD}'),
      ('${A}', '${u(61)}', '${C7A}', '${MATHS}', 'Comparing fractions', '2026-07-03', '${FR_CMP}'), ('${A}', '${u(61)}', '${C7A}', '${MATHS}', 'Adding fractions', '2026-07-04', '${FR_ADD}'),
      ('${A}', '${u(61)}', '${C7A}', '${MATHS}', 'Tenths', '2026-08-10', '${DEC}'), ('${A}', '${u(61)}', '${C7A}', '${MATHS}', 'Tenths', '2026-08-11', '${DEC}'),
      ('${A}', '${u(61)}', '${C7A}', '${MATHS}', 'Tenths', '2026-08-12', '${DEC}'), ('${A}', '${u(61)}', '${C7A}', '${MATHS}', 'Angles', '2026-08-20', '${GEO}');
    insert into school_module_entitlements (school_id, module_id, enabled, source, limits) values ('${A}', 'exams', true, 'plan', '{}'), ('${B}', 'exams', true, 'plan', '{}')
      on conflict (school_id, module_id) do update set enabled = true;
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
  const actor = (who: Who) => ({ schoolId: who.school, userId: who.user, role: who.role as never });
  const exam = async (name: string, examType: string, papers: unknown[]) => ((await as(principal, (c) => makeExam(c, actor(principal), { name, sessionId: SESSION, term: 'Term 1', examType, papers }))) as { examId: string }).examId;
  await exam('Unit test 1', 'unit', [{ classId: C7A, subjectId: MATHS, date: '2026-07-15', unitIds: [], maxima: { theory: 25 } }]);
  halfExam = await exam('Half-yearly', 'half_yearly', [
    { classId: C7A, subjectId: MATHS, date: '2026-09-25', unitIds: [], maxima: { theory: 80, internal: 20 } },
    { classId: C7B, subjectId: MATHS, date: '2026-09-25', unitIds: [U7B], maxima: { theory: 80 } },
  ]);
  const unit2 = await exam('Unit test 2', 'unit', [{ classId: C7A, subjectId: MATHS, date: '2026-08-30', unitIds: [], maxima: { theory: 25 } }]);
  const papers = await owner(`select p.paper_id, p.class_id, p.exam_id from exam_papers p`);
  paperHalf = papers.find((p: { exam_id: string; class_id: string }) => p.exam_id === halfExam && p.class_id === C7A).paper_id;
  paperHalfB = papers.find((p: { exam_id: string; class_id: string }) => p.exam_id === halfExam && p.class_id === C7B).paper_id;
  paperUnit2 = papers.find((p: { exam_id: string }) => p.exam_id === unit2).paper_id;
  // Control: the task on Anthropic (a stand-in at fetch), its key saved.
  const sealed = sealAiKey(aiEncryptionKey()!, 'anthropic', ANTHROPIC_KEY);
  await owner(`insert into control.ai_credentials (provider_id, ciphertext, iv, tag, key_version, key_last4, set_by) values ('anthropic', $1, $2, $3, $4, 'WXYZ', $5)`, [sealed.ciphertext, sealed.iv, sealed.tag, sealed.keyVersion, FOUNDER]);
  await owner(`update control.ai_profiles set provider_id = 'anthropic', model = 'test-writer' where profile_id = 'exams.write_questions'`);
  stubVendor();
}, 120_000);
afterAll(async () => {
  vi.unstubAllGlobals();
  await db?.stop();
});

describe('the AI task (C363)', () => {
  it('starts on Workers AI, switched on, carrying no child’s words; school staff read it', async () => {
    const fresh = await owner(`select carries_child_words, enabled, max_output_tokens from control.ai_profiles where profile_id = 'exams.write_questions'`);
    expect(fresh).toEqual([{ carries_child_words: false, enabled: true, max_output_tokens: 6000 }]);
    const seen = await as(tMaths, async (c) => (await c.query(`select profile_id from control.ai_profiles where profile_id = 'exams.write_questions'`)).rows);
    expect(seen).toHaveLength(1);
  });
});

describe('a paper made from what was taught (C362)', () => {
  it('the preview: the session’s chapters by the periods logged, the half-yearly blueprint, the paper’s Theory part', async () => {
    expect(await screen(accountant, paperHalf)).toMatchObject({ status: 403 });
    expect(await screen(tOther, paperHalf)).toMatchObject({ status: 404 });
    const s = await screen(tMaths, paperHalf);
    expect(s.status).toBe(200);
    expect(s.body).toMatchObject({ mayMake: true, why: null, questions: 0, printable: false, printWhy: 'no_questions', ai: true, examType: { key: 'half_yearly' } });
    expect(s.body.plan.scope).toMatchObject({ rule: 'session', used: 'log', unlinked: 0 });
    expect(s.body.plan.part).toEqual({ key: 'theory', name: 'Theory', max: 80 });
    expect(s.body.plan.chapters.map((c: { chapter: string; periods: number; marks: number }) => [c.chapter, c.periods, c.marks])).toEqual([['Fractions', 4, 40], ['Decimals', 3, 30], ['Geometry', 1, 10]]);
    // The teacher's own marks per chapter, and sections changed for this paper, in a preview: nothing is made.
    const mine = await make(tMaths, paperHalf, { preview: true, chapterMarks: { Fractions: 20, Decimals: 20, Geometry: 40 } });
    expect(mine.body.plan.weight).toBe('typed');
    const short = await make(tMaths, paperHalf, { preview: true, sections: [{ section: 'A', kind: 'objective', count: 20, marksEach: 1 }] });
    expect(short.body).toMatchObject({ mayMake: false, why: 'plan' });
    expect(short.body.plan.problems).toEqual([{ kind: 'total', blueprint: 20, part: 'theory', max: 80 }]);
    expect(await owner(`select count(*)::int as n from paper_generations`)).toEqual([{ n: 0 }]);
  });

  it('made in one job: the chapters and marks follow the log and the blueprint; the AI wrote every question once it was asked again', async () => {
    // Marks that do not make up the part are refused plainly, not stretched.
    expect(await make(tMaths, paperHalf, { sections: [{ section: 'A', kind: 'objective', count: 20, marksEach: 1 }] })).toMatchObject({ status: 409, body: { code: 'plan' } });
    expect(await make(tOther, paperHalf)).toMatchObject({ status: 404 });
    const asked = await make(tMaths, paperHalf);
    expect(asked.status).toBe(201);
    expect(asked.body.generation).toMatchObject({ kind: 'paper', state: 'waiting' });
    // One making at a time.
    expect(await make(tMaths, paperHalf)).toMatchObject({ status: 409, body: { code: 'busy' } });
    await drain();
    const g = await owner(`select state, failure, result, ai_provider, ai_model, prompt_version, requested_by from paper_generations where paper_id = $1`, [paperHalf]);
    expect(g).toEqual([{ state: 'done', failure: null, result: { bank: 0, ai: 39, empty: 0, aiOff: false }, ai_provider: 'anthropic', ai_model: 'test-writer', prompt_version: 'v1', requested_by: T_MATHS }]);
    const qs = await questionsOf(paperHalf);
    expect(qs.map((q: { label: string }) => q.label)).toEqual(Array.from({ length: 39 }, (_, i) => String(i + 1)));
    expect(qs.every((q: { component: string; updated_by: string; prompt: string }) => q.component === 'theory' && q.updated_by === T_MATHS && q.prompt.length > 0)).toBe(true);
    // The marks counted add up to the Theory part: every section, with section D's "answer any 4 of 5".
    const counted = qs.reduce((n: number, q: { marks: number; choice_group: string | null }) => n + (q.choice_group ? 0 : q.marks), 0) + 4 * 5;
    expect(counted).toBe(80);
    expect((await owner(`select choice_counts, kept_at from marking_setups where paper_id = $1`, [paperHalf]))[0]).toEqual({ choice_counts: { D: 4 }, kept_at: null });
    // Each chapter's marks within two of its share by periods (40, 30, 10).
    const byChapter: Record<string, number> = {};
    for (const q of qs as { chapter: string; marks: number; choice_group: string | null }[]) byChapter[q.chapter] = (byChapter[q.chapter] ?? 0) + (q.choice_group ? (q.marks * 4) / 5 : q.marks);
    expect(Object.keys(byChapter).sort()).toEqual(['Decimals', 'Fractions', 'Geometry']);
    expect(Math.abs(byChapter.Fractions - 40)).toBeLessThanOrEqual(2);
    expect(Math.abs(byChapter.Decimals - 30)).toBeLessThanOrEqual(2);
    expect(Math.abs(byChapter.Geometry - 10)).toBeLessThanOrEqual(2);
    // Choice questions have four options and their key; every question is an AI draft in the bank, in the asker's name.
    const choice = qs.filter((q: { kind: string }) => q.kind === 'objective');
    expect(choice).toHaveLength(20);
    expect(choice.every((q: { options: unknown[]; correct: unknown; section: string }) => q.options.length === 4 && JSON.stringify(q.correct) === '{"keys":["B"]}' && q.section === 'A')).toBe(true);
    expect(await owner(`select source, state, created_by, count(*)::int as n from question_bank group by 1, 2, 3`)).toEqual([{ source: 'ai', state: 'draft', created_by: T_MATHS, n: 39 }]);
    // Slot 3 was answered badly once (its steps did not add up): dropped, and asked for again in a second round.
    expect(sent.length).toBe(6);
    expect(JSON.parse(sent[5].messages[0].content.split('\n')[1]).map((s: Slot) => s.slot)).toEqual([3]);
    // What reached the model: the syllabus, the class level and the subject; never a child's, a teacher's or the school's name.
    for (const body of sent) for (const name of NAMES) expect(JSON.stringify(body)).not.toContain(name);
    expect(sent[0].system).toContain('Class 7, Mathematics');
    // Metered in Control's counts.
    expect(await owner(`select requests::int as n from control.ai_usage where profile_id = 'exams.write_questions'`)).toEqual([{ n: 6 }]);
  });

  it('a job’s session cannot write a mark (the rule of C347 still holds)', async () => {
    const msg = await refused(() =>
      asSchool(A, 'marking.pipeline', (c) => c.query(`insert into marks (school_id, paper_id, student_id, component, kind, score) values ($1, $2, $3, 'theory', 'score', 10)`, [A, paperHalf, u(71)]))
    );
    expect(msg).toMatch(/row-level security|violates/);
    expect(await owner(`select count(*)::int as n from marks`)).toEqual([{ n: 0 }]);
  });
});

describe('keeping and printing (C363)', () => {
  it('an unkept paper does not print; kept, it prints; changed, it is kept again first', async () => {
    expect(await print(tMaths, paperHalf)).toMatchObject({ status: 409, body: { code: 'not_kept' } });
    expect(await keep(tOther, paperHalf)).toMatchObject({ status: 404 });
    expect(await keep(accountant, paperHalf)).toMatchObject({ status: 403 });
    const kept = await keep(tMaths, paperHalf);
    expect(kept.status).toBe(200);
    expect(kept.body.banked).toBe(39);
    expect(kept.body.screen).toMatchObject({ printable: true, printWhy: null, kept: { by: 'Tara Maths' } });
    // The AI's drafts became kept questions "from a paper", each counting one kept paper.
    expect(await owner(`select source, state, used_count, count(*)::int as n from question_bank group by 1, 2, 3`)).toEqual([{ source: 'paper', state: 'kept', used_count: 1, n: 39 }]);
    const p = await print(tMaths, paperHalf);
    expect(p.status).toBe(200);
    expect(p.body).toMatchObject({ schoolName: 'School A', examName: 'Half-yearly', subjectName: 'Mathematics', minutes: 180, maxMarks: 80, choiceCounts: { D: 4 } });
    expect(p.body.questions).toHaveLength(39);
    // Keeping again counts nothing twice.
    await keep(tMaths, paperHalf);
    expect(await owner(`select max(used_count)::int as n from question_bank`)).toEqual([{ n: 1 }]);
    // A change after keeping: printing waits for the next keep.
    const setup = await as(tMaths, async (c) => {
      const { readSetup } = await import('@/lib/marking/setup');
      return readSetup(c, { schoolId: A, userId: T_MATHS, role: 'teacher' as never }, paperHalf);
    });
    const edited = setup!.questions.map((q, i) => (i === 0 ? { ...q, prompt: `${q.prompt} (in your own words)` } : q));
    expect((await as(tMaths, (c) => saveSetup(c, { schoolId: A, userId: T_MATHS, role: 'teacher' as never }, paperHalf, { setup: setup!.setup, questions: edited }))).ok).toBe(true);
    expect(await print(tMaths, paperHalf)).toMatchObject({ status: 409, body: { code: 'changed' } });
    expect((await keep(tMaths, paperHalf)).status).toBe(200);
    expect((await print(tMaths, paperHalf)).status).toBe(200);
  });

  it('a question written anew by the AI is a draft: the paper is no longer kept until it is kept again', async () => {
    const q = (await questionsOf(paperHalf))[1];
    expect(await replace(tOther, q.question_id, { from: 'ai' })).toMatchObject({ status: 404 });
    const asked = await replace(tMaths, q.question_id, { from: 'ai' });
    expect(asked.status).toBe(201);
    await drain();
    const after = (await questionsOf(paperHalf))[1];
    expect(after).toMatchObject({ label: q.label, marks: q.marks, kind: q.kind });
    expect(after.prompt).not.toBe(q.prompt);
    expect((await owner(`select state, source from question_bank where bank_id = $1`, [after.bank_id]))[0]).toEqual({ state: 'draft', source: 'ai' });
    expect(await print(tMaths, paperHalf)).toMatchObject({ status: 409 });
    expect((await keep(tMaths, paperHalf)).status).toBe(200);
  });
});

describe('the school’s bank comes first, and skips what the class had lately (C363)', () => {
  it('a unit test after the half-yearly: the teachers’ own kept questions first, none of the half-yearly’s', async () => {
    // Three kept questions of the teacher's own on Decimals (objective, 1 mark), written in the bank by hand.
    await as(tMaths, async (c) => {
      for (const n of [1, 2, 3]) {
        await c.query(
          `insert into question_bank (school_id, grade, subject_id, chapter, topic, kind, max_marks, prompt, options, correct, answer_key, steps, difficulty, language, source, state, created_by)
           values ($1, '7', $2, 'Decimals', 'Tenths', 'objective', 1, $3, $4, '{"keys":["A"]}', 'A', '[{"step":"Right option","marks":1}]', 'easy', 'en', 'teacher', 'kept', $5)`,
          [A, MATHS, `Which is ${n} tenths?`, JSON.stringify(['ABCD'].flatMap((k) => k.split('').map((key, i) => ({ key, text: `0.${n + i}` })))), T_MATHS]
        );
      }
    });
    const half = new Set((await questionsOf(paperHalf)).map((q: { bank_id: string }) => q.bank_id));
    const s = await screen(tMaths, paperUnit2);
    // Since the last unit test (15 July): Decimals and Geometry only.
    expect(s.body.plan.scope).toMatchObject({ rule: 'since_last_of_type', used: 'log', after: '2026-07-15' });
    expect(s.body.plan.chapters.map((c: { chapter: string }) => c.chapter)).toEqual(['Decimals', 'Geometry']);
    // The bank list for the paper leaves the half-yearly's questions out and says how many.
    const list = await bank(tMaths, paperUnit2, '?chapter=Decimals&kind=objective&marks=1');
    expect(list.status).toBe(200);
    expect(list.body.questions.map((q: { prompt: string }) => q.prompt).sort()).toEqual(['Which is 1 tenths?', 'Which is 2 tenths?', 'Which is 3 tenths?']);
    expect(list.body.skipped).toBeGreaterThan(0);
    expect((await make(tMaths, paperUnit2)).status).toBe(201);
    await drain();
    const g = (await owner(`select result from paper_generations where paper_id = $1`, [paperUnit2]))[0];
    expect(g.result).toMatchObject({ bank: 3, empty: 0 });
    const qs = await questionsOf(paperUnit2);
    const fromBank = qs.filter((q: { prompt: string }) => q.prompt.startsWith('Which is'));
    expect(fromBank).toHaveLength(3);
    expect(qs.some((q: { bank_id: string }) => half.has(q.bank_id))).toBe(false);
    expect((await keep(tMaths, paperUnit2)).status).toBe(200);
  });

  it('replace a question with a bank question (its number and marks stay), and pick one onto the end', async () => {
    await as(tMaths, async (c) => {
      for (const n of [1, 2])
        await c.query(
          `insert into question_bank (school_id, grade, subject_id, chapter, topic, kind, max_marks, prompt, answer_key, steps, language, source, state, created_by)
           values ($1, '7', $2, 'Geometry', 'Angles', 'short', 3, $3, 'Ninety degrees.', '[{"step":"Names the angle","marks":3}]', 'en', 'teacher', 'kept', $4)`,
          [A, MATHS, `Name the angle of a square's corner (${n}).`, T_MATHS]
        );
    });
    const list = await bank(tMaths, paperUnit2, '?kind=short&marks=3');
    const ids = list.body.questions
      .filter((q: { prompt: string }) => q.prompt.startsWith('Name the angle'))
      .sort((x: { prompt: string }, y: { prompt: string }) => x.prompt.localeCompare(y.prompt))
      .map((q: { bankId: string }) => q.bankId);
    expect(ids).toHaveLength(2);
    const target = (await questionsOf(paperUnit2)).find((q: { marks: number }) => q.marks === 3);
    expect(await replace(tOther, target.question_id, { from: 'bank', bankId: ids[0] })).toMatchObject({ status: 404 });
    const r = await replace(tMaths, target.question_id, { from: 'bank', bankId: ids[0] });
    expect(r.status).toBe(200);
    const after = (await questionsOf(paperUnit2)).find((q: { question_id: string }) => q.question_id === target.question_id);
    expect(after).toMatchObject({ label: target.label, marks: 3, bank_id: ids[0], prompt: "Name the angle of a square's corner (1)." });
    // The same bank question twice on one paper is not offered.
    expect(await replace(tMaths, target.question_id, { from: 'bank', bankId: ids[0] })).toMatchObject({ status: 409, body: { code: 'gone' } });
    const picked = await pick(tMaths, paperUnit2, [ids[1]]);
    expect(picked.status).toBe(200);
    expect(picked.body.screen.questions.at(-1)).toMatchObject({ label: '16', component: 'theory', maxMarks: 3 });
    // The marks no longer add up: the teacher fits them before the paper is kept again.
    expect(await keep(tMaths, paperUnit2)).toMatchObject({ status: 409, body: { code: 'structure' } });
  });
});

describe('who reads and writes (C363)', () => {
  it('another class’s teacher reads and writes nothing of the paper; another school sees none of the bank', async () => {
    expect(await print(tOther, paperHalf)).toMatchObject({ status: 404 });
    expect(await bank(tOther, paperHalf)).toMatchObject({ status: 404 });
    expect(await pick(tOther, paperHalf, [u(99)])).toMatchObject({ status: 404 });
    expect(await as(tOther, async (c) => (await c.query(`select count(*)::int as n from paper_generations where paper_id = $1`, [paperHalf])).rows)).toEqual([{ n: 0 }]);
    expect(await as(tOther, async (c) => (await c.query(`select count(*)::int as n from marking_questions where paper_id = $1`, [paperHalf])).rows)).toEqual([{ n: 0 }]);
    expect(await refused(() => as(tOther, (c) => c.query(`insert into paper_generations (school_id, paper_id, requested_by) values ($1, $2, $3)`, [A, paperHalf, T_OTHER])))).toMatch(/row-level security/);
    // The bank is the school's: Omar reads it, but changes only his own questions.
    const someone = (await owner(`select bank_id from question_bank where created_by = $1 limit 1`, [T_MATHS]))[0].bank_id;
    expect(await as(tOther, async (c) => (await c.query(`update question_bank set state = 'retired' where bank_id = $1 returning bank_id`, [someone])).rows)).toEqual([]);
    expect(await refused(() => as(tOther, (c) => c.query(`select public.keep_paper($1)`, [paperHalf])))).toMatch(/not allowed/);
    expect(await as(principalB, async (c) => (await c.query(`select count(*)::int as n from question_bank`)).rows)).toEqual([{ n: 0 }]);
    expect(await as(accountant, async (c) => (await c.query(`select count(*)::int as n from question_bank`)).rows)).toEqual([{ n: 0 }]);
    // A person writes a bank question only in their own name.
    expect(
      await refused(() =>
        as(tOther, (c) =>
          c.query(`insert into question_bank (school_id, grade, subject_id, chapter, kind, max_marks, prompt, source, state, created_by) values ($1, '7', $2, 'Fractions', 'short', 2, 'Q', 'ai', 'draft', $3)`, [A, MATHS, T_MATHS])
        )
      )
    ).toBe('allowed'); // the trigger writes it in Omar's own name
    expect((await owner(`select created_by from question_bank where prompt = 'Q'`))[0].created_by).toBe(T_OTHER);
  });

  it('"Make every paper": one making for each paper with no questions; the others are named with the reason', async () => {
    const r = await makeAll(principal, halfExam);
    expect(r.status).toBe(200);
    expect(r.body.queued).toEqual([paperHalfB]);
    expect(r.body.skipped).toEqual([{ paperId: paperHalf, reason: 'has_questions' }]);
    await drain();
    const g = (await owner(`select state, plan -> 'scope' ->> 'used' as used, requested_by from paper_generations where paper_id = $1`, [paperHalfB]))[0];
    // Nothing logged for 7-B: the paper's own chapter is used, and the screen says so.
    expect(g).toEqual({ state: 'done', used: 'paper_units', requested_by: PRINCIPAL });
    expect(await questionsOf(paperHalfB)).toHaveLength(39);
  });
});
