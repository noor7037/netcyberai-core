import { prepareText, type AiContext, type PreparedText, type SentText } from '@/lib/ai/platform';
import { setting } from './learning';
import { TUTOR_FILES_PER_TURN, isTutorFileType, type TutorFileType } from './tutor-shape';

// The tutor reads what is attached (W4-1, C230-AR; Decision Log C385). A file the child sent with a question is read
// before the question is answered, and what it says joins the question, so the resolver's own safety check reads it
// before anything is sent and the scrub removes names from it like any typed word:
//   a photo  goes to the vision profile the homework helper uses (family.homework: the same minors gate, key, daily cap
//            and ledger), counted against the child's photo questions for the day; it is asked only to write out the
//            words and numbers it sees.
//   a PDF    is read on the server, its text layer only (pdfjs), at most TUTOR_PDF_PAGES pages; a scanned PDF with no
//            text layer is not guessed at.
// A file that cannot be read (no text, the day's photos used up, no vision service set up, the file gone) is said so
// in the answer, never dropped in silence. Nothing read is kept: the turn keeps the child's own words and the files.

export const TUTOR_PDF_PAGES = 5;
export const TUTOR_READ_FILE_CHARS = 1500;
export const TUTOR_READ_TOTAL_CHARS = 3000;
export const UNREADABLE = 'UNREADABLE';

export type FileToRead = { attachmentId: string; mime: TutorFileType; storageKey: string };
export type Unreadable = 'no_text' | 'photo_limit' | 'not_set_up' | 'failed';
export type FileRead = { attachmentId: string; mime: TutorFileType; text: string } | { attachmentId: string; mime: TutorFileType; unreadable: Unreadable };

type Sql = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The child's own ready files, sent with this question in this subject, in the order sent; null when any is not (a
// file of another child, another subject, one already sent, or one still arriving).
export async function filesToRead(db: Sql, accountId: string, childId: string, subject: string, ids: unknown): Promise<FileToRead[] | null> {
  if (ids === undefined || ids === null) return [];
  if (!Array.isArray(ids) || ids.length > TUTOR_FILES_PER_TURN || !ids.every((v) => typeof v === 'string' && UUID.test(v)) || new Set(ids).size !== ids.length) return null;
  if (ids.length === 0) return [];
  const { rows } = await db.query(
    `select a.attachment_id, a.mime, a.storage_key from family.tutor_attachments a join family.tutor_conversations c on c.conversation_id = a.conversation_id
      where a.attachment_id = any($1::uuid[]) and a.account_id = $2 and a.child_id = $3 and c.subject = $4 and a.status = 'ready' and a.message_id is null and a.kept_for is null`,
    [ids, accountId, childId, subject]
  );
  if (rows.length !== ids.length) return null;
  const byId = new Map(rows.map((r: { attachment_id: string; mime: string; storage_key: string }) => [String(r.attachment_id), r]));
  const out: FileToRead[] = [];
  for (const id of ids as string[]) {
    const r = byId.get(id) as { mime: string; storage_key: string } | undefined;
    if (!r || !isTutorFileType(r.mime)) return null;
    out.push({ attachmentId: id, mime: r.mime, storageKey: String(r.storage_key) });
  }
  return out;
}

// One photo place of the child's day (Control: family.photo_questions_per_day), as the homework helper takes it.
export async function takePhotoPlace(db: Sql, accountId: string, childId: string, day: string): Promise<boolean> {
  const limit = Math.max(0, Math.round(await setting(db as never, 'family.photo_questions_per_day', 3)));
  const { rows } = await db.query(
    `insert into family.day_counts as d (account_id, child_id, day, photo_questions) select $1, $2, $3, 1 where $4::int > 0
     on conflict (child_id, day) do update set photo_questions = d.photo_questions + 1 where d.photo_questions < $4::int
     returning photo_questions`,
    [accountId, childId, day, limit]
  );
  return rows.length === 1;
}
export const givePhotoPlaceBack = (db: Sql, accountId: string, childId: string, day: string) =>
  db.query(`update family.day_counts set photo_questions = greatest(photo_questions - 1, 0) where account_id = $1 and child_id = $2 and day = $3`, [accountId, childId, day]);

const READ_SYSTEM =
  'You read one picture a school student attached to a study question. Write out, as plain text, the words, numbers, equations and any question you can see in it, in the order they appear, at most 1500 characters. Do not answer or explain anything. Do not describe people, faces or anything personal, and leave out any name, phone number, address or ID number. If nothing in the picture can be read, reply with the single word ' +
  UNREADABLE +
  '.';

export const photoRequest = (mediaType: Exclude<TutorFileType, 'application/pdf'>, base64: string) => ({
  system: READ_SYSTEM,
  messages: [{ role: 'user' as const, content: 'Write out what this picture says.', images: [{ mediaType, base64 }] }],
  maxTokens: 800,
});

export type Fetched = { file: FileToRead; bytes: Uint8Array | null };

