import { activePromptVersion, prepareText, type AiContext } from '@/lib/ai/platform';
import type { ResolverMemory } from '@/lib/ai/prompts/family.resolver';
import { SUMMARY_MAX, summaryPrompt } from '@/lib/ai/prompts/family.summary';
import { checkUpload, textProblem, type OcrImage } from '@/lib/privacy/upload-check';
import { FileStorageUnavailableError, type DirectUploadStorage } from '@/lib/storage/file-storage';
import { familyTutorFileStorage } from '@/lib/storage/supabase-file-storage';
import type { Block } from './blocks';
import { parseBlockLine } from './blocks';
import { chapterView, showcaseChapter } from './chapters';
import { activeChild, isPrePrimary, listChildren, type FamilyChild } from './children';
import { consentState } from './consent';
import { photoGate } from './photo-gate';
import { isSubject } from './subjects';
import { TUTOR_FILE_MAX_BYTES, TUTOR_FILES_PER_TURN, TUTOR_TEXT_MAX, isTutorFileType, keptTutorBlocks, sniffTutorFile, type FeedTurn, type TutorFileType, type TutorTurn } from './tutor-shape';

// The shared tutor window's history and files (S2, C375; docs/37 §4 Wave 2), on the family's own transaction (the
// family_app role; every tutor table's policies keep each row to its own account, and on a child's own phone to that
// one child). The child is always the one the server chose for this phone (the chosen-child cookie, or the phone's own
// child), never one a request names, so a sibling never reads another child's conversation.
//
// The one family door to the private `family-tutor` bucket and to the upload check every kept file goes through
// (scripts/check_family_boundary.py). A file goes straight from the phone to the bucket (the app's hosting refuses a
// body over 4.5 MB), the way a record's paper does (src/lib/documents/record-direct-upload.ts), in three steps:
//   1. ask       the declared type (PNG, JPEG, WebP or PDF), size (at most 10 MB) and name (no Aadhaar number or card
//                words; the name itself is never kept) are checked; a 'pending' row is written with the key the file
//                will be kept at, "<account>/<child>/<attachment>.<ext>", and an upload link is given for its pending
//                key, "pending/<account>/<attachment>.<ext>", only (never overwriting a file).
//   2. send      the phone sends the file to the link.
//   3. confirm   the server reads what arrived: its recorded size and type, then its bytes; the real size, the first
//                bytes (which must be the declared type) and the Aadhaar upload check (C232 part A). Then it moves the
//                file to its kept key, reads it back there (only the very bytes checked are kept) and marks the row
//                'ready'. Any refusal takes the file away and removes the row.
// A file is only ever handed out as a signed link that works for one minute, after its row was read for this account
// and child. Clearing a conversation (the Learning Vault) removes its files from the bucket in the same request; if the
// bucket cannot be reached, nothing is cleared, so a row never outlives its file's removal by mistake.

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };

export const tutorStorage: DirectUploadStorage = familyTutorFileStorage;
export const SIGNED_READ_SECONDS = 60;
// A pending upload stops after fifteen minutes; its row and file are removed by the next ask of the same account.
export const PENDING_MINUTES = 15;
// At most this many files a child may attach in a day: a guard on the bucket, not a teaching limit.
export const FILES_PER_DAY = 30;
const TURNS_SHOWN = 60;

const EXT: Record<TutorFileType, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
export const tutorFileKey = (accountId: string, childId: string, attachmentId: string, mime: TutorFileType) => `${accountId}/${childId}/${attachmentId}.${EXT[mime]}`;
export const tutorPendingFolder = (accountId: string) => `pending/${accountId}/`;
export const tutorPendingKey = (accountId: string, attachmentId: string, mime: TutorFileType) => `${tutorPendingFolder(accountId)}${attachmentId}.${EXT[mime]}`;
const pendingOf = (r: { account_id: unknown; attachment_id: unknown; mime: unknown }) => tutorPendingKey(String(r.account_id), String(r.attachment_id), r.mime as TutorFileType);

// A table not created yet (the migration not applied) reads as empty instead of failing the page.
const MISSING_TABLE = '42P01';
async function guarded<T>(db: Db, fn: () => Promise<T>, fallback: T): Promise<T> {
  await db.query('savepoint tutor_read');
  try {
    const out = await fn();
    await db.query('release savepoint tutor_read');
    return out;
  } catch (err) {
    if ((err as { code?: string }).code !== MISSING_TABLE) throw err;
    await db.query('rollback to savepoint tutor_read');
    return fallback;
  }
}

// ---- chats (W9-A, C406; docs/39 §3 "Chat"; W10-4, C413: §5 "Chat, final rule") ----------------------------------------
// A child has chats per subject: at most CHATS_KEPT listed (open or full; a new one past that archives the least
// recently used). W10-4 (C413): the screen shows no list of chats; it shows the subject's feed (readFeed), every turn
// of the subject's chats in order, and the feed keeps the subject's last FEED_TURNS child turns: a child turn past that
// deletes the oldest (with its answer and files) in the same transaction, so a chat is no longer marked 'full' (a chat
// marked full before W10-4 still refuses a turn with 'chat_full', and the answer goes to a new chat). The tutor is sent the chat's running summary (rewritten every SUMMARY_EVERY child turns
// by the family.summary workload) and its last MEMORY_TURNS turns: the child's words and the tutor's explanation
// paragraphs only, each at most MEMORY_TEXT characters. An archived chat is no longer listed or answered in; the
// parent still sees and clears it in the Learning Vault, and it goes with the child.

