import type { PoolClient } from 'pg';
import { PENDING_DEAD_SECONDS, RECORD_UPLOAD_TICKET_SECONDS, isRecordFileType, type RecordUploadTicket } from '@/lib/contracts/record-documents';
import { checkUpload, textProblem, type OcrImage, type UploadCheck } from '@/lib/privacy/upload-check';
import { FileStorageUnavailableError, type DirectUploadStorage } from '@/lib/storage/file-storage';
import {
  addRecordDocument,
  addRecordVersion,
  documentOnRecord,
  fileProblem,
  isRecordDocumentKind,
  mayUploadRecordDocuments,
  readTitle,
  recordFileKey,
  recordPendingFolder,
  recordPendingKey,
  sniffRecordFile,
  subjectExists,
  RECORD_FILE_MAX_BYTES,
  type RecordActor,
  type RecordSubject,
  type UploadFailure,
  type UploadResult,
} from './record-documents';
import { openTicket, sealTicket, type UploadTicket } from './upload-ticket';

// A paper on a record sent straight to the file store (C235-D2): the app's hosting refuses a request body over 4.5 MB,
// and a paper may be 10 MB. The browser sends the file to the store itself; the server still decides everything, in
// three steps:
//
//   1. Ask (askRecordUpload): the same person and record checks as a multipart upload, and the file's declared size
//      (at most 10 MB), type (PDF, JPEG or PNG) and name (no Aadhaar number or card words) refused up front. The server
//      chooses two keys: a pending one, "<school>/record-documents/pending/<uuid>.<ext>", where the browser sends the
//      file, and the one it is kept at once confirmed, "<school>/record-documents/<record>/<id>/<paper>/<uuid>.<ext>"
//      (a new paper's id is chosen here too). It gives an upload link for the pending key only, which never overwrites
//      a file, and a sealed ticket (src/lib/documents/upload-ticket.ts) that holds the whole pending upload and stops
//      working after ten minutes. Nothing is written to the database, and nothing is audited, at this step.
//   2. The browser sends the file to the link.
//   3. Confirm (readArrival before the transaction, finishRecordUpload inside it): only the person the ticket was given
//      to, in the same school, for the same record, within its ten minutes, and only once. The server reads what
//      arrived: its recorded size and type, then its bytes; the real size (at most 10 MB), the first bytes (PDF, JPEG
//      or PNG, and the type that was declared) and the Aadhaar upload check (C232 part A), as a multipart upload is
//      checked. Then it moves the file to its kept key, which no upload link can write, and reads it back there: only
//      the very bytes that were checked are kept (the link stays usable for two hours, so a file taken away from the
//      pending key could be replaced by another while the check runs). The paper or version rows and the one audit row
//      are written by the same code as a multipart upload (src/lib/documents/record-documents.ts). On any refusal of
//      the person's own upload the file is taken away again and nothing is written; a file a version uses is never
//      taken away, and a ticket past its ten minutes leaves its pending file to the sweep.
//
// A ticket that is not this server's, or is another person's or school's, is refused without touching any file.
//
// A file sent but never confirmed (the page was closed between sending and confirming, or the link was used after
// the ticket's ten minutes: Supabase keeps a link valid for two hours) stays only under the pending folder, where no
// row and no link ever reaches it. Each ask removes the school's pending files older than PENDING_DEAD_SECONDS, whose
// tickets have all stopped working, and so does the hourly sweep for every school (C237, src/lib/jobs/pending-sweep.ts).

export type DirectFailure = UploadFailure | 'not_sent_properly' | 'upload_unknown' | 'upload_expired' | 'upload_missing' | 'upload_done' | 'upload_changed';
export type AskResult = { ok: true; ticket: RecordUploadTicket } | { ok: false; reason: DirectFailure };

// How old a pending file must be before it goes (15 minutes): written once, in the contracts (C237).
export { PENDING_DEAD_SECONDS };

const FILE_NAME_MAX = 255;
// The file's own name: one line of at most 255 characters. Only read for the Aadhaar check; never kept.
export function readFileName(raw: unknown): string | null {
  // eslint-disable-next-line no-control-regex
  const value = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim() : '';
  return value && value.length <= FILE_NAME_MAX ? value : null;
}

