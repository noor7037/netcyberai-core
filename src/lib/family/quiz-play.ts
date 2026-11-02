import type { ChapterTest } from './blocks';
import type { PublicChapterTest } from './chapter-test-shape';
import { publicItem, submitBlock, type Submitted } from './chapter-tests';
import { loadQuiz, sealKey, type SessionQuiz } from './quiz';

// Playing a Quick quiz (W16-B1): the quiz in the form the phone gets, and sending it. Apart from quiz.ts so the job that
// makes quizzes (registered with every other job) does not load the chapter test's scorer and the tutor's file store.
type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };

// The quiz as the phone gets it: the questions and options with sealed tokens, no answer, no reason.
export function publicQuiz(q: SessionQuiz, who: { accountId: string; childId: string }): PublicChapterTest {
  const seal = { accountId: who.accountId, childId: who.childId, chapterKey: sealKey(q), subject: q.subject };
  return { type: 'chapter_test', title: q.title, items: q.items.map((i) => publicItem(i, seal)), id: q.quizId };
}

// Sending a quiz: scored by the chapter test's scorer, kept as an attempt under the quiz's id.
export async function submitQuiz(db: Db, who: { accountId: string; childId: string }, quizId: unknown, answers: unknown, now: number = Date.now()): Promise<Submitted> {
  const q = await loadQuiz(db, who, quizId);
  if (!q) return { ok: false, reason: 'not_found' };
  const block: ChapterTest = { type: 'chapter_test', title: q.title, items: q.items };
  return submitBlock(db, who, { chapterKey: sealKey(q), lang: q.lang, blockId: q.quizId, block }, answers, now);
}