export const CHATS_KEPT = 15;
export const CHAT_TURNS = 30;
// The child turns a subject's feed keeps (docs/39 §5): the 31st deletes the oldest.
export const FEED_TURNS = 30;
export const MEMORY_TURNS = 6;
export const MEMORY_TEXT = 600;
export const SUMMARY_EVERY = 5;
const TITLE_MAX = 60;
// At most this many child turns are read into one summary rewrite (the turns since the last one, normally five).
const SUMMARY_TURNS_READ = 10;

export type TutorChat = { chatId: string; title: string | null; turnCount: number; status: 'open' | 'full'; lastAt: string };

const chatOf = (r: Record<string, unknown>): TutorChat => ({
  chatId: String(r.conversation_id),
  title: (r.title as string | null) ?? null,
  turnCount: Number(r.turn_count),
  status: r.status === 'full' ? 'full' : 'open',
  lastAt: new Date(r.last_at as string).toISOString(),
});
const CHAT_COLUMNS = 'conversation_id, title, turn_count, status, last_at';
const NEWEST = 'order by last_at desc, created_at desc';

// A new chat in a subject; the chats listed beyond CHATS_KEPT (the least recently used) are archived.
export async function newChat(db: Db, accountId: string, childId: string, subject: string): Promise<string> {
  if (!isSubject(subject)) throw new Error('not a subject');
  const { rows } = await db.query(
    `insert into family.tutor_conversations (account_id, child_id, subject, created_at, last_at) values ($1, $2, $3, clock_timestamp(), clock_timestamp()) returning conversation_id`,
    [accountId, childId, subject]
  );
  await archiveOverflow(db, accountId, childId, subject);
  return String(rows[0].conversation_id);
}

// The chats listed in a subject beyond CHATS_KEPT (the least recently used) are archived.
async function archiveOverflow(db: Db, accountId: string, childId: string, subject: string): Promise<void> {
  await db.query(
    `update family.tutor_conversations set status = 'archived', updated_at = now()
      where conversation_id in (select conversation_id from family.tutor_conversations
                                 where account_id = $1 and child_id = $2 and subject = $3 and status <> 'archived' ${NEWEST} offset $4)`,
    [accountId, childId, subject, CHATS_KEPT]
  );
}

// The newest open chat in a subject, or a new one.
export async function openChat(db: Db, accountId: string, childId: string, subject: string): Promise<string> {
  if (!isSubject(subject)) throw new Error('not a subject');
  const { rows } = await db.query(
    `select conversation_id from family.tutor_conversations where account_id = $1 and child_id = $2 and subject = $3 and status = 'open' ${NEWEST} limit 1`,
    [accountId, childId, subject]
  );
  return rows[0] ? String(rows[0].conversation_id) : newChat(db, accountId, childId, subject);
}

// Where a file is filed when it is sent (S2's name): the subject's newest open chat. It joins its question's chat later.
export const conversationFor = openChat;

// The child's chats in a subject, open and full, the most recently used first.
export function listChats(db: Db, accountId: string, childId: string, subject: string): Promise<TutorChat[]> {
  if (!isSubject(subject)) return Promise.resolve([]);
  return guarded(
    db,
    async () =>
      (
        await db.query(
          `select ${CHAT_COLUMNS} from family.tutor_conversations
            where account_id = $1 and child_id = $2 and subject = $3 and status in ('open', 'full') ${NEWEST} limit $4`,
          [accountId, childId, subject, CHATS_KEPT]
        )
      ).rows.map(chatOf),
    []
  );
}

// One of the child's own listed chats in the subject (null when the id is not one: another child's, archived, unknown).
export async function ownChat(db: Db, accountId: string, childId: string, subject: string, chatId: unknown): Promise<TutorChat | null> {
  if (!isUuid(chatId) || !isSubject(subject)) return null;
  const { rows } = await db.query(
    `select ${CHAT_COLUMNS} from family.tutor_conversations where conversation_id = $1 and account_id = $2 and child_id = $3 and subject = $4 and status in ('open', 'full')`,
    [chatId, accountId, childId, subject]
  );
  return rows[0] ? chatOf(rows[0]) : null;
}

// What a stored tutor turn is remembered as: its explanation's paragraphs (the idea when it has none), nothing else.
function explanationText(blocks: unknown): string {
  const b = (Array.isArray(blocks) ? blocks : []).find((x) => x && typeof x === 'object' && (x as { type?: unknown }).type === 'explanation') as { idea?: unknown; paragraphs?: unknown } | undefined;
  if (!b) return '';
  const paragraphs = Array.isArray(b.paragraphs) ? b.paragraphs.filter((x): x is string => typeof x === 'string') : [];
  return (paragraphs.length ? paragraphs.join(' ') : typeof b.idea === 'string' ? b.idea : '').replace(/\s+/g, ' ').trim();
}
const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

// The chat's last `n` messages as remembered turns, oldest first.
async function rememberedTurns(db: Db, chatId: string, n: number): Promise<ResolverMemory['turns']> {
  const { rows } = await db.query(`select role, body, blocks from family.tutor_messages where conversation_id = $1 order by created_at desc, role desc limit $2`, [chatId, n]);
  return rows
    .reverse()
    .map((r) => ({ role: r.role === 'tutor' ? ('tutor' as const) : ('child' as const), text: clip(r.role === 'tutor' ? explanationText(r.blocks) : String(r.body ?? '').trim(), MEMORY_TEXT) }))
    .filter((t) => t.text.length > 0);
}

