import { randomBytes } from 'crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import type { Block } from '@/lib/family/blocks';
import { sealAiKey, aiEncryptionKey } from '@/lib/ai/credentials';
import { openaiOk } from '../ai/streams';

// W16-B1: a five-question quiz made from each tutor session at its end, with review dates, on the real migrations.
//   1. A session that ended (no turn for ten minutes, or "Done for now") enqueues one tutor.quiz job, once for the
//      conversation and the day; the payload holds two ids' worth of facts and none of the child's words.
//   2. The job, run through the real gateway with a stand-in provider, stores a five-item quiz for that child only,
//      counts against the family's daily cap, and sends the model nothing that names the child.
//   3. Review dates are +1, +3 and +7 days; a take is scored by the chapter test's own scorer; a wrong answer links back.
// The model is replaced at fetch. Made-up children and words only.

const A = 'f1600000-0000-4000-8000-0000000000a1';
const B = 'f1600000-0000-4000-8000-0000000000b1';
const CHILD = 'f1600000-0000-4000-8000-0000000000c1';
const SIBLING = 'f1600000-0000-4000-8000-0000000000c2';
const OTHER = 'f1600000-0000-4000-8000-0000000000c3';
const FOUNDER = 'f1600000-0000-4000-8000-0000000000f1';
const OPENAI_KEY = `sk-${'b'.repeat(30)}QRST`;

const explanation = (n: number): Block => ({ type: 'explanation', title: `Idea ${n}`, idea: `The idea ${n}.`, paragraphs: [`Plants make food with sunlight, part ${n}.`], example: `Example ${n}`, steps: ['a', 'b'], terms: [] });

