import { activePromptVersion, prepareText, type AiContext, type AiRefusal } from '@/lib/ai/platform';
import { QUIZ_ITEMS, quizPrompt } from '@/lib/ai/prompts/family.quiz';
import { indiaDate } from '@/lib/time/india';
import { t } from '@/lib/i18n';
import { accountSummary } from './account';
import { checkBlock, plain, type TestItem } from './blocks';
import { listChildren } from './children';
import { familyClaims, withFamilyContext } from './db';
import { explanationText } from './tutor-shape';

// A short quiz made from a tutor session at its end, kept with review dates (W16-B1, the proposal's M7; docs/AI_TUTOR_AGENT_PROGRESS.md
// "Programme W16").
//   - A session ends when a conversation has had no turn for ten minutes, or the child pressed "Done for now" or ended a
//     call (endSession). public.family_quiz_enqueue() (the migration) then enqueues one tutor.quiz job for the conversation
//     and the day: its payload is two ids' worth of facts (the conversation and the day), never a word of the child's.
//   - The job (quizJobHandler) works inside the conversation's own family session. It reads the session's turns (the
//     child's questions, the tutor's explanations), asks family.quiz through the gateway (prepareText: the same cleaning
//     of the child's name and the parent's email as every family call, the minors check, the daily cap, the ledger; no
//     database connection held while the model answers), keeps the items the one block checker accepts, and stores them
//     as a chapter test's items in family.session_quizzes with review dates at +1, +3 and +7 days.
//   - A quiz is played by the chapter test's own player and scored by the chapter test's own scorer (chapter-tests.ts
//     submitBlock), sealed tokens and all: the phone never holds an answer. Each take is a chapter_test_attempts row whose
//     block_id is the quiz id, so what was taken, the score and which review is due are read, not stored twice.
// Reviews: the first take is any time; review 1 is due on the made day +1, review 2 on +3, review 3 on +7; the quiz is
// "due" when the next review's date has come, and finished after the third.

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };
type Run = <R>(fn: (db: Db) => Promise<R>) => Promise<R>;

export const SESSION_GAP_MS = 10 * 60 * 1000;
export const REVIEW_AFTER_DAYS = [1, 3, 7] as const;
// The chapter key a quiz is sealed and scored under when the session had no chapter.
export const SESSION_QUIZ_KEY = 'session-quiz';
const TURN_TEXT = 600;
const CHILD_TURNS_READ = 12;
const MIN_ITEMS = 3;
// Up to two of the five are written (W17-B3). On 2 Nov they were removed because a written item stood unmarked beside a
// 3 of 3 score; now the AI marks each one when the quiz is sent (quiz-play.ts) and the verdict is shown beside it.
const MAX_WRITTEN = 2;
const DEVANAGARI = /[ऀ-ॿ]/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

// ---- review dates ------------------------------------------------------------------------------------------------

// `day` + n days, as a YYYY-MM-DD India date (calendar arithmetic only: no time zone is involved).
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const reviewDates = (day: string): string[] => REVIEW_AFTER_DAYS.map((n) => addDays(day, n));

export type QuizState = 'ready' | 'review' | 'scored';
// Where a quiz stands: never taken (ready), taken and the next review's day has come (review), otherwise scored.
export function quizState(takes: number, dueOn: readonly string[], today: string): { state: QuizState; due: string | null } {
  if (takes <= 0) return { state: 'ready', due: null };
  const next = dueOn[takes - 1];
  if (takes - 1 < REVIEW_AFTER_DAYS.length && next && next <= today) return { state: 'review', due: next };
  return { state: 'scored', due: takes - 1 < REVIEW_AFTER_DAYS.length ? (next ?? null) : null };
}

// ---- reading the model -------------------------------------------------------------------------------------------

export type ParsedQuiz = { title: string | null; items: TestItem[] };