// What the tutor is told of a chat: its summary and its last MEMORY_TURNS turns. The caller has checked the chat is
// the child's own (ownChat, resolveChat); the policies keep every read to the account and, on a child's phone, the child.
export async function memoryFor(db: Db, chatId: string): Promise<ResolverMemory> {
  const { rows } = await db.query(`select summary from family.tutor_conversations where conversation_id = $1`, [chatId]);
  return { summary: (rows[0]?.summary as string | null | undefined) ?? null, turns: await rememberedTurns(db, chatId, MEMORY_TURNS) };
}

// One of the child's own listed chats in any subject, with its subject (W10, C411: the chat the window has open).
async function pinnedChat(db: Db, accountId: string, childId: string, chatId: unknown): Promise<(TutorChat & { subject: string }) | null> {
  if (!isUuid(chatId)) return null;
  const { rows } = await db.query(
    `select ${CHAT_COLUMNS}, subject from family.tutor_conversations where conversation_id = $1 and account_id = $2 and child_id = $3 and status in ('open', 'full')`,
    [chatId, accountId, childId]
  );
  return rows[0] ? { ...chatOf(rows[0]), subject: String(rows[0].subject) } : null;
}

// The chat a tutor question is asked in: the one the screen names when it is this child's own, in whatever subject
// (W10, C411: a question typed in an open chat goes to that chat, whatever subject tab is selected), else the window
// subject's newest open one (none yet: null; the answered turn opens one). `full`: a new turn would be refused.
// `pinned`: the chat is the one the screen named; `subject`: the chat's own.
export async function resolveChat(
  db: Db,
  accountId: string,
  childId: string,
  subject: string,
  requested: unknown
): Promise<{ chatId: string; full: boolean; memory: ResolverMemory | null; pinned: boolean; subject: string } | null> {
  if (!isSubject(subject)) return null;
  const pinned = await pinnedChat(db, accountId, childId, requested);
  let chat: TutorChat | null = pinned;
  if (!chat) {
    const { rows } = await db.query(
      `select ${CHAT_COLUMNS} from family.tutor_conversations where account_id = $1 and child_id = $2 and subject = $3 and status = 'open' ${NEWEST} limit 1`,
      [accountId, childId, subject]
    );
    chat = rows[0] ? chatOf(rows[0]) : null;
  }
  if (!chat) return null;
  const memory = await memoryFor(db, chat.chatId);
  return { chatId: chat.chatId, full: chat.status === 'full', memory: memory.summary || memory.turns.length ? memory : null, pinned: pinned !== null, subject: pinned?.subject ?? subject };
}

// A chat's turns, oldest first, with each child turn's ready files. With no chat named: the subject's most recently
// used listed chat.
export function readTurns(db: Db, accountId: string, childId: string, subject: string, chatId: string | null = null): Promise<TutorTurn[]> {
  if (!isSubject(subject)) return Promise.resolve([]);
  return guarded(
    db,
    async () => {
      const { rows } = await db.query(
        `select m.message_id, m.role, m.body, m.blocks, m.chapter_key, m.block_id, m.lang, m.created_at,
                coalesce((select json_agg(json_build_object('id', a.attachment_id, 'mime', a.mime) order by a.created_at)
                            from family.tutor_attachments a where a.message_id = m.message_id and a.status = 'ready'), '[]'::json) as files
           from family.tutor_messages m join family.tutor_conversations c on c.conversation_id = m.conversation_id
          where c.account_id = $1 and c.child_id = $2 and c.subject = $3
            and c.conversation_id = coalesce($5::uuid, (select x.conversation_id from family.tutor_conversations x
                                                         where x.account_id = $1 and x.child_id = $2 and x.subject = $3 and x.status in ('open', 'full')
                                                         order by x.last_at desc, x.created_at desc limit 1))
          order by m.created_at desc, m.role desc limit $4`,
        [accountId, childId, subject, TURNS_SHOWN, chatId]
      );
      return rows.reverse().map(turnOf);
    },
    []
  );
}

function turnOf(r: Record<string, unknown>): TutorTurn {
  const at = new Date(r.created_at as string).toISOString();
  const lang = r.lang === 'hi' ? 'hi' : 'en';
  if (r.role === 'child') {
    const files = (Array.isArray(r.files) ? r.files : []) as { id: string; mime: string }[];
    return { id: String(r.message_id), role: 'child', lang, text: String(r.body), chapterKey: (r.chapter_key as string | null) ?? null, blockId: (r.block_id as string | null) ?? null, files: files.filter((f) => isTutorFileType(f.mime)).map((f) => ({ id: String(f.id), mime: f.mime as TutorFileType })), at };
  }
  // Read back through the block checks, so only a block the renderer knows is ever drawn.
  const blocks = (Array.isArray(r.blocks) ? r.blocks : []).map((b) => parseBlockLine(JSON.stringify(b))).filter((b): b is Block => b !== null);
  return { id: String(r.message_id), role: 'tutor', lang, blocks: keptTutorBlocks(blocks), at };
}