export type AskInput = { kind?: unknown; title?: unknown; documentId: string | null; fileName?: unknown; sizeBytes?: unknown; mimeType?: unknown };

export async function askRecordUpload(
  db: PoolClient,
  storage: DirectUploadStorage,
  actor: RecordActor,
  subject: RecordSubject,
  input: AskInput,
  now: () => number = Date.now,
  newId: () => string = () => crypto.randomUUID()
): Promise<AskResult> {
  if (!mayUploadRecordDocuments(actor.role)) return { ok: false, reason: 'not_allowed' };
  const newPaper = input.documentId === null;
  let kind: string | null = null;
  let title: string | null = null;
  if (newPaper) {
    if (!isRecordDocumentKind(input.kind)) return { ok: false, reason: 'kind' };
    const named = readTitle(input.title);
    if (!named.ok) return { ok: false, reason: named.reason };
    kind = input.kind;
    title = named.value;
  }
  const fileName = readFileName(input.fileName);
  const size = input.sizeBytes;
  if (!fileName || typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0) return { ok: false, reason: 'not_sent_properly' };
  if (size === 0) return { ok: false, reason: 'file_empty' };
  if (size > RECORD_FILE_MAX_BYTES) return { ok: false, reason: 'file_too_large' };
  if (!isRecordFileType(input.mimeType)) return { ok: false, reason: 'file_type' };
  const named = textProblem(fileName.replace(/[_.]+/g, ' ')); // checkUpload's own reading of a name
  if (named) return { ok: false, reason: named };
  if (!(await subjectExists(db, actor, subject))) return { ok: false, reason: 'not_found' };
  if (!newPaper && !(await documentOnRecord(db, actor, subject, input.documentId as string))) return { ok: false, reason: 'not_found' };
  // What was sent and never confirmed goes first (best effort: an ask is never refused for it).
  await storage.removeOlderThan(recordPendingFolder(actor.schoolId), new Date(now() - PENDING_DEAD_SECONDS * 1000)).catch(() => 0);
  const documentId = newPaper ? newId() : (input.documentId as string);
  const fileId = newId();
  const pendingKey = recordPendingKey(actor.schoolId, fileId, input.mimeType);
  const key = recordFileKey(actor.schoolId, subject, documentId, fileId, input.mimeType);
  let uploadUrl: string;
  try {
    uploadUrl = await storage.signedUploadUrl(pendingKey);
  } catch (err) {
    if (err instanceof FileStorageUnavailableError) return { ok: false, reason: 'storage_unavailable' };
    throw err;
  }
  const expiresAt = Math.floor(now() / 1000) + RECORD_UPLOAD_TICKET_SECONDS;
  const ticket: UploadTicket = { schoolId: actor.schoolId, userId: actor.userId, record: subject.kind, recordId: subject.id, documentId, newPaper, kind, title, fileName, mime: input.mimeType, sizeBytes: size, pendingKey, key, expiresAt };
  return { ok: true, ticket: { pendingId: sealTicket(ticket), uploadUrl, contentType: input.mimeType, maxBytes: RECORD_FILE_MAX_BYTES, expiresAt: new Date(expiresAt * 1000).toISOString() } };
}

// What arrived for a ticket, read before the transaction opens (the Aadhaar check's OCR takes seconds).
//   ok:            the file, checked, ready to be kept;
//   not ok:        refused; `ticket` is the person's own pending upload (null: none of theirs, so no file is touched),
//                  and `discard` says its pending file is to be taken away.
export type Arrival =
  | { ok: true; ticket: UploadTicket; file: { name: string; bytes: Uint8Array; storedKey: string }; checked: UploadCheck }
  | { ok: false; reason: DirectFailure; ticket: UploadTicket | null; discard: boolean };