const MODEL = {
  title: 'Plants and sunlight',
  items: [
    { kind: 'mcq', question: 'What do plants need to make food?', options: ['Sunlight', 'Sand', 'Salt'], answer: 0, why: 'Plants use sunlight to make food.' },
    { kind: 'mcq', question: 'Which gas do leaves take in?', options: ['Oxygen', 'Carbon dioxide', 'Helium'], answer: 1, why: 'Leaves take in carbon dioxide.' },
    { kind: 'mcq', question: 'Where is food made in a plant?', options: ['Roots', 'Leaves', 'Seeds'], answer: 1, why: 'The leaves hold the green colour that works with sunlight.' },
    { kind: 'mcq', question: 'What is the green colour in leaves called?', options: ['Chlorophyll', 'Starch', 'Water'], answer: 0, why: 'Chlorophyll is the green colour.' },
    { kind: 'written', question: 'Say in a sentence why a plant in a dark cupboard turns pale.', points: ['It gets no sunlight to make food'] },
  ],
};
const RIGHT = [0, 1, 1, 0];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
type Client = { query: (s: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };
const fam = async <R,>(fn: (c: Client) => Promise<R>, account = A): Promise<R> => (await import('@/lib/auth/db')).withFamilyContext({ accountId: account, tokenVersion: 0, device: null }, fn as never) as Promise<R>;
const asFamily = <R,>(account: string, fn: (c: Client) => Promise<R>, child?: string): Promise<R> =>
  db.pg.transaction(async (tx: Client) => {
    await tx.query('set local role family_app');
    await tx.query(`select set_config('app.current_account_id', $1, true)`, [account]);
    if (child) await tx.query(`select set_config('app.current_child_id', $1, true)`, [child]);
    return fn(tx);
  });

let calls: { url: string; body: string }[] = [];
let replies: (() => Response)[] = [];

// A conversation of three turns about plants, with the child's words naming the child, ended `minutes` ago.
async function session(account: string, child: string, minutes: number, turns = 3): Promise<string> {
  const t = await import('@/lib/family/tutor');
  const chat = await fam((c) => t.newChat(c, account, child, 'science'), account);
  for (let n = 1; n <= turns; n++) {
    await fam((c) => t.appendTurn(c, { accountId: account, childId: child, chatId: chat, subject: 'science', text: n === 1 ? `Asha wants to know how plants eat, question ${n}?` : `Why do leaves need sunlight, question ${n}?`, chapterKey: null, blockId: null, files: [], blocks: [explanation(n)] }), account);
  }
  await q(`update family.tutor_messages set created_at = created_at - make_interval(mins => $2) where conversation_id = $1`, [chat, minutes]);
  await q(`update family.tutor_conversations set last_at = last_at - make_interval(mins => $2) where conversation_id = $1`, [chat, minutes]);
  return chat;
}
const jobs = () => q(`select type, status, payload, idempotency_key, max_attempts from jobs where type = 'tutor.quiz' order by created_at`);
// Every conversation and job of a test removed, so the next one starts clean.
const clean = async () => {
  await q(`delete from jobs where type = 'tutor.quiz'`);
  await q(`delete from family.tutor_conversations`);
};
const sweep = async () => Number((await q(`select public.family_quiz_enqueue() as n`))[0].n);

async function runJob(conversationId: string, day: string, attempts = 1) {
  const { quizJobHandler } = await import('@/lib/family/quiz');
  const { withPlatformService } = await import('@/lib/auth/db');
  const notes: { outcome: string; attempts: number }[] = [];
  await quizJobHandler({ platform: withPlatformService as never, note: (f) => notes.push(f) })({ payload: { conversationId, day }, attempts });
  return notes;
}
const profile = (provider: string | null, model: string | null) => q(`update control.ai_profiles set provider_id = $1, model = $2, fallback = '[]', enabled = true where profile_id = 'family.quiz'`, [provider, model]);

beforeAll(async () => {
  process.env.AI_CREDENTIALS_KEY = randomBytes(32).toString('base64');
  process.env.AI_CREDENTIALS_KEY_VERSION = '1';
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-w16-b1-quiz-0123456789';
  await db.pg.exec(`
    insert into family.accounts (account_id, email) values ('${A}', 'quiz.a@example.org'), ('${B}', 'quiz.b@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values
      ('${A}', 'study_core', true, 'parent_tap', 'v1'), ('${B}', 'study_core', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values
      ('${CHILD}', '${A}', 'Asha', 8, 'CBSE', 'en', 'en', 'IN-HR'), ('${SIBLING}', '${A}', 'Ravi', 6, 'CBSE', 'en', 'en', 'IN-HR'), ('${OTHER}', '${B}', 'Meera', 8, 'CBSE', 'en', 'en', 'IN-HR');
    insert into platform_settings (key, value) values ('jobs.handlers', '["tutor.quiz"]'::jsonb) on conflict (key) do update set value = excluded.value;
  `);
  const k = aiEncryptionKey()!;
  const s = sealAiKey(k, 'openai', OPENAI_KEY);
  await q(`insert into control.ai_credentials (provider_id, ciphertext, iv, tag, key_version, key_last4, set_by) values ('openai', $1, $2, $3, $4, 'QRST', $5) on conflict (provider_id) do nothing`, [s.ciphertext, s.iv, s.tag, s.keyVersion, FOUNDER]);
  await q(`update control.ai_providers set cleared_for_minors = true, cleared_terms_url = 'https://example.org/terms', cleared_at = now(), cleared_by = $1 where provider_id = 'openai'`, [FOUNDER]);
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});
beforeEach(() => {
  calls = [];
  replies = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), body: String(init.body) });
      const next = replies.shift();
      if (!next) throw new Error('no reply prepared');
      return next();
    })
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('when a session ends', () => {
  it('a session of three turns, quiet for ten minutes, is one tutor.quiz job, once for the conversation and the day', async () => {
    const live = await session(A, CHILD, 2);
    const ended = await session(A, CHILD, 11);
    const single = await session(A, SIBLING, 11, 1);
    expect(await sweep()).toBe(1);
    expect(await sweep()).toBe(0);
    const rows = await jobs();
    expect(rows).toHaveLength(1);
    const day = String((await q(`select to_char((last_at at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') as d from family.tutor_conversations where conversation_id = $1`, [ended]))[0].d);
    expect(rows[0]).toMatchObject({ status: 'pending', payload: { conversationId: ended, day }, idempotency_key: `tutor.quiz:${ended}:${day}`, max_attempts: 3 });
    // Nothing of the child's words, a name or an account is in the payload; a session still going and a one-turn chat are not quizzed.
    expect(JSON.stringify(rows[0].payload)).not.toMatch(/Asha|plants|leaves|sunlight|@/);
    expect(Object.keys(rows[0].payload).sort()).toEqual(['conversationId', 'day']);
    expect(rows.map((r: { payload: { conversationId: string } }) => r.payload.conversationId)).not.toContain(live);
    expect(rows.map((r: { payload: { conversationId: string } }) => r.payload.conversationId)).not.toContain(single);
    await clean();
  });

  it('"Done for now" ends a session that is still going; another child’s chat is not ended by it', async () => {
    const { endSession } = await import('@/lib/family/quiz');
    const live = await session(A, CHILD, 1);
    expect(await sweep()).toBe(0);
    expect(await fam((c) => endSession(c, { accountId: A, childId: SIBLING }, live))).toBe(false);
    expect(await sweep()).toBe(0);
    expect(await fam((c) => endSession(c, { accountId: A, childId: CHILD }, live))).toBe(true);
    expect(await sweep()).toBe(1);
    expect((await jobs())[0].payload.conversationId).toBe(live);
    await clean();
  });
});