// The model's JSON to checked items. Each item goes through the one block checker (as a chapter test of one item), so a
// multiple-choice item with a wrong key or an empty reason is dropped, never repaired. At least MIN_ITEMS must remain,
// at most QUIZ_ITEMS are kept, and at most MAX_WRITTEN of them written (the score still counts the choice items only). A Hindi quiz must be in Devanagari.
export function parseQuiz(text: string, lang: 'en' | 'hi'): ParsedQuiz | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const o = (raw ?? {}) as Record<string, unknown>;
  if (!Array.isArray(o.items)) return null;
  const items: TestItem[] = [];
  let written = 0;
  for (const r of o.items.slice(0, 12)) {
    if (items.length >= QUIZ_ITEMS) break;
    const x = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
    const id = `q${items.length + 1}`;
    const candidate =
      x.kind === 'mcq'
        ? { kind: 'mcq', id, question: x.question, options: x.options, answer: x.answer, why: x.why }
        : x.kind === 'written' && written < MAX_WRITTEN
          ? { kind: 'written', id, question: x.question, rubric: x.points }
          : null;
    if (!candidate) continue;
    const checked = checkBlock({ type: 'chapter_test', title: 'x', items: [candidate] });
    const item = checked && checked.type === 'chapter_test' ? checked.items[0] : null;
    if (!item) continue;
    // Two options that read the same cannot both be told apart, and "only one is right" would not hold.
    if (item.kind === 'mcq' && new Set(item.options.map((s) => s.toLowerCase())).size !== item.options.length) continue;
    if (item.kind === 'written') written += 1;
    items.push(item);
  }
  if (items.length < MIN_ITEMS) return null;
  if (lang === 'hi' && !DEVANAGARI.test(JSON.stringify(items))) return null;
  return { title: plain(o.title, 120), items };
}

// ---- the session's turns -----------------------------------------------------------------------------------------

export type SessionRead = { turns: { role: 'child' | 'tutor'; text: string }[]; chapterKey: string | null; childTurns: number };

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

// The conversation's last session: its newest messages, walking back while the gap to the next is under ten minutes.
export async function readSession(db: Db, conversationId: string): Promise<SessionRead> {
  const { rows } = await db.query(
    `select role, body, blocks, chapter_key, extract(epoch from created_at) * 1000 as at from family.tutor_messages where conversation_id = $1 order by created_at desc, role desc limit 80`,
    [conversationId]
  );
  const session: typeof rows = [];
  let after = Number.NaN;
  for (const r of rows) {
    const at = Number(r.at);
    if (session.length > 0 && after - at > SESSION_GAP_MS) break;
    session.push(r);
    after = at;
  }
  session.reverse();
  const turns = session
    .map((r) => ({ role: r.role === 'tutor' ? ('tutor' as const) : ('child' as const), text: clip(r.role === 'tutor' ? explanationText(r.blocks) : String(r.body ?? '').trim(), TURN_TEXT) }))
    .filter((x) => x.text.length > 0);
  const childTurns = turns.filter((x) => x.role === 'child').length;
  // Only the last CHILD_TURNS_READ questions and their answers go to the model.
  let seen = 0;
  const kept: typeof turns = [];
  for (const x of [...turns].reverse()) {
    if (x.role === 'child') seen += 1;
    if (seen > CHILD_TURNS_READ) break;
    kept.push(x);
  }
  const chapterKey = [...session].reverse().map((r) => r.chapter_key).find((k): k is string => typeof k === 'string') ?? null;
  return { turns: kept.reverse(), chapterKey, childTurns };
}

// ---- making the quiz ---------------------------------------------------------------------------------------------

export type QuizOutcome = 'made' | 'exists' | 'no_session' | AiRefusal | 'unusable';
// A refusal that trying again in a few minutes will not change (the profile off, the day's cap, a provider not cleared):
// the job ends without a quiz. A failed call or an answer that could not be used is tried again.
export const settled = (o: QuizOutcome): boolean => o !== 'failed' && o !== 'unusable';