// W10-4 (C413; docs/39 §5): a subject's feed, every turn of the child's chats in that subject (archived ones too: the
// feed is the subject's last FEED_TURNS child turns, whatever chat they were kept in), oldest first, each with its
// chat and the chat's subject.
export function readFeed(db: Db, accountId: string, childId: string, subject: string): Promise<FeedTurn[]> {
  if (!isSubject(subject)) return Promise.resolve([]);
  return guarded(
    db,
    async () => {
      const { rows } = await db.query(
        `select m.message_id, m.role, m.body, m.blocks, m.chapter_key, m.block_id, m.lang, m.created_at, m.conversation_id, c.subject,
                coalesce((select json_agg(json_build_object('id', a.attachment_id, 'mime', a.mime) order by a.created_at)
                            from family.tutor_attachments a where a.message_id = m.message_id and a.status = 'ready'), '[]'::json) as files
           from family.tutor_messages m join family.tutor_conversations c on c.conversation_id = m.conversation_id
          where c.account_id = $1 and c.child_id = $2 and c.subject = $3
          order by m.created_at desc, m.role desc limit $4`,
        [accountId, childId, subject, TURNS_SHOWN]
      );
      return rows.reverse().map((r): FeedTurn => ({ ...turnOf(r), chatId: String(r.conversation_id), subject: String(r.subject) }));
    },
    []
  );
}

// The rolling feed (W10-4, C413): the child turns of a subject beyond its newest FEED_TURNS go, each with what follows
// it in its own chat up to that chat's oldest kept turn (its answer), and their files (the cascade takes the rows; the
// files are removed from the bucket here, best effort: a file left behind is never shown, its row being gone). An
// archived chat left empty goes too. Runs in the caller's transaction, right after a child turn is written.
async function trimFeed(db: Db, accountId: string, childId: string, subject: string, storage: DirectUploadStorage | null): Promise<number> {
  const { rows: gone } = await db.query(
    `select m.message_id from family.tutor_messages m join family.tutor_conversations c on c.conversation_id = m.conversation_id
       left join (select k.conversation_id, min(k.created_at) as at
                    from (select x.conversation_id, x.created_at from family.tutor_messages x join family.tutor_conversations y on y.conversation_id = x.conversation_id
                           where y.account_id = $1 and y.child_id = $2 and y.subject = $3 and x.role = 'child'
                           order by x.created_at desc limit $4) k
                   group by k.conversation_id) s on s.conversation_id = m.conversation_id
      where c.account_id = $1 and c.child_id = $2 and c.subject = $3 and (s.at is null or m.created_at < s.at)`,
    [accountId, childId, subject, FEED_TURNS]
  );
  if (gone.length === 0) return 0;
  const ids = gone.map((r) => String(r.message_id));
  const { rows: files } = await db.query(`select account_id, attachment_id, mime, storage_key from family.tutor_attachments where message_id = any($1::uuid[])`, [ids]);
  await db.query(`delete from family.tutor_messages where message_id = any($1::uuid[])`, [ids]);
  await db.query(
    `delete from family.tutor_conversations c where c.account_id = $1 and c.child_id = $2 and c.subject = $3 and c.status = 'archived'
        and not exists (select 1 from family.tutor_messages m where m.conversation_id = c.conversation_id)`,
    [accountId, childId, subject]
  );
  if (storage && files.length) await removeFiles(storage, keysOf(files)).catch(() => undefined);
  return ids.length;
}

// The reader's context, checked on the server: a NetCyber chapter of this subject and one of its blocks. Returns the
// words the tutor is told ("chapter / section"), or null when the context is not one of ours.
export function readerContext(subject: string, chapterKey: unknown, blockId: unknown, lang: string): { chapterKey: string; blockId: string; about: string } | null {
  if (typeof chapterKey !== 'string' || typeof blockId !== 'string') return null;
  const chapter = showcaseChapter(chapterKey);
  if (!chapter || chapter.subject !== subject) return null;
  const view = chapterView(chapter, lang);
  const i = view.ids.indexOf(blockId);
  if (i < 0) return null;
  const en = chapterView(chapter, 'en');
  const b = en.blocks[en.ids.indexOf(blockId)] ?? view.blocks[i];
  const section = b && 'title' in b && typeof b.title === 'string' ? b.title : null;
  return { chapterKey: chapter.key, blockId, about: section ? `${en.title} / ${section}` : en.title };
}

// The files a question may carry: this child's own, in this subject's conversation, ready and not sent yet. Returns
// null when any of them is not.
export async function sendableFiles(db: Db, accountId: string, childId: string, subject: string, ids: unknown): Promise<string[] | null> {
  if (ids === undefined || ids === null) return [];
  if (!Array.isArray(ids) || ids.length > TUTOR_FILES_PER_TURN || !ids.every(isUuid) || new Set(ids).size !== ids.length) return null;
  if (ids.length === 0) return [];
  const { rows } = await db.query(
    `select a.attachment_id from family.tutor_attachments a join family.tutor_conversations c on c.conversation_id = a.conversation_id
      where a.attachment_id = any($1::uuid[]) and a.account_id = $2 and a.child_id = $3 and c.subject = $4 and a.status = 'ready' and a.message_id is null and a.kept_for is null`,
    [ids, accountId, childId, subject]
  );
  return rows.length === ids.length ? (ids as string[]) : null;
}

// `storage`: where the files of turns the feed lets go are removed from (the route's bucket; none in a test).
type TurnInput = { accountId: string; childId: string; subject: string; text: string; chapterKey: string | null; blockId: string | null; files: string[]; blocks: readonly Block[]; lang?: string; storage?: DirectUploadStorage | null };

