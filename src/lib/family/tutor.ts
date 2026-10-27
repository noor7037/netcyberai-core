import { checkUpload, textProblem, type OcrImage } from '@/lib/privacy/upload-check';
import { FileStorageUnavailableError, type DirectUploadStorage } from '@/lib/storage/file-storage';
import { familyTutorFileStorage } from '@/lib/storage/supabase-file-storage';
import type { Block } from './blocks';
import { parseBlockLine } from './blocks';
import { chapterView, showcaseChapter } from './chapters';
import { activeChild, isPrePrimary, listChildren, type FamilyChild } from './children';
import { consentState } from './consent';
import { isSubject } from './subjects';
import { TUTOR_FILE_MAX_BYTES, TUTOR_FILES_PER_TURN, TUTOR_TEXT_MAX, isTutorFileType, keptTutorBlocks, sniffTutorFile, type TutorFileType, type TutorTurn } from './tutor-shape';

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

// The child's conversation in a subject, made on first use.
export async function conversationFor(db: Db, accountId: string, childId: string, subject: string): Promise<string> {
  if (!isSubject(subject)) throw new Error('not a subject');
  const { rows } = await db.query(
    `insert into family.tutor_conversations (account_id, child_id, subject) values ($1, $2, $3)
     on conflict (child_id, subject) do update set updated_at = now()
     returning conversation_id`,
    [accountId, childId, subject]
  );
  return String(rows[0].conversation_id);
}

// The conversation's last turns, oldest first, with each child turn's ready files.
export function readTurns(db: Db, accountId: string, childId: string, subject: string): Promise<TutorTurn[]> {
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
          order by m.created_at desc, m.role desc limit $4`,
        [accountId, childId, subject, TURNS_SHOWN]
      );
      return rows.reverse().map((r): TutorTurn => {
        const at = new Date(r.created_at as string).toISOString();
        const lang = r.lang === 'hi' ? 'hi' : 'en';
        if (r.role === 'child') {
          const files = (Array.isArray(r.files) ? r.files : []) as { id: string; mime: string }[];
          return { id: String(r.message_id), role: 'child', lang, text: String(r.body), chapterKey: (r.chapter_key as string | null) ?? null, blockId: (r.block_id as string | null) ?? null, files: files.filter((f) => isTutorFileType(f.mime)).map((f) => ({ id: String(f.id), mime: f.mime as TutorFileType })), at };
        }
        // Read back through the block checks, so only a block the renderer knows is ever drawn.
        const blocks = (Array.isArray(r.blocks) ? r.blocks : []).map((b) => parseBlockLine(JSON.stringify(b))).filter((b): b is Block => b !== null);
        return { id: String(r.message_id), role: 'tutor', lang, blocks: keptTutorBlocks(blocks), at };
      });
    },
    []
  );
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
      where a.attachment_id = any($1::uuid[]) and a.account_id = $2 and a.child_id = $3 and c.subject = $4 and a.status = 'ready' and a.message_id is null`,
    [ids, accountId, childId, subject]
  );
  return rows.length === ids.length ? (ids as string[]) : null;
}

// A turn: the child's words (and the reader's chapter and block, and the files sent with them), then the tutor's
// answer as shown, without its check and practice items. In the conversation of the subject the server decided.
export async function saveTurn(
  db: Db,
  t: { accountId: string; childId: string; subject: string; text: string; chapterKey: string | null; blockId: string | null; files: string[]; blocks: readonly Block[]; lang?: string }
): Promise<void> {
  const text = t.text.trim().slice(0, TUTOR_TEXT_MAX);
  const blocks = keptTutorBlocks(t.blocks);
  if (!text || blocks.length === 0) return;
  const lang = t.lang === 'hi' ? 'hi' : 'en';
  const conversationId = await conversationFor(db, t.accountId, t.childId, t.subject);
  const asked = await db.query(
    `insert into family.tutor_messages (conversation_id, account_id, child_id, role, body, chapter_key, block_id, lang) values ($1, $2, $3, 'child', $4, $5, $6, $7) returning message_id`,
    [conversationId, t.accountId, t.childId, text, t.chapterKey, t.blockId, lang]
  );
  const messageId = String(asked.rows[0].message_id);
  if (t.files.length) {
    await db.query(
      `update family.tutor_attachments set message_id = $1
        where attachment_id = any($2::uuid[]) and conversation_id = $3 and account_id = $4 and child_id = $5 and status = 'ready' and message_id is null`,
      [messageId, t.files, conversationId, t.accountId, t.childId]
    );
  }
  // The answer's tutor turn is a moment later than the question, so the two always read back in order.
  await db.query(
    `insert into family.tutor_messages (conversation_id, account_id, child_id, role, blocks, lang, created_at) values ($1, $2, $3, 'tutor', $4::jsonb, $5, clock_timestamp())`,
    [conversationId, t.accountId, t.childId, JSON.stringify(blocks), lang]
  );
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
    `select count(*) filter (where message_id is null and conversation_id = $3)::int as unsent, count(*) filter (where created_at > $4)::int as today
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
    await storage.remove(row.storage_key).catch(() => undefined);
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
    `delete from family.tutor_attachments where attachment_id = $1 and account_id = $2 and child_id = $3 and message_id is null returning account_id, attachment_id, mime, storage_key`,
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
  if (files && !consents.photo_input) return { ok: false, status: 403, error: 'photo_consent' };
  return { ok: true, child };
}