export async function makeSessionQuiz(run: Run, input: { conversationId: string; day: string; today?: string }): Promise<QuizOutcome> {
  const prepared = await run(async (db) => {
    const have = await db.query(`select 1 from family.session_quizzes where conversation_id = $1 and session_day = $2`, [input.conversationId, input.day]);
    if (have.rows.length > 0) return 'exists' as const;
    const conv = (await db.query(`select account_id, child_id, subject from family.tutor_conversations where conversation_id = $1`, [input.conversationId])).rows[0];
    if (!conv) return 'no_session' as const;
    const accountId = String(conv.account_id);
    const children = await listChildren(db as never, accountId);
    const child = children.find((c) => c.childId === String(conv.child_id));
    if (!child) return 'no_session' as const;
    const session = await readSession(db, input.conversationId);
    if (session.childTurns < 1) return 'no_session' as const;
    const prompt = quizPrompt(await activePromptVersion(db as never, 'family.quiz'));
    const ask = { subject: String(conv.subject), classLevel: child.classLevel, board: child.board, lang: child.language, chapter: session.chapterKey, turns: session.turns };
    const ai: AiContext = { accountId, childFirstNames: children.map((c) => c.firstName), parentEmail: (await accountSummary(db as never, accountId))?.email ?? '', day: input.today ?? indiaDate() };
    const out = await prepareText(db as never, ai, 'family.quiz', { system: prompt.system(), messages: [{ role: 'user', content: prompt.user(ask) }], responseFormat: 'json' });
    if (!out.ok) return out.reason;
    return { text: out.text, accountId, childId: child.childId, subject: String(conv.subject), lang: child.language, chapterKey: session.chapterKey };
  });
  if (typeof prepared === 'string') return prepared;
  const sent = await prepared.text.send();
  const parsed = sent.result.ok ? parseQuiz(sent.result.text, prepared.lang) : null;
  return run(async (db) => {
    await sent.record(db as never);
    if (!sent.result.ok) return 'failed' as const;
    if (!parsed) return 'unusable' as const;
    const title = parsed.title ?? t(prepared.lang, 'fam.quiz.cardTitle');
    const made = await db.query(
      `insert into family.session_quizzes (account_id, child_id, conversation_id, session_day, subject, chapter_key, lang, title, items, review_due_on)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::date[]) on conflict (conversation_id, session_day) do nothing`,
      [prepared.accountId, prepared.childId, input.conversationId, input.day, prepared.subject, prepared.chapterKey, prepared.lang, title, JSON.stringify(parsed.items), reviewDates(input.day)]
    );
    return (made.rowCount ?? 0) > 0 ? ('made' as const) : ('exists' as const);
  });
}

// The job. `platform`: the platform role, used only to learn whose conversation it is (family.quiz_session); the work is
// done inside that account's own family session. `note` receives the outcome (a word and a number, never a child's words).
// A payload that is not a conversation and a day ends the job with nothing made (retrying cannot fix it).
type JobShape = { payload: Record<string, unknown>; attempts: number };
export function quizJobHandler({ platform, note = () => {} }: { platform: <T>(fn: (db: Db) => Promise<T>) => Promise<T>; note?: (facts: { outcome: QuizOutcome; attempts: number }) => void }) {
  return async (job: JobShape): Promise<void> => {
    const { conversationId, day } = job.payload;
    if (!isUuid(conversationId) || typeof day !== 'string' || !DAY.test(day)) return note({ outcome: 'no_session', attempts: job.attempts });
    const owner = (await platform((db) => db.query(`select account_id, token_version from family.quiz_session($1)`, [conversationId]))).rows[0] as { account_id: string; token_version: number } | undefined;
    if (!owner) return note({ outcome: 'no_session', attempts: job.attempts });
    const claims = familyClaims({ accountId: owner.account_id, tokenVersion: Number(owner.token_version) });
    const outcome = await makeSessionQuiz((fn) => withFamilyContext(claims, fn as never), { conversationId, day });
    note({ outcome, attempts: job.attempts });
    if (!settled(outcome)) throw new Error(`quiz ${outcome}`);
  };
}

// ---- ending a session by hand ------------------------------------------------------------------------------------

// "Done for now" on the Study feed, or the end of a call: the child's own chat, marked ended now. True when it was.
export async function endSession(db: Db, who: { accountId: string; childId: string }, chatId: unknown): Promise<boolean> {
  if (!isUuid(chatId)) return false;
  const done = await db.query(
    `update family.tutor_conversations set session_ended_at = now() where conversation_id = $1 and account_id = $2 and child_id = $3 and turn_count >= 1`,
    [chatId, who.accountId, who.childId]
  );
  return (done.rowCount ?? 0) > 0;
}

