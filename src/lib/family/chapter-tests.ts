import type { Block, ChapterTest, TestItem } from './blocks';
import { chapterView, type Chapter } from './chapters';
import { TEST_TEXT_MAX, type PublicChapterTest, type PublicTestItem, type ReaderBlock, type TestResult } from './chapter-test-shape';
import { openItem, sealItem } from './items';
import { isUuid, testTextProblem } from './tutor';

// Chapter tests (S5, C378; docs/37 §4 Wave 2), on the family's own transaction.
//   - The chapter's authored test holds each question's answer and reason. The phone gets only the public form: a
//     multiple-choice item as a sealed token (the same scheme as a check item, but of its own kind 'test', so the check
//     route refuses it), a written or photo item with its rubric.
//   - A test is sent once, whole: the server opens every token, finds which choices are right, and records the attempt. A
//     row exists only because the child sent it; nothing is pre-filled and there is no score the server did not compute
//     from a sealed answer. A written or photo answer is stored as sent, with its question and rubric, for the parent or
//     teacher to read and mark: the app never marks it and invents no score.
//   - A photo answer is a file in the tutor's private bucket (S2): the child attaches it through the tutor's upload door
//     (tutor.ts), and the test keeps it (family.tutor_attachments.kept_for = 'test').

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };
const MISSING_TABLE = '42P01';

export type Sealing = { accountId: string; childId: string; chapterKey: string; subject: string };

const publicItem = (item: TestItem, seal: Sealing): PublicTestItem => {
  if (item.kind !== 'mcq') return { kind: item.kind, id: item.id, question: item.question, rubric: item.rubric };
  const { token } = sealItem(
    { id: item.id, question: item.question, options: item.options, answer: item.answer, hint: '', why: item.why, wrong: item.options.map(() => item.why) },
    { accountId: seal.accountId, childId: seal.childId, topicKey: seal.chapterKey, subject: seal.subject, kind: 'test' }
  );
  return { kind: 'mcq', id: item.id, question: item.question, options: item.options, token };
};

// The blocks as the phone gets them: every chapter test in its public form (no answers, no reasons).
export function readerBlocks(blocks: readonly Block[], seal: Sealing): ReaderBlock[] {
  return blocks.map((b): ReaderBlock => {
    if (b.type !== 'chapter_test') return b;
    const t: ChapterTest = b;
    const out: PublicChapterTest = { type: 'chapter_test', title: t.title, items: t.items.map((i) => publicItem(i, seal)), ...(b.id ? { id: b.id } : {}) };
    return out;
  });
}

export type Sent = { itemId: string; token?: string; choice?: number; text?: string; attachmentId?: string };
export type SubmitRefusal = 'bad_request' | 'not_found' | 'incomplete' | 'item_expired' | 'text_unsuitable' | 'photo_not_ready';
export type Submitted = { ok: true; result: TestResult } | { ok: false; reason: SubmitRefusal; detail?: string };

const asSent = (v: unknown): Sent[] | null => {
  if (!Array.isArray(v) || v.length < 1 || v.length > 8) return null;
  const out: Sent[] = [];
  for (const raw of v) {
    const o = (raw ?? {}) as Record<string, unknown>;
    if (typeof o.itemId !== 'string') return null;
    out.push({
      itemId: o.itemId,
      ...(typeof o.token === 'string' ? { token: o.token } : {}),
      ...(typeof o.choice === 'number' ? { choice: o.choice } : {}),
      ...(typeof o.text === 'string' ? { text: o.text } : {}),
      ...(typeof o.attachmentId === 'string' ? { attachmentId: o.attachmentId } : {}),
    });
  }
  return new Set(out.map((s) => s.itemId)).size === out.length ? out : null;
};

// Does a request carry a photo answer? (The route checks the parent's photo consent only then.)
export const sendsPhoto = (answers: unknown): boolean => Array.isArray(answers) && answers.some((a) => a && typeof a === 'object' && typeof (a as Sent).attachmentId === 'string');