// Step 2 (no transaction): each file's bytes from the private bucket; a file that cannot be fetched is null.
export async function fetchFiles(files: readonly FileToRead[], get: (key: string) => Promise<Uint8Array | null>): Promise<Fetched[]> {
  const out: Fetched[] = [];
  for (const file of files) {
    let bytes: Uint8Array | null = null;
    try {
      bytes = await get(file.storageKey);
    } catch {
      bytes = null;
    }
    out.push({ file, bytes });
  }
  return out;
}

export type PhotoCall = { attachmentId: string; prepared: PreparedText } | { attachmentId: string; unreadable: Unreadable };

// Step 3 (in the caller's transaction): each photo's day place, then its read through the vision profile with every
// platform check (minors gate, key, daily cap); a place is given back when the read cannot be asked.
export async function preparePhotoReads(db: Sql, ctx: AiContext, childId: string, fetched: readonly Fetched[]): Promise<PhotoCall[]> {
  const calls: PhotoCall[] = [];
  for (const { file, bytes } of fetched) {
    if (file.mime === 'application/pdf' || !bytes) continue;
    const mime = file.mime;
    if (!(await takePhotoPlace(db, ctx.accountId, childId, ctx.day))) {
      calls.push({ attachmentId: file.attachmentId, unreadable: 'photo_limit' });
      continue;
    }
    const prepared = await prepareText(db as never, ctx, 'family.homework', photoRequest(mime, Buffer.from(bytes).toString('base64')));
    if (!prepared.ok) {
      await givePhotoPlaceBack(db, ctx.accountId, childId, ctx.day);
      calls.push({ attachmentId: file.attachmentId, unreadable: 'not_set_up' });
      continue;
    }
    calls.push({ attachmentId: file.attachmentId, prepared: prepared.text });
  }
  return calls;
}

// A PDF's text layer, its first TUTOR_PDF_PAGES pages, or null when it has none or cannot be opened.
export async function pdfText(bytes: Uint8Array, maxPages = TUTOR_PDF_PAGES): Promise<string | null> {
  try {
    // PDF.js builds one matrix when it loads, for drawing; reading text never draws, so a plain stand-in is enough on
    // the server (the browser has its own).
    const g = globalThis as { DOMMatrix?: unknown };
    if (!g.DOMMatrix) g.DOMMatrix = class { a = 1; b = 0; c = 0; d = 1; e = 0; f = 0 };
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await getDocument({ data: bytes.slice(), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, stopAtErrors: false, verbosity: 0 }).promise;
    const parts: string[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      parts.push(content.items.map((i) => ('str' in i ? i.str : '')).join(' '));
      page.cleanup();
    }
    await doc.destroy();
    const text = parts.join('\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    return text.length >= 3 ? text : null;
  } catch {
    return null;
  }
}

// What a photo's read said: null when the model found nothing to read or did not answer.
export function photoText(sent: SentText | null): string | null {
  if (!sent || !sent.result.ok) return null;
  const text = sent.result.text.trim();
  if (!text || text.toUpperCase().startsWith(UNREADABLE)) return null;
  return text;
}

// The text that joins the question, each file labelled and cut to its share; and how many could not be read.
export function attachedText(reads: readonly FileRead[]): { attached: string | null; read: number; unreadable: Unreadable[] } {
  const texts = reads.flatMap((r, i) => ('text' in r ? [`[File ${i + 1}, ${r.mime === 'application/pdf' ? 'PDF' : 'photo'}]\n${r.text.slice(0, TUTOR_READ_FILE_CHARS)}`] : []));
  const attached = texts.length ? texts.join('\n\n').slice(0, TUTOR_READ_TOTAL_CHARS) : null;
  return { attached, read: texts.length, unreadable: reads.flatMap((r) => ('unreadable' in r ? [r.unreadable] : [])) };
}

// Step 4 (no transaction): the PDFs read on the server and the photos sent, in the order the child attached them.
export async function readFetched(fetched: readonly Fetched[], calls: readonly PhotoCall[]): Promise<{ reads: FileRead[]; sent: { attachmentId: string; sent: SentText }[] }> {
  const reads: FileRead[] = [];
  const sent: { attachmentId: string; sent: SentText }[] = [];
  for (const { file, bytes } of fetched) {
    const base = { attachmentId: file.attachmentId, mime: file.mime };
    if (!bytes) {
      reads.push({ ...base, unreadable: 'failed' });
      continue;
    }
    if (file.mime === 'application/pdf') {
      const text = await pdfText(bytes);
      reads.push(text ? { ...base, text } : { ...base, unreadable: 'no_text' });
      continue;
    }
    const call = calls.find((c) => c.attachmentId === file.attachmentId);
    if (!call || 'unreadable' in call) {
      reads.push({ ...base, unreadable: call && 'unreadable' in call ? call.unreadable : 'not_set_up' });
      continue;
    }
    const s = await call.prepared.send();
    sent.push({ attachmentId: file.attachmentId, sent: s });
    const text = photoText(s);
    reads.push(text ? { ...base, text } : { ...base, unreadable: s.result.ok ? 'no_text' : 'failed' });
  }
  return { reads, sent };
}