// A turn: the child's words (and the reader's chapter and block, and the files sent with them), then the tutor's
// answer as shown, without its check and practice items, in this child's chat. The chat's child turns go up by one, and
// the subject's feed keeps its last FEED_TURNS (W10-4, C413: trimFeed; a chat is never marked full now). A turn on a
// chat marked full before W10-4 is refused ('chat_full'), on an archived or unknown one 'not_found'; nothing is
// written when refused. W10 (C411): `subject` is the one the server decided; a chat's first answer moves the
// chat to it (a chat opened in Mathematics whose first question is about photosynthesis becomes a Science chat); a later
// turn stays in the chat, whatever subject it was decided in. Returns the chat's subject after the turn.
export async function appendTurn(db: Db, t: TurnInput & { chatId: string }): Promise<{ ok: true; turnCount: number; subject: string } | { ok: false; error: 'chat_full' | 'not_found' | 'empty' }> {
  const text = t.text.trim().slice(0, TUTOR_TEXT_MAX);
  const blocks = keptTutorBlocks(t.blocks);
  if (!text || blocks.length === 0) return { ok: false, error: 'empty' };
  if (!isUuid(t.chatId) || !isSubject(t.subject)) return { ok: false, error: 'not_found' };
  const { rows: chat } = await db.query(
    `select status, subject, turn_count from family.tutor_conversations where conversation_id = $1 and account_id = $2 and child_id = $3 for update`,
    [t.chatId, t.accountId, t.childId]
  );
  if (!chat[0] || chat[0].status === 'archived') return { ok: false, error: 'not_found' };
  if (chat[0].status === 'full') return { ok: false, error: 'chat_full' };
  const moved = Number(chat[0].turn_count) === 0 && chat[0].subject !== t.subject;
  if (moved) await db.query(`update family.tutor_conversations set subject = $2, updated_at = now() where conversation_id = $1`, [t.chatId, t.subject]);
  const chatSubject = moved ? t.subject : String(chat[0].subject);
  const lang = t.lang === 'hi' ? 'hi' : 'en';
  const conversationId = t.chatId;
  const asked = await db.query(
    `insert into family.tutor_messages (conversation_id, account_id, child_id, role, body, chapter_key, block_id, lang, created_at) values ($1, $2, $3, 'child', $4, $5, $6, $7, clock_timestamp()) returning message_id`,
    [conversationId, t.accountId, t.childId, text, t.chapterKey, t.blockId, lang]
  );
  const messageId = String(asked.rows[0].message_id);
  // A file was filed in the subject's newest open chat when it was sent; it joins the chat its question is kept in.
  if (t.files.length) {
    await db.query(
      `update family.tutor_attachments a set message_id = $1, conversation_id = $3
         from family.tutor_conversations c
        where a.attachment_id = any($2::uuid[]) and a.account_id = $4 and a.child_id = $5 and a.status = 'ready' and a.message_id is null and a.kept_for is null
          and c.conversation_id = a.conversation_id and c.subject = $6`,
      [messageId, t.files, conversationId, t.accountId, t.childId, t.subject]
    );
  }
  // The answer's tutor turn is a moment later than the question, so the two always read back in order.
  await db.query(
    `insert into family.tutor_messages (conversation_id, account_id, child_id, role, blocks, lang, created_at) values ($1, $2, $3, 'tutor', $4::jsonb, $5, clock_timestamp())`,
    [conversationId, t.accountId, t.childId, JSON.stringify(blocks), lang]
  );
  const { rows } = await db.query(
    `update family.tutor_conversations
        set turn_count = turn_count + 1, title = coalesce(title, left($2, $3)), last_at = clock_timestamp(), updated_at = now()
      where conversation_id = $1 returning turn_count`,
    [conversationId, text, TITLE_MAX]
  );
  if (moved) await archiveOverflow(db, t.accountId, t.childId, chatSubject);
  await trimFeed(db, t.accountId, t.childId, chatSubject, t.storage ?? null);
  return { ok: true, turnCount: Number(rows[0].turn_count), subject: chatSubject };
}

// An answered tutor question kept: in the chat the screen asked in while it is open (`chatId`, already checked to be
// this child's own), else in the decided subject's newest open chat (a new one when there is none, or when the named
// chat filled up meanwhile). Returns the chat, its subject and its child turns, or null when nothing was kept.
export async function saveTurn(db: Db, t: TurnInput & { chatId?: string | null }): Promise<{ chatId: string; turnCount: number; subject: string } | null> {
  if (t.chatId) {
    const kept = await appendTurn(db, { ...t, chatId: t.chatId });
    if (kept.ok) return { chatId: t.chatId, turnCount: kept.turnCount, subject: kept.subject };
    if (kept.error === 'empty') return null;
  }
  const chatId = await openChat(db, t.accountId, t.childId, t.subject);
  const kept = await appendTurn(db, { ...t, chatId });
  return kept.ok ? { chatId, turnCount: kept.turnCount, subject: kept.subject } : null;
}

// ---- the running summary (family.summary) ----------------------------------------------------------------------------

type Run = <R>(fn: (db: Db) => Promise<R>) => Promise<R>;