export async function submitTest(
  db: Db,
  who: { accountId: string; childId: string },
  chapter: Chapter,
  lang: string,
  input: { blockId: unknown; answers: unknown },
  now: number = Date.now()
): Promise<Submitted> {
  if (typeof input.blockId !== 'string') return { ok: false, reason: 'bad_request' };
  const view = chapterView(chapter, lang);
  const at = view.ids.indexOf(input.blockId);
  const block = at >= 0 ? view.blocks[at] : null;
  if (!block || block.type !== 'chapter_test') return { ok: false, reason: 'not_found' };
  const sent = asSent(input.answers);
  if (!sent) return { ok: false, reason: 'bad_request' };
  const byId = new Map(block.items.map((i) => [i.id, i]));
  if (sent.some((s) => !byId.has(s.itemId))) return { ok: false, reason: 'bad_request' };
  const given = new Map(sent.map((s) => [s.itemId, s]));

  type Row = { itemId: string; kind: TestItem['kind']; question: string; choice?: number; correct?: boolean; why?: string; body?: string; attachmentId?: string; rubric?: string[] };
  const rows: Row[] = [];
  for (const item of block.items) {
    const s = given.get(item.id);
    if (item.kind === 'mcq') {
      // Every multiple-choice question is answered: the score counts the test as it was, never a part of it.
      if (!s) return { ok: false, reason: 'incomplete' };
      const secret = openItem(s.token, who, now);
      if (!secret) return { ok: false, reason: 'item_expired' };
      if (secret.kind !== 'test' || secret.k !== chapter.key || secret.i !== item.id) return { ok: false, reason: 'bad_request' };
      if (!Number.isInteger(s.choice) || (s.choice as number) < 0 || (s.choice as number) >= secret.o.length) return { ok: false, reason: 'bad_request' };
      rows.push({ itemId: item.id, kind: 'mcq', question: secret.q, choice: s.choice, correct: s.choice === secret.a, why: secret.y });
    } else if (s) {
      if (item.kind === 'written') {
        const body = typeof s.text === 'string' ? s.text.trim() : '';
        if (body.length < 1 || body.length > TEST_TEXT_MAX) return { ok: false, reason: 'bad_request' };
        if (testTextProblem(body)) return { ok: false, reason: 'text_unsuitable', detail: item.id };
        rows.push({ itemId: item.id, kind: 'written', question: item.question, body, rubric: item.rubric });
      } else {
        if (!isUuid(s.attachmentId)) return { ok: false, reason: 'bad_request' };
        rows.push({ itemId: item.id, kind: 'photo', question: item.question, attachmentId: s.attachmentId, rubric: item.rubric });
      }
    }
  }
  if (rows.length === 0) return { ok: false, reason: 'bad_request' };

  // A photo is this child's own, kept and unsent file, not already used for another answer.
  const photos = rows.filter((r) => r.kind === 'photo').map((r) => r.attachmentId as string);
  if (photos.length) {
    const ok = await db.query(
      `select attachment_id from family.tutor_attachments where attachment_id = any($1::uuid[]) and account_id = $2 and child_id = $3 and status = 'ready' and message_id is null and kept_for is null and mime in ('image/png', 'image/jpeg', 'image/webp')`,
      [photos, who.accountId, who.childId]
    );
    if (new Set(photos).size !== photos.length || ok.rows.length !== photos.length) return { ok: false, reason: 'photo_not_ready' };
  }

  const mcq = rows.filter((r) => r.kind === 'mcq');
  const mcqCorrect = mcq.filter((r) => r.correct === true).length;
  const attempt = await db.query(
    `insert into family.chapter_test_attempts (account_id, child_id, chapter_key, block_id, lang, mcq_total, mcq_correct) values ($1, $2, $3, $4, $5, $6, $7) returning attempt_id`,
    [who.accountId, who.childId, chapter.key, input.blockId, view.lang, mcq.length, mcqCorrect]
  );
  const attemptId = String(attempt.rows[0].attempt_id);
  for (const r of rows) {
    await db.query(
      `insert into family.chapter_test_answers (attempt_id, account_id, child_id, item_id, kind, question, choice, correct, body, attachment_id, rubric) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
      [attemptId, who.accountId, who.childId, r.itemId, r.kind, r.question, r.choice ?? null, r.correct ?? null, r.body ?? null, r.attachmentId ?? null, r.rubric ? JSON.stringify(r.rubric) : null]
    );
  }
  if (photos.length) await db.query(`update family.tutor_attachments set kept_for = 'test' where attachment_id = any($1::uuid[]) and account_id = $2 and child_id = $3`, [photos, who.accountId, who.childId]);
  return {
    ok: true,
    result: {
      attemptId,
      mcqTotal: mcq.length,
      mcqCorrect,
      items: rows.map((r) => ({ id: r.itemId, kind: r.kind, ...(r.kind === 'mcq' ? { correct: r.correct, why: r.why } : {}) })),
    },
  };
}

// ---- what the parent reads ------------------------------------------------------------------------------------------

export type AttemptAnswer = { itemId: string; kind: 'mcq' | 'written' | 'photo'; question: string; choice: number | null; correct: boolean | null; body: string | null; attachmentId: string | null; rubric: string[] | null };
export type Attempt = { attemptId: string; childId: string; chapterKey: string; lang: 'en' | 'hi'; mcqTotal: number; mcqCorrect: number; submittedAt: string; answers: AttemptAnswer[] };

// The account's attempts, newest first (at most `limit`), each with its answers. A table not created yet reads as none.
export async function listAttempts(db: Db, accountId: string, limit = 50): Promise<Attempt[]> {
  await db.query('savepoint test_read');
  try {
    const { rows } = await db.query(
      `select a.attempt_id, a.child_id, a.chapter_key, a.lang, a.mcq_total, a.mcq_correct, a.submitted_at,
              coalesce((select json_agg(json_build_object('itemId', x.item_id, 'kind', x.kind, 'question', x.question, 'choice', x.choice, 'correct', x.correct, 'body', x.body, 'attachmentId', x.attachment_id, 'rubric', x.rubric) order by x.answer_id)
                          from family.chapter_test_answers x where x.attempt_id = a.attempt_id), '[]'::json) as answers
         from family.chapter_test_attempts a where a.account_id = $1 order by a.submitted_at desc limit $2`,
      [accountId, limit]
    );
    await db.query('release savepoint test_read');
    return rows.map((r) => ({
      attemptId: String(r.attempt_id),
      childId: String(r.child_id),
      chapterKey: String(r.chapter_key),
      lang: r.lang === 'hi' ? 'hi' : 'en',
      mcqTotal: Number(r.mcq_total),
      mcqCorrect: Number(r.mcq_correct),
      submittedAt: new Date(r.submitted_at as string).toISOString(),
      answers: (r.answers as AttemptAnswer[]) ?? [],
    }));
  } catch (err) {
    if ((err as { code?: string }).code !== MISSING_TABLE) throw err;
    await db.query('rollback to savepoint test_read');
    return [];
  }
}
