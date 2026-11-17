import { bookChapter } from './books';
import { isSubject } from './subjects';
import type { TutorConversation } from './tutor-feed-view';

// The child's conversation history (founder, 17 Nov 2026): every listed chat (open and full) of this one child, in every
// subject, with what the history needs to group and date it. A chat is a book chapter's when all its questions were
// asked in that chapter (the scoped chats of W23-C); the chapter's name comes from the book registry, never the
// request. The caller has chosen the child on the server (tutorChild); the policies keep the read to the account.

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export const HISTORY_MAX = 100;
const BOOK_KEY = /^u\.c[0-9]{2}\./;
const MISSING_TABLE = '42P01';

export function conversationOf(r: Record<string, unknown>): TutorConversation | null {
  const subject = String(r.subject);
  if (!isSubject(subject)) return null;
  const key = typeof r.chapter_key === 'string' && BOOK_KEY.test(r.chapter_key) ? r.chapter_key : null;
  const found = key ? bookChapter(key) : null;
  return {
    chatId: String(r.conversation_id),
    subject,
    chapterKey: found ? found.chapter.key : null,
    chapterTitle: found ? { en: found.chapter.title.en, hi: found.chapter.title.hi } : null,
    title: typeof r.title === 'string' && r.title.trim() ? r.title.trim() : null,
    questions: Number(r.turn_count) || 0,
    lastAt: new Date(r.last_at as string).toISOString(),
  };
}

export async function listConversations(db: Db, accountId: string, childId: string): Promise<TutorConversation[]> {
  await db.query('savepoint tutor_history');
  try {
    const { rows } = await db.query(
      `select c.conversation_id, c.subject, c.title, c.turn_count, c.last_at,
              (select case when count(*) = count(k.chapter_key) and count(distinct k.chapter_key) = 1 then min(k.chapter_key) end
                 from family.tutor_messages k where k.conversation_id = c.conversation_id and k.role = 'child') as chapter_key
         from family.tutor_conversations c
        where c.account_id = $1 and c.child_id = $2 and c.status in ('open', 'full')
          and exists (select 1 from family.tutor_messages m where m.conversation_id = c.conversation_id)
        order by c.last_at desc, c.created_at desc limit $3`,
      [accountId, childId, HISTORY_MAX]
    );
    await db.query('release savepoint tutor_history');
    return rows.map(conversationOf).filter((c): c is TutorConversation => c !== null);
  } catch (err) {
    if ((err as { code?: string }).code !== MISSING_TABLE) throw err;
    await db.query('rollback to savepoint tutor_history');
    return [];
  }
}