// Rewritten after every SUMMARY_EVERY-th child turn: the request prepared in a short transaction (the profile's checks,
// the minors rule, the family's daily cap), sent with no connection held, then kept in another. When the workload has
// no route, is switched off or fails, the chat keeps its old summary and goes on working.
export async function refreshChatSummary(run: Run, ai: AiContext, chatId: string, turnCount: number): Promise<boolean> {
  if (turnCount <= 0 || turnCount % SUMMARY_EVERY !== 0) return false;
  const prepared = await run(async (db) => {
    const { rows } = await db.query(`select subject, summary, summary_turns from family.tutor_conversations where conversation_id = $1`, [chatId]);
    const chat = rows[0];
    if (!chat || Number(chat.summary_turns) >= turnCount) return null;
    const turns = await rememberedTurns(db, chatId, Math.min(turnCount - Number(chat.summary_turns), SUMMARY_TURNS_READ) * 2);
    if (turns.length === 0) return null;
    const prompt = summaryPrompt(await activePromptVersion(db as never, 'family.summary'));
    const ask = { subject: String(chat.subject), summary: (chat.summary as string | null) ?? null, turns };
    const out = await prepareText(db as never, ai, 'family.summary', { system: prompt.system(), messages: [{ role: 'user', content: prompt.user(ask) }] });
    return out.ok ? out.text : null;
  });
  if (!prepared) return false;
  const sent = await prepared.send();
  const text = sent.result.ok ? clip(sent.result.text.replace(/\s+/g, ' ').trim(), SUMMARY_MAX) : '';
  await run(async (db) => {
    await sent.record(db as never);
    if (text) await db.query(`update family.tutor_conversations set summary = $2, summary_turns = $3 where conversation_id = $1 and summary_turns < $3`, [chatId, text, turnCount]);
  });
  return text.length > 0;
}

// ---- files ---------------------------------------------------------------------------------------------------------

export type FileRefusal =
  | 'not_sent_properly'
  | 'file_empty'
  | 'file_too_large'
  | 'file_type'
  | 'too_many_files'
  | 'upload_aadhaar_number'
  | 'upload_aadhaar_card'
  | 'upload_unreadable'
  | 'upload_missing'
  | 'upload_expired'
  | 'upload_changed'
  | 'storage_unavailable'
  | 'not_found'
  | 'not_ready';

// A chapter test's written answer (S5, C378) goes through the same screen as a file's name: no Aadhaar number or card
// words. null when it is fine.
export const testTextProblem = (text: string): string | null => textProblem(text);

const FILE_NAME_MAX = 255;
// The file's own name: one line, only read for the Aadhaar check; never kept.
function readFileName(raw: unknown): string | null {
  // eslint-disable-next-line no-control-regex
  const value = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim() : '';
  return value && value.length <= FILE_NAME_MAX ? value : null;
}

export type Ask = { ok: true; attachmentId: string; uploadUrl: string; contentType: TutorFileType; maxBytes: number } | { ok: false; reason: FileRefusal };