// ---- what the child sees -----------------------------------------------------------------------------------------

export type SessionQuiz = {
  quizId: string;
  conversationId: string;
  sessionDay: string;
  subject: string;
  chapterKey: string | null;
  lang: 'en' | 'hi';
  title: string;
  items: TestItem[];
  reviewDueOn: string[];
};
export type QuizCard = {
  quizId: string;
  subject: string;
  title: string;
  lang: 'en' | 'hi';
  state: QuizState;
  // The session's India date: "today's" Science, or an earlier day's.
  day: string;
  questions: number;
  // The latest take's multiple-choice score, when there is one.
  score: { correct: number; total: number } | null;
  due: string | null;
};

const CARD_DAYS = 21;
// The chapter key a quiz is sealed and scored under.
export const sealKey = (q: Pick<SessionQuiz, 'chapterKey'>) => q.chapterKey ?? SESSION_QUIZ_KEY;

// The child's quizzes of the last weeks, newest first: ready and due ones first. `subject`: only that subject's (Study).
export async function quizCards(db: Db, who: { accountId: string; childId: string }, today: string, opts: { subject?: string; limit?: number } = {}): Promise<QuizCard[]> {
  await db.query('savepoint quiz_read');
  try {
    const { rows } = await db.query(
      `select q.quiz_id, q.subject, q.title, q.lang, q.session_day::text as day, jsonb_array_length(q.items) as questions, q.review_due_on::text[] as due,
              (select count(*)::int from family.chapter_test_attempts a where a.account_id = q.account_id and a.child_id = q.child_id and a.block_id = q.quiz_id::text) as takes,
              (select json_build_object('correct', a.mcq_correct, 'total', a.mcq_total) from family.chapter_test_attempts a
                where a.account_id = q.account_id and a.child_id = q.child_id and a.block_id = q.quiz_id::text order by a.submitted_at desc limit 1) as last
         from family.session_quizzes q
        where q.account_id = $1 and q.child_id = $2 and q.created_at > now() - make_interval(days => $3) and ($4::text is null or q.subject = $4)
        order by q.created_at desc limit 12`,
      [who.accountId, who.childId, CARD_DAYS, opts.subject ?? null]
    );
    await db.query('release savepoint quiz_read');
    const cards = rows.map((r): QuizCard => {
      const s = quizState(Number(r.takes), (r.due as string[]) ?? [], today);
      const last = r.last as { correct: number; total: number } | null;
      return { quizId: String(r.quiz_id), subject: String(r.subject), title: String(r.title), lang: r.lang === 'hi' ? 'hi' : 'en', state: s.state, day: String(r.day), questions: Number(r.questions), score: last && last.total > 0 ? { correct: Number(last.correct), total: Number(last.total) } : null, due: s.due };
    });
    const rank = { review: 0, ready: 1, scored: 2 } as const;
    return cards.sort((a, b) => rank[a.state] - rank[b.state]).slice(0, opts.limit ?? 3);
  } catch (err) {
    // The tables are made by a migration: before it is applied there are none to show.
    if ((err as { code?: string }).code !== '42P01') throw err;
    await db.query('rollback to savepoint quiz_read');
    return [];
  }
}

// One of the child's own quizzes, or null (another child's, another family's and a missing one read the same).
export async function loadQuiz(db: Db, who: { accountId: string; childId: string }, quizId: unknown): Promise<SessionQuiz | null> {
  if (!isUuid(quizId)) return null;
  const { rows } = await db.query(
    `select quiz_id, conversation_id, session_day::text as day, subject, chapter_key, lang, title, items, review_due_on::text[] as due
       from family.session_quizzes where quiz_id = $1 and account_id = $2 and child_id = $3`,
    [quizId, who.accountId, who.childId]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    quizId: String(r.quiz_id),
    conversationId: String(r.conversation_id),
    sessionDay: String(r.day),
    subject: String(r.subject),
    chapterKey: (r.chapter_key as string | null) ?? null,
    lang: r.lang === 'hi' ? 'hi' : 'en',
    title: String(r.title),
    items: r.items as TestItem[],
    reviewDueOn: (r.due as string[]) ?? [],
  };
}
