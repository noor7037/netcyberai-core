import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { DirectUploadStorage } from '@/lib/storage/file-storage';

// The file a template carries above its words (C366): a child's checked papers as one PDF (result_pdfs, migration
// aq_5_pdf). The message log names it by its id in the queued values (`document`); the send-gate reaches the copy
// only through the database's definer functions, as the platform role, and only after every one of its rules has
// passed for the message (src/lib/whatsapp/gate.ts, deliverQueued):
//   1. take it: the message's own child's copy, while the result is published, the child on the roll with the
//      school's consent and the school letting families see the checked answer sheets. A copy given to the provider
//      before is sent again by its media id (a retry, another guardian of the child: never given twice); one not given
//      yet is claimed by this send, so a second send of it at the same moment waits instead of giving it again.
//   2. the gate reads the file (its hash checked), gives it to the provider and records the media id at once.
//   3. once a message with it is sent, the copy is recorded sent and its file deleted (the hourly sweep deletes what
//      is left: a copy sent whose file did not go, or one made more than seven days ago).
// Nothing here calls a provider: the gate does, it alone (scripts/check_whatsapp_send_gate.py).

type Sql = Pick<PoolClient, 'query'>;
export const DOCUMENT_PARAM = 'document';
// How long a send waits when another send is giving the same file to the provider.
export const BUSY_WAIT_MS = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type DocumentTake =
  | { state: 'ready'; pdfId: string; mediaId: string; filename: string }
  | { state: 'upload'; pdfId: string; storageKey: string; sha256: string; filename: string }
  | { state: 'busy'; pdfId: string }
  | { state: 'gone'; pdfId: string | null };

// The copy a queued message names, or null when it names none (or not as an id).
export function documentIdOf(params: Readonly<Record<string, unknown>>): string | null {
  const v = params[DOCUMENT_PARAM];
  return typeof v === 'string' && UUID.test(v) ? v : null;
}

export async function takeDocument(db: Sql, schoolId: string, studentId: string | null, pdfId: string | null): Promise<DocumentTake> {
  if (!pdfId || !studentId || !UUID.test(studentId)) return { state: 'gone', pdfId };
  const r = (await db.query(`select state, storage_key, sha256, file_name, media_id from public.result_pdf_take($1, $2, $3)`, [schoolId, pdfId, studentId])).rows[0] as
    | { state: string; storage_key: string | null; sha256: string | null; file_name: string | null; media_id: string | null }
    | undefined;
  if (r?.state === 'ready' && r.media_id && r.file_name) return { state: 'ready', pdfId, mediaId: r.media_id, filename: r.file_name };
  if (r?.state === 'upload' && r.storage_key && r.sha256 && r.file_name) return { state: 'upload', pdfId, storageKey: r.storage_key, sha256: r.sha256, filename: r.file_name };
  if (r?.state === 'busy') return { state: 'busy', pdfId };
  return { state: 'gone', pdfId };
}

// The provider took the file: its id, recorded once.
export async function documentUploaded(db: Sql, schoolId: string, pdfId: string, mediaId: string): Promise<void> {
  await db.query(`select public.result_pdf_uploaded($1, $2, $3)`, [schoolId, pdfId, mediaId]);
}

// Giving the file did not work: a later try may give it.
export async function releaseDocument(db: Sql, schoolId: string, pdfId: string): Promise<void> {
  await db.query(`select public.result_pdf_release($1, $2)`, [schoolId, pdfId]);
}

// A message with the copy was sent: recorded, and the file to delete now (null when it is already gone).
export async function documentSent(db: Sql, schoolId: string, pdfId: string): Promise<string | null> {
  const r = (await db.query(`select public.result_pdf_sent($1, $2) as key`, [schoolId, pdfId])).rows[0] as { key: string | null } | undefined;
  return r?.key ?? null;
}

// These copies' files were deleted from the store.
export async function documentsGone(db: Sql, pdfIds: readonly string[]): Promise<number> {
  if (!pdfIds.length) return 0;
  const r = (await db.query(`select public.result_pdfs_gone($1::uuid[]) as n`, [pdfIds])).rows[0] as { n: number } | undefined;
  return Number(r?.n ?? 0);
}

// The file as stored, only if it is the file that was made (its hash) and a PDF; else null.
export async function readDocument(storage: Pick<DirectUploadStorage, 'get'>, key: string, sha256: string): Promise<Uint8Array | null> {
  let bytes: Uint8Array | null = null;
  try {
    bytes = await storage.get(key);
  } catch {
    return null;
  }
  if (!bytes || !bytes.length) return null;
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) return null;
  return bytes;
}
