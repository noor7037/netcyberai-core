import { prepareText, type AiContext } from '@/lib/ai/platform';
import { markSystem, markUser } from '@/lib/ai/prompts/family.quiz';
import { indiaDate } from '@/lib/time/india';
import { accountSummary } from './account';
import type { ChapterTest } from './blocks';
import type { PublicChapterTest, TestResult } from './chapter-test-shape';
import { publicItem, submitBlock, type Submitted } from './chapter-tests';
import { listChildren } from './children';
import { loadQuiz, sealKey, type SessionQuiz } from './quiz';

// Playing a Quick quiz (W16-B1): the quiz in the form the phone gets, and sending it. Apart from quiz.ts so the job that
// makes quizzes (registered with every other job) does not load the chapter test's scorer and the tutor's file store.
type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };

// The quiz as the phone gets it: the questions and options with sealed tokens, no answer, no reason.
export function publicQuiz(q: SessionQuiz, who: { accountId: string; childId: string }): PublicChapterTest {
  const seal = { accountId: who.accountId, childId: who.childId, chapterKey: sealKey(q), subject: q.subject };
  return { type: 'chapter_test', title: q.title, items: q.items.map((i) => publicItem(i, seal)), id: q.quizId };
}

// ---- marking the written answers (W17-B3) --------------------------------------------------------------------------

export type Verdict = 'right' | 'partly' | 'wrong';
export type Mark = { verdict: Verdict; note: string };
const VERDICTS: readonly string[] = ['right', 'partly', 'wrong'];
const NOTE_MAX = 300;

// The marker's JSON, read strictly: every id must be one of the written answers sent, once; a verdict is one of the three
// words; a note is 1 to 300 characters of plain text (markup taken out, a longer one refused, never cut). Anything else
// and the whole reply is refused (null), so a half-understood answer marks nothing. An id the model left out stays unmarked.
export function parseMarks(text: string, ids: readonly string[]): Map<string, Mark> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const list = (raw as { items?: unknown } | null)?.items;
  if (!Array.isArray(list) || list.length < 1 || list.length > ids.length) return null;
  const marks = new Map<string, Mark>();
  for (const r of list) {
    const x = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
    if (typeof x.id !== 'string' || !ids.includes(x.id) || marks.has(x.id)) return null;
    if (typeof x.verdict !== 'string' || !VERDICTS.includes(x.verdict)) return null;
    if (typeof x.note !== 'string' || x.note.trim().length > NOTE_MAX) return null;
    const note = x.note
      .replace(/<[^>]*>/g, ' ')
      .replace(/[<>]/g, ' ')
      .replace(/\*\*|__|`+|^#{1,6}\s+/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (note.length < 1) return null;
    marks.set(x.id, { verdict: x.verdict as Verdict, note });
  }
  return marks;
}

// One call marks every written answer of the attempt, through the gateway with the quiz's own profile (the child's words
// carry the same cleaning, minors check, daily cap and ledger as the quiz that was made). Stored: `correct` (true only for
// "right"; "partly" is false) and the note, on the answer row. A quiz is a quick check, not a record: a refusal, a failed
// call or a reply that cannot be read stores nothing and the items come back "unmarked"; nothing is retried, and the
// choice score is never touched (mcq_total and mcq_correct on the attempt stay as the scorer wrote them).
async function markWritten(db: Db, who: { accountId: string; childId: string }, q: SessionQuiz, scored: TestResult): Promise<TestResult> {
  const ids = scored.items.filter((i) => i.kind === 'written').map((i) => i.id);
  if (ids.length === 0) return scored;
  const unmarked = (): TestResult => ({ ...scored, items: scored.items.map((i) => (i.kind === 'written' ? { ...i, verdict: 'unmarked' as const } : i)) });
  const marks = await askMarks(db, who, q, scored.attemptId, ids);
  if (!marks || marks.size === 0) return unmarked();
  // The marks go in under a savepoint: before the migration that allows them is applied the write is refused, and the
  // child's quiz must still show (42703 no column, 23514 the old check, 42501 no update right).
  await db.query('savepoint quiz_mark');
  try {
    for (const [id, m] of marks) {
      await db.query(`update family.chapter_test_answers set correct = $1, note = $2 where attempt_id = $3 and account_id = $4 and child_id = $5 and item_id = $6 and kind = 'written'`, [m.verdict === 'right', m.note, scored.attemptId, who.accountId, who.childId, id]);
    }
    await db.query('release savepoint quiz_mark');
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== '42703' && code !== '23514' && code !== '42501') throw err;
    await db.query('rollback to savepoint quiz_mark');
    return unmarked();
  }
  return {
    ...scored,
    items: scored.items.map((i) => {
      if (i.kind !== 'written') return i;
      const m = marks.get(i.id);
      return m ? { ...i, correct: m.verdict === 'right', verdict: m.verdict, note: m.note } : { ...i, verdict: 'unmarked' as const };
    }),
  };
}

async function askMarks(db: Db, who: { accountId: string; childId: string }, q: SessionQuiz, attemptId: string, ids: string[]): Promise<Map<string, Mark> | null> {
  const given = (await db.query(`select item_id, question, body, rubric from family.chapter_test_answers where attempt_id = $1 and account_id = $2 and child_id = $3 and kind = 'written'`, [attemptId, who.accountId, who.childId])).rows;
  const items = given.filter((r) => ids.includes(String(r.item_id))).map((r) => ({ id: String(r.item_id), question: String(r.question), points: (r.rubric as string[]) ?? [], answer: String(r.body ?? '') }));
  if (items.length === 0) return null;
  const children = await listChildren(db as never, who.accountId);
  const child = children.find((c) => c.childId === who.childId);
  if (!child) return null;
  const ai: AiContext = { accountId: who.accountId, childFirstNames: children.map((c) => c.firstName), parentEmail: (await accountSummary(db as never, who.accountId))?.email ?? '', day: indiaDate() };
  const out = await prepareText(db as never, ai, 'family.quiz', { system: markSystem(), messages: [{ role: 'user', content: markUser({ classLevel: child.classLevel, board: child.board, lang: q.lang, items }) }], responseFormat: 'json' });
  if (!out.ok) return null;
  const sent = await out.text.send().catch(() => null);
  if (!sent) return null;
  await sent.record(db as never);
  return sent.result.ok ? parseMarks(sent.result.text, items.map((i) => i.id)) : null;
}

// Sending a quiz: scored by the chapter test's scorer, kept as an attempt under the quiz's id; each written answer is then
// marked by the AI (above) and its verdict and note come back with the result.
export async function submitQuiz(db: Db, who: { accountId: string; childId: string }, quizId: unknown, answers: unknown, now: number = Date.now()): Promise<Submitted> {
  const q = await loadQuiz(db, who, quizId);
  if (!q) return { ok: false, reason: 'not_found' };
  const block: ChapterTest = { type: 'chapter_test', title: q.title, items: q.items };
  const done = await submitBlock(db, who, { chapterKey: sealKey(q), lang: q.lang, blockId: q.quizId, block }, answers, now);
  if (!done.ok) return done;
  return { ok: true, result: await markWritten(db, who, q, done.result) };
}
