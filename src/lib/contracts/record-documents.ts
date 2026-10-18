// The papers on a staff or student record (C235-D): what the routes under .../record-documents answer, and what a
// screen draws from. Pure, with no imports, so a client screen can use it as it is. The rules are in
// src/lib/documents/record-documents.ts and the database (supabase/migrations/*_c235d_record_documents.sql).

export const RECORD_DOCUMENT_KINDS = ['government_id', 'academic_certificate', 'transcript', 'experience_letter', 'other'] as const;
export type RecordDocumentKind = (typeof RECORD_DOCUMENT_KINDS)[number];

export const RECORD_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const RECORD_TITLE_MAX = 120;

export type RecordFileType = 'application/pdf' | 'image/jpeg' | 'image/png';
export type RecordVersion = { versionId: string; versionNo: number; mimeType: RecordFileType; sizeBytes: number; uploadedBy: string | null; uploadedAt: string };
// `versions`: the latest first; never empty.
export type RecordDocument = { documentId: string; kind: RecordDocumentKind; title: string; createdAt: string; versions: RecordVersion[] };

// GET .../record-documents
export type RecordDocumentsResponse = { documents: RecordDocument[]; mayUpload: boolean };

// What a file really is, from its first bytes (never its name or the type the browser claims): a PDF, a JPEG or a
// PNG; anything else (WebP included) is null. The server decides with this; a screen uses it to say so before sending.
export function recordFileTypeOf(bytes: Uint8Array): RecordFileType | null {
  const at = (i: number, ...v: number[]) => v.every((b, k) => bytes[i + k] === b);
  if (bytes.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (bytes.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (bytes.length >= 5 && at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf';
  return null;
}
export const isRecordFileType = (v: unknown): v is RecordFileType => v === 'application/pdf' || v === 'image/jpeg' || v === 'image/png';

// Direct uploads (C235-D2): the browser sends the file straight to the file store, never through the app's server
// (whose hosting refuses a request body over 4.5 MB), and the server decides everything around it.
//   POST .../record-documents/upload   asks: RecordUploadAsk → RecordUploadTicket (nothing is written yet)
//   PUT  <uploadUrl>                   the browser sends the file, with `contentType`
//   POST .../record-documents/confirm  { pendingId } → the paper or version is written, as a multipart upload is
// The multipart POST stays for files of up to RECORD_MULTIPART_MAX_BYTES.
export const RECORD_MULTIPART_MAX_BYTES = 4 * 1024 * 1024;
export const RECORD_UPLOAD_TICKET_SECONDS = 600;
// A pending file that arrived this long ago belongs to a ticket that has stopped working: it arrived after its ticket
// was given, and the ticket works for ten minutes. The ask and the hourly sweep (C237) remove such files.
export const PENDING_DEAD_SECONDS = RECORD_UPLOAD_TICKET_SECONDS + 5 * 60;
// `documentId` set: a new version of that paper (kind and title are not read); unset: a new paper.
export type RecordUploadAsk = { kind?: RecordDocumentKind; title?: string; documentId?: string; fileName: string; sizeBytes: number; mimeType: RecordFileType };
export type RecordUploadTicket = { pendingId: string; uploadUrl: string; contentType: RecordFileType; maxBytes: number; expiresAt: string };