export async function askTutorUpload(
  db: Db,
  storage: DirectUploadStorage,
  who: { accountId: string; childId: string },
  input: { subject: unknown; mime: unknown; size: unknown; name: unknown },
  now: () => number = Date.now
): Promise<Ask> {
  const name = readFileName(input.name);
  const size = input.size;
  if (!isSubject(input.subject) || !name || typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0) return { ok: false, reason: 'not_sent_properly' };
  if (size === 0) return { ok: false, reason: 'file_empty' };
  if (size > TUTOR_FILE_MAX_BYTES) return { ok: false, reason: 'file_too_large' };
  if (!isTutorFileType(input.mime)) return { ok: false, reason: 'file_type' };
  const named = textProblem(name.replace(/[_.]+/g, ' '));
  if (named) return { ok: false, reason: named };
  const mime = input.mime;
  // What was asked for and never confirmed goes first: its rows, then its files (best effort).
  const stale = new Date(now() - PENDING_MINUTES * 60_000);
  await db.query(`delete from family.tutor_attachments where account_id = $1 and status = 'pending' and created_at < $2`, [who.accountId, stale]);
  await storage.removeOlderThan(tutorPendingFolder(who.accountId), stale).catch(() => 0);
  const conversationId = await conversationFor(db, who.accountId, who.childId, input.subject);
  const { rows: counts } = await db.query(
    `select count(*) filter (where message_id is null and kept_for is null and conversation_id = $3)::int as unsent, count(*) filter (where created_at > $4)::int as today
       from family.tutor_attachments where account_id = $1 and child_id = $2`,
    [who.accountId, who.childId, conversationId, new Date(now() - 24 * 3600_000)]
  );
  if (Number(counts[0]?.unsent) >= TUTOR_FILES_PER_TURN || Number(counts[0]?.today) >= FILES_PER_DAY) return { ok: false, reason: 'too_many_files' };
  const attachmentId = crypto.randomUUID();
  await db.query(
    `insert into family.tutor_attachments (attachment_id, conversation_id, account_id, child_id, mime, size_bytes, storage_key, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [attachmentId, conversationId, who.accountId, who.childId, mime, size, tutorFileKey(who.accountId, who.childId, attachmentId, mime), new Date(now())]
  );
  let uploadUrl: string;
  try {
    uploadUrl = await storage.signedUploadUrl(tutorPendingKey(who.accountId, attachmentId, mime));
  } catch (err) {
    if (err instanceof FileStorageUnavailableError) return { ok: false, reason: 'storage_unavailable' };
    throw err;
  }
  return { ok: true, attachmentId, uploadUrl, contentType: mime, maxBytes: TUTOR_FILE_MAX_BYTES };
}

type PendingRow = { attachment_id: string; account_id: string; child_id: string; mime: TutorFileType; storage_key: string; status: string; created_at: Date };

// Step 3, first part (in the family's transaction): this child's own pending row.
export async function pendingUpload(db: Db, who: { accountId: string; childId: string }, attachmentId: unknown): Promise<PendingRow | null> {
  if (!isUuid(attachmentId)) return null;
  const { rows } = await db.query(
    `select attachment_id, account_id, child_id, mime, storage_key, status, created_at from family.tutor_attachments where attachment_id = $1 and account_id = $2 and child_id = $3`,
    [attachmentId, who.accountId, who.childId]
  );
  return (rows[0] as PendingRow | undefined) ?? null;
}

export type Arrival = { ok: true; row: PendingRow; bytes: Uint8Array } | { ok: false; reason: FileRefusal; discard: boolean };

// Step 3, second part (no transaction held: the check reads a photo's words, which takes seconds).
export async function readTutorArrival(storage: DirectUploadStorage, row: PendingRow, now: () => number = Date.now, ocr?: OcrImage): Promise<Arrival> {
  const refuse = (reason: FileRefusal, discard = true): Arrival => ({ ok: false, reason, discard });
  if (new Date(row.created_at).getTime() < now() - PENDING_MINUTES * 60_000) return refuse('upload_expired');
  const key = pendingOf(row);
  let info;
  try {
    info = await storage.stat(key);
  } catch {
    return refuse('storage_unavailable', false);
  }
  if (!info) return refuse('upload_missing', false);
  if (info.sizeBytes === 0) return refuse('file_empty');
  if (info.sizeBytes > TUTOR_FILE_MAX_BYTES) return refuse('file_too_large');
  if (info.contentType !== null && info.contentType !== row.mime) return refuse('file_type');
  let bytes: Uint8Array | null;
  try {
    bytes = await storage.get(key);
  } catch {
    return refuse('storage_unavailable', false);
  }
  if (!bytes) return refuse('upload_missing', false);
  if (bytes.length === 0) return refuse('file_empty');
  if (bytes.length > TUTOR_FILE_MAX_BYTES) return refuse('file_too_large');
  if (sniffTutorFile(bytes) !== row.mime) return refuse('file_type');
  const checked = await checkUpload({ bytes, name: `file.${EXT[row.mime]}` }, ocr);
  if (!checked.ok) return refuse(checked.reason as FileRefusal);
  return { ok: true, row, bytes };
}

// Step 3, last part (in the family's transaction): the file moved to its kept key and its row marked ready; or, on a
// refusal, the file taken away and the row removed.
export async function finishTutorUpload(db: Db, storage: DirectUploadStorage, who: { accountId: string; childId: string }, attachmentId: string, arrival: Arrival): Promise<{ ok: true } | { ok: false; reason: FileRefusal }> {
  const { rows } = await db.query(
    `select attachment_id, account_id, child_id, mime, storage_key, status, created_at from family.tutor_attachments where attachment_id = $1 and account_id = $2 and child_id = $3 for update`,
    [attachmentId, who.accountId, who.childId]
  );
  const row = rows[0] as PendingRow | undefined;
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.status === 'ready') return { ok: true };
  const pendingKey = pendingOf(row);
  if (!arrival.ok) {
    if (arrival.discard) {
      await db.query(`delete from family.tutor_attachments where attachment_id = $1`, [attachmentId]);
      await storage.remove(pendingKey).catch(() => undefined);
    }
    return { ok: false, reason: arrival.reason };
  }
  try {
    await storage.move(pendingKey, row.storage_key);
  } catch {
    return { ok: false, reason: 'storage_unavailable' };
  }
  let kept: Uint8Array | null;
  try {
    kept = await storage.get(row.storage_key);
  } catch {
    kept = null;
  }
  if (!kept || !sameBytes(kept, arrival.bytes)) {
    // The moved file must go before its row does: if the store refuses, the transaction rolls back and the row (with
    // both keys) still leads to it, so nothing is left in the bucket that no row names (security review, S2).
    try {
      await storage.remove(row.storage_key);
    } catch {
      throw new TutorStorageError();
    }
    await db.query(`delete from family.tutor_attachments where attachment_id = $1`, [attachmentId]);
    return { ok: false, reason: 'upload_changed' };
  }
  await db.query(`update family.tutor_attachments set status = 'ready' where attachment_id = $1`, [attachmentId]);
  return { ok: true };
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;
}

// A ready file as a signed link for one minute. `childId`: the child using the app (child mode); null only in parent
// mode, where any child of this account may be looked at. Returns null when there is no such file.
export async function signedTutorFile(db: Db, storage: DirectUploadStorage, accountId: string, childId: string | null, attachmentId: unknown): Promise<string | null> {
  if (!isUuid(attachmentId)) return null;
  const { rows } = await db.query(
    `select storage_key from family.tutor_attachments where attachment_id = $1 and account_id = $2 and ($3::uuid is null or child_id = $3::uuid) and status = 'ready'`,
    [attachmentId, accountId, childId]
  );
  if (!rows[0]) return null;
  return storage.signedUrl(String(rows[0].storage_key), SIGNED_READ_SECONDS);
}

// A file the child attached and took back before sending (only one not sent yet).
export async function removeUnsentFile(db: Db, storage: DirectUploadStorage, who: { accountId: string; childId: string }, attachmentId: unknown): Promise<boolean> {
  if (!isUuid(attachmentId)) return false;
  const { rows } = await db.query(
    `delete from family.tutor_attachments where attachment_id = $1 and account_id = $2 and child_id = $3 and message_id is null and kept_for is null returning account_id, attachment_id, mime, storage_key`,
    [attachmentId, who.accountId, who.childId]
  );
  if (!rows[0]) return false;
  await removeFiles(storage, keysOf(rows));
  return true;
}

// Every key a set of attachment rows may have a file at: the kept key and the pending one.
// Throws TutorStorageError when the bucket cannot be reached, so the caller's transaction rolls back.
export class TutorStorageError extends Error {
  constructor() {
    super('the tutor file store could not remove a file');
    this.name = 'TutorStorageError';
  }
}
async function removeFiles(storage: DirectUploadStorage, keys: string[]): Promise<void> {
  for (const key of keys) {
    try {
      await storage.remove(key);
    } catch {
      throw new TutorStorageError();
    }
  }
}
const keysOf = (rows: Record<string, unknown>[]) => rows.flatMap((r) => [String(r.storage_key), pendingOf(r as never)]);

// ---- the Learning Vault (parent mode) ------------------------------------------------------------------------------

export type VaultConversation = { conversationId: string; childId: string; subject: string; turns: number; files: number; updatedAt: string; questions: { text: string; at: string }[] };

// Every conversation of the account, each with its child's questions (newest first, at most twenty).
export function vaultConversations(db: Db, accountId: string): Promise<VaultConversation[]> {
  return guarded(
    db,
    async () => {
      const { rows } = await db.query(
        `select c.conversation_id, c.child_id, c.subject, c.updated_at,
                (select count(*)::int from family.tutor_messages m where m.conversation_id = c.conversation_id and m.role = 'child') as turns,
                (select count(*)::int from family.tutor_attachments a where a.conversation_id = c.conversation_id) as files,
                coalesce((select json_agg(json_build_object('text', q.body, 'at', q.created_at) order by q.created_at desc)
                            from (select body, created_at from family.tutor_messages m where m.conversation_id = c.conversation_id and m.role = 'child' order by created_at desc limit 20) q), '[]'::json) as questions
           from family.tutor_conversations c where c.account_id = $1
          order by c.updated_at desc`,
        [accountId]
      );
      return rows
        .filter((r) => Number(r.turns) > 0 || Number(r.files) > 0)
        .map((r) => ({
          conversationId: String(r.conversation_id),
          childId: String(r.child_id),
          subject: String(r.subject),
          turns: Number(r.turns),
          files: Number(r.files),
          updatedAt: new Date(r.updated_at as string).toISOString(),
          questions: ((r.questions as { text: string; at: string }[]) ?? []).map((q) => ({ text: String(q.text), at: new Date(q.at).toISOString() })),
        }));
    },
    []
  );
}

// The parent's "clear": the conversation's turns and files go, the files from the bucket first. If the bucket cannot be
// reached, the whole clear is undone (the caller's transaction rolls back), so it can be asked again.
export async function clearConversation(db: Db, storage: DirectUploadStorage, accountId: string, conversationId: unknown): Promise<boolean> {
  if (!isUuid(conversationId)) return false;
  const { rows: files } = await db.query(
    `select account_id, attachment_id, mime, storage_key from family.tutor_attachments where conversation_id = $1 and account_id = $2`,
    [conversationId, accountId]
  );
  const gone = await db.query(`delete from family.tutor_conversations where conversation_id = $1 and account_id = $2`, [conversationId, accountId]);
  if ((gone.rowCount ?? 0) === 0) return false;
  await removeFiles(storage, keysOf(files));
  return true;
}

// Before a child (or the whole account) is removed: every tutor file of theirs, removed from the bucket in the same
// transaction (the rows go with the child by the foreign keys). Throws when the bucket cannot be reached.
export async function removeTutorFilesOf(db: Db, storage: DirectUploadStorage, accountId: string, childId: string | null): Promise<number> {
  const files = await guarded(
    db,
    async () =>
      (
        await db.query(`select account_id, attachment_id, mime, storage_key from family.tutor_attachments where account_id = $1 and ($2::uuid is null or child_id = $2::uuid)`, [
          accountId,
          childId,
        ])
      ).rows,
    [] as Record<string, unknown>[]
  );
  await removeFiles(storage, keysOf(files));
  // The whole account: what was sent and never confirmed goes too (best effort; at most a hundred a call, and an upload
  // link stops working within two hours).
  if (childId === null) await storage.removeOlderThan(tutorPendingFolder(accountId), new Date(Date.now() + 60_000)).catch(() => 0);
  return files.length;
}

// ---- the child a request is for ------------------------------------------------------------------------------------

// The child using the app now: the one this phone chose (the cookie), or a child's own phone's child (its session sees
// that child only); never one a request names. Refused for no child, Nursery to UKG (no Study), or no study consent.
// `files`: attaching a file also needs the parent's photo consent.
export async function tutorChild(db: Db, accountId: string, chosen: string | undefined, files = false): Promise<{ ok: true; child: FamilyChild } | { ok: false; status: number; error: string }> {
  const child = activeChild(await listChildren(db as never, accountId), chosen);
  if (!child || isPrePrimary(child.classLevel)) return { ok: false, status: 404, error: 'not_found' };
  const consents = await consentState(db as never, accountId);
  if (!consents.study_core) return { ok: false, status: 403, error: 'consent_required' };
  // A file to attach: the photo rules of the homework helper (C389): Class 1 up, both consents, the helper's switch.
  if (files) {
    const refused = await photoGate(db as never, accountId, child);
    if (refused) return { ok: false, status: 403, error: refused === 'off' ? 'homework_off' : refused };
  }
  return { ok: true, child };
}