describe('the job', () => {
  let chat: string;
  let day: string;
  let quizId: string;

  it('with no provider set, ends without a quiz and without failing', async () => {
    chat = await session(A, CHILD, 12);
    day = String((await q(`select to_char((last_at at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') as d from family.tutor_conversations where conversation_id = $1`, [chat]))[0].d);
    await profile(null, null);
    expect(await runJob(chat, day)).toEqual([{ outcome: 'not_switched_on', attempts: 1 }]);
    expect(await q(`select 1 from family.session_quizzes`)).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it('stores a five-item quiz for that child only, counts one request against the day’s cap, and sends no name', async () => {
    await profile('openai', 'gpt-test');
    replies.push(() => openaiOk([JSON.stringify(MODEL)]));
    const notes = await runJob(chat, day);
    expect(notes).toEqual([{ outcome: 'made', attempts: 1 }]);
    expect(calls).toHaveLength(1);
    // The gateway's cleaning: the child's first name (and every child's in the family) never leaves, the session's words do.
    expect(calls[0].body).not.toMatch(/Asha|Ravi|quiz\.a@example\.org/);
    expect(calls[0].body).toMatch(/leaves need sunlight/);
    const rows = await q(`select quiz_id, child_id, conversation_id, session_day::text as day, subject, lang, title, jsonb_array_length(items) as n, review_due_on::text[] as due from family.session_quizzes`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ child_id: CHILD, conversation_id: chat, subject: 'science', lang: 'en', title: 'Plants and sunlight', n: 5 });
    quizId = String(rows[0].quiz_id);
    // Metering: the quiz is a family call like any other (the gateway counts it, no code of the quiz's own).
    expect(await q(`select requests from family.ai_daily where account_id = $1`, [A])).toEqual([{ requests: 1 }]);
    expect(await q(`select profile_id from control.ai_usage where profile_id = 'family.quiz'`)).not.toHaveLength(0);
  });

  it('a second run of the same conversation and day makes no second quiz and asks nothing', async () => {
    expect(await runJob(chat, day, 2)).toEqual([{ outcome: 'exists', attempts: 2 }]);
    expect(calls).toHaveLength(0);
    expect(await q(`select 1 from family.session_quizzes`)).toHaveLength(1);
    // The sweep no longer finds it either.
    expect(await sweep()).toBe(0);
  });

  it('keeps review dates at +1, +3 and +7 days from the session day', async () => {
    const [row] = await q(`select to_char(session_day + 1, 'YYYY-MM-DD') as d1, to_char(session_day + 3, 'YYYY-MM-DD') as d3, to_char(session_day + 7, 'YYYY-MM-DD') as d7, review_due_on::text[] as due from family.session_quizzes where quiz_id = $1`, [quizId]);
    expect(row.due).toEqual([row.d1, row.d3, row.d7]);
    const { reviewDates, addDays } = await import('@/lib/family/quiz');
    expect(reviewDates('2026-11-28')).toEqual(['2026-11-29', '2026-12-01', '2026-12-05']);
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('the quiz is read by that child only: not the sibling, not another family, not the other family’s session', async () => {
    const quiz = await import('@/lib/family/quiz');
    expect(await fam((c) => quiz.loadQuiz(c, { accountId: A, childId: CHILD }, quizId))).toMatchObject({ quizId, subject: 'science' });
    expect(await fam((c) => quiz.loadQuiz(c, { accountId: A, childId: SIBLING }, quizId))).toBeNull();
    expect(await fam((c) => quiz.loadQuiz(c, { accountId: B, childId: OTHER }, quizId), B)).toBeNull();
    expect(await asFamily(B, async (c) => (await c.query(`select 1 from family.session_quizzes`)).rows)).toHaveLength(0);
    // On a child's own phone (that child set) the sibling sees none of it either; the child sees it.
    expect(await asFamily(A, async (c) => (await c.query(`select 1 from family.session_quizzes`)).rows, SIBLING)).toHaveLength(0);
    expect(await asFamily(A, async (c) => (await c.query(`select 1 from family.session_quizzes`)).rows, CHILD)).toHaveLength(1);
    // A family cannot write a quiz for another account.
    await expect(asFamily(B, (c) => c.query(`insert into family.session_quizzes (account_id, child_id, conversation_id, session_day, subject, title, items, review_due_on) values ($1, $2, $3, '2026-11-02', 'science', 'x', '[]'::jsonb, '{2026-11-03,2026-11-05,2026-11-09}')`, [B, OTHER, chat]))).rejects.toThrow();
    // The platform role reads nothing of it directly; only the owner lookup the job uses.
    await expect(db.pg.transaction(async (tx: Client) => { await tx.query('set local role nca_super'); return tx.query('select * from family.session_quizzes'); })).rejects.toThrow(/permission denied/);
    expect(await db.pg.transaction(async (tx: Client) => { await tx.query('set local role nca_super'); return (await tx.query('select account_id from family.quiz_session($1)', [chat])).rows; })).toEqual([{ account_id: A }]);
  });

  it('the phone gets sealed tokens and no answer; an attempt is scored by the chapter test scorer and the card shows it', async () => {
    const quiz = { ...(await import('@/lib/family/quiz')), ...(await import('@/lib/family/quiz-play')) };
    const who = { accountId: A, childId: CHILD };
    const today = String((await q(`select to_char(session_day, 'YYYY-MM-DD') as d from family.session_quizzes where quiz_id = $1`, [quizId]))[0].d);
    const read = (await fam((c) => quiz.loadQuiz(c, who, quizId)))!;
    const pub = quiz.publicQuiz(read, who);
    expect(JSON.stringify(pub)).not.toMatch(/"answer"|"why"|Plants use sunlight to make food/);
    expect(pub.items.filter((i) => i.kind === 'mcq')).toHaveLength(4);

    // Ready before any take.
    expect(await fam((c) => quiz.quizCards(c, who, today))).toMatchObject([{ quizId, state: 'ready', questions: 5, score: null }]);

    // Three right, one wrong, one written.
    const mcq = pub.items.filter((i) => i.kind === 'mcq') as { id: string; token: string }[];
    const answers = [...mcq.map((i, n) => ({ itemId: i.id, token: i.token, choice: n === 3 ? 2 : RIGHT[n] })), { itemId: pub.items[4].id, text: 'It gets no sunlight, so it cannot make food.' }];
    const sent = await fam((c) => quiz.submitQuiz(c, who, quizId, answers));
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect(sent.result).toMatchObject({ mcqTotal: 4, mcqCorrect: 3 });
    expect(sent.result.items.map((i) => i.correct)).toEqual([true, true, true, false, undefined]);
    expect(sent.result.items[3].why).toBe('Chlorophyll is the green colour.');
    expect(await q(`select block_id, chapter_key, mcq_total, mcq_correct from family.chapter_test_attempts where child_id = $1`, [CHILD])).toEqual([{ block_id: quizId, chapter_key: 'session-quiz', mcq_total: 4, mcq_correct: 3 }]);

    // Taken: the card shows the score, with the next review in view; another child's token is refused.
    expect(await fam((c) => quiz.quizCards(c, who, today))).toMatchObject([{ state: 'scored', score: { correct: 3, total: 4 } }]);
    const stolen = await fam((c) => quiz.submitQuiz(c, { accountId: A, childId: SIBLING }, quizId, answers));
    expect(stolen).toEqual({ ok: false, reason: 'not_found' });
    // A token for one quiz is not another's: a take with the wrong ids is refused whole.
    const bad = await fam((c) => quiz.submitQuiz(c, who, quizId, [{ itemId: 'q1', token: 'nope', choice: 0 }]));
    expect(bad.ok).toBe(false);

    // The next day's review comes due +1 day after the session, then +3, then +7, then it is finished.
    const dueOn = read.reviewDueOn;
    expect(quiz.quizState(1, dueOn, today)).toEqual({ state: 'scored', due: dueOn[0] });
    expect(quiz.quizState(1, dueOn, dueOn[0])).toEqual({ state: 'review', due: dueOn[0] });
    expect(quiz.quizState(2, dueOn, dueOn[0])).toEqual({ state: 'scored', due: dueOn[1] });
    expect(quiz.quizState(2, dueOn, dueOn[1])).toEqual({ state: 'review', due: dueOn[1] });
    expect(quiz.quizState(3, dueOn, dueOn[2])).toEqual({ state: 'review', due: dueOn[2] });
    expect(quiz.quizState(4, dueOn, dueOn[2])).toEqual({ state: 'scored', due: null });
    expect(quiz.quizState(0, dueOn, dueOn[2])).toEqual({ state: 'ready', due: null });
    // A review due today is a card that says so, from the stored dates and the attempts.
    expect(await fam((c) => quiz.quizCards(c, who, dueOn[0]))).toMatchObject([{ state: 'review', questions: 5 }]);
    expect(await fam((c) => quiz.quizCards(c, who, today, { subject: 'mathematics' }))).toEqual([]);
  });

  it('the log line and the stored attempt hold no child’s words; the payload was ids and a day', async () => {
    const lines = JSON.stringify(await q(`select payload from jobs`));
    expect(lines).not.toMatch(/Asha|plants|leaves/);
    const { quizJobHandler } = await import('@/lib/family/quiz');
    const seen: unknown[] = [];
    await quizJobHandler({ platform: (async () => ({ rows: [] })) as never, note: (f) => seen.push(f) })({ payload: { conversationId: chat, day }, attempts: 1 });
    await quizJobHandler({ platform: (async () => ({ rows: [] })) as never, note: (f) => seen.push(f) })({ payload: { conversationId: 'not-an-id', day: 'x' }, attempts: 1 });
    expect(seen).toEqual([{ outcome: 'no_session', attempts: 1 }, { outcome: 'no_session', attempts: 1 }]);
  });

  it('a second family’s quiz is refused at the daily cap like any family call, and nothing is stored', async () => {
    await q(`update control.settings set value = '1'::jsonb where key = 'family.ai.daily_requests'`);
    const other = await session(B, OTHER, 12);
    const otherDay = String((await q(`select to_char((last_at at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') as d from family.tutor_conversations where conversation_id = $1`, [other]))[0].d);
    // B has spent nothing today: the first quiz goes.
    replies.push(() => openaiOk([JSON.stringify(MODEL)]));
    expect(await runJob(other, otherDay)).toEqual([{ outcome: 'made', attempts: 1 }]);
    // A second session of the same family the same day meets the cap of one.
    const again = await session(B, OTHER, 12);
    const againDay = String((await q(`select to_char((last_at at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') as d from family.tutor_conversations where conversation_id = $1`, [again]))[0].d);
    expect(await runJob(again, againDay)).toEqual([{ outcome: 'cap_reached', attempts: 1 }]);
    expect(await q(`select 1 from family.session_quizzes where conversation_id = $1`, [again])).toHaveLength(0);
    expect(calls).toHaveLength(1);
    await q(`update control.settings set value = '20'::jsonb where key = 'family.ai.daily_requests'`);
  });

  it('an answer that cannot be used is tried again; a Hindi quiz must be in Devanagari; an item with a wrong key is dropped', async () => {
    const { parseQuiz } = await import('@/lib/family/quiz');
    expect(parseQuiz('not json', 'en')).toBeNull();
    expect(parseQuiz(JSON.stringify({ title: 't', items: MODEL.items.slice(0, 2) }), 'en')).toBeNull();
    const broken = { ...MODEL, items: [{ ...MODEL.items[0], answer: 9 }, ...MODEL.items.slice(1)] };
    expect(parseQuiz(JSON.stringify(broken), 'en')?.items).toHaveLength(4);
    expect(parseQuiz(`Here you go: ${JSON.stringify(MODEL)} Enjoy`, 'en')?.items).toHaveLength(5);
    expect(parseQuiz(JSON.stringify(MODEL), 'hi')).toBeNull();
    const twin = { ...MODEL, items: [{ ...MODEL.items[0], options: ['Sunlight', 'sunlight', 'Salt'] }, ...MODEL.items.slice(1)] };
    expect(parseQuiz(JSON.stringify(twin), 'en')?.items).toHaveLength(4);
    // At most two written items, and five items in all.
    const many = { items: [...MODEL.items, MODEL.items[4], MODEL.items[4], MODEL.items[0]] };
    const kept = parseQuiz(JSON.stringify(many), 'en')!;
    expect(kept.items).toHaveLength(5);
    expect(kept.items.filter((i) => i.kind === 'written').length).toBeLessThanOrEqual(2);

    const stuck = await session(A, SIBLING, 12);
    const stuckDay = String((await q(`select to_char((last_at at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') as d from family.tutor_conversations where conversation_id = $1`, [stuck]))[0].d);
    replies.push(() => openaiOk(['I am sorry, I cannot do that.']));
    await expect(runJob(stuck, stuckDay)).rejects.toThrow(/unusable/);
    expect(await q(`select 1 from family.session_quizzes where conversation_id = $1`, [stuck])).toHaveLength(0);
  });
});