export async function readArrival(storage: DirectUploadStorage, actor: RecordActor, subject: RecordSubject, raw: unknown, now: () => number = Date.now, ocr?: OcrImage): Promise<Arrival> {
  const none = (reason: DirectFailure): Arrival => ({ ok: false, reason, ticket: null, discard: false });
  if (!mayUploadRecordDocuments(actor.role)) return none('not_allowed');
  const t = openTicket(raw);
  if (!t) return none('upload_unknown');
  if (t.schoolId !== actor.schoolId || t.userId !== actor.userId) return none('not_allowed');
  // A sealed ticket always names its own record and keys under it; anything else is not one of this server's.
  const own =
    t.record === subject.kind &&
    t.recordId === subject.id &&
    t.pendingKey.startsWith(recordPendingFolder(actor.schoolId)) &&
    t.key.startsWith(`${actor.schoolId}/record-documents/${subject.kind}/${subject.id}/${t.documentId}/`) &&
    !`${t.pendingKey}${t.key}`.includes('..');
  if (!own) return none('upload_unknown');
  const refuse = (reason: DirectFailure, discard = true): Arrival => ({ ok: false, reason, ticket: t, discard });
  // Past its ten minutes the pending file is left for the sweep, not taken away here: another confirmation of the same
  // ticket may be checking it, and an empty pending key could be written again through the link.
  if (Math.floor(now() / 1000) > t.expiresAt) return refuse('upload_expired', false);
  let info;
  try {
    info = await storage.stat(t.pendingKey);
  } catch {
    return refuse('storage_unavailable', false); // the file may be there: the person may confirm again
  }
  if (!info) return refuse('upload_missing', false);
  if (info.sizeBytes === 0) return refuse('file_empty');
  if (info.sizeBytes > RECORD_FILE_MAX_BYTES) return refuse('file_too_large');
  if (info.contentType !== null && info.contentType !== t.mime) return refuse('file_type');
  let bytes: Uint8Array | null;
  try {
    bytes = await storage.get(t.pendingKey);
  } catch {
    return refuse('storage_unavailable', false);
  }
  if (!bytes) return refuse('upload_missing', false);
  const problem = fileProblem(bytes);
  if (problem) return refuse(problem);
  if (sniffRecordFile(bytes) !== t.mime) return refuse('file_type');
  const checked = await checkUpload({ bytes, name: t.fileName }, ocr);
  if (!checked.ok) return refuse(checked.reason);
  return { ok: true, ticket: t, file: { name: t.fileName, bytes, storedKey: t.key }, checked };
}

// Inside the route's transaction: once per ticket; the file moved to its kept key; then the rows and the audit row
// exactly as a multipart upload writes them. A refusal takes the person's own file away and writes nothing.
export async function finishRecordUpload(db: PoolClient, storage: DirectUploadStorage, actor: RecordActor, subject: RecordSubject, arrival: Arrival): Promise<UploadResult | { ok: false; reason: DirectFailure }> {
  const t = arrival.ticket;
  if (!t) return { ok: false, reason: arrival.ok ? 'upload_unknown' : arrival.reason };
  // Two confirmations of one ticket wait for each other; the second finds the first one's version.
  await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`record-upload:${t.key}`]);
  if ((await db.query(`select 1 from record_document_versions where school_id = $1 and storage_key = $2`, [actor.schoolId, t.key])).rows[0]) return { ok: false, reason: 'upload_done' };
  if (!arrival.ok) {
    if (arrival.discard) await storage.remove(t.pendingKey).catch(() => undefined);
    return { ok: false, reason: arrival.reason };
  }
  try {
    await storage.move(t.pendingKey, t.key);
  } catch {
    return { ok: false, reason: 'storage_unavailable' }; // still pending: the person may confirm again
  }
  const discard = () => storage.remove(t.key).catch(() => undefined);
  // What was moved is whatever sat at the pending key at that moment: it is kept only if it is the file that was checked.
  let kept: Uint8Array | null;
  try {
    kept = await storage.get(t.key);
  } catch {
    kept = null;
  }
  if (!kept || !sameBytes(kept, arrival.file.bytes)) {
    await discard();
    return { ok: false, reason: 'upload_changed' };
  }
  let result: UploadResult;
  try {
    result = t.newPaper
      ? await addRecordDocument(db, storage, actor, subject, { kind: t.kind, title: t.title, file: arrival.file, documentId: t.documentId }, arrival.checked)
      : await addRecordVersion(db, storage, actor, subject, t.documentId, arrival.file, arrival.checked);
  } catch (err) {
    // A key already in use (unique) is someone's version: its file stays.
    if ((err as { code?: string }).code !== '23505') await discard();
    throw err;
  }
  if (!result.ok) await discard();
  return result;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;
}
