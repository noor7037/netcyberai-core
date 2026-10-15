import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import type { PoolClient } from 'pg';
import { jsonError, readJson, ruleError, type AppClaims } from '@/lib/frameworks/route';
import { RECORD_MULTIPART_MAX_BYTES } from '@/lib/contracts/record-documents';
import { checkUpload, type UploadCheck } from '@/lib/privacy/upload-check';
import { isUploadProblem } from '@/lib/privacy/upload-problems';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';
import {
  addRecordDocument,
  addRecordVersion,
  fileProblem,
  isRecordDocumentKind,
  listRecordDocuments,
  mayUploadRecordDocuments,
  readTitle,
  recordAccess,
  recordVersionLink,
  removeRecordDocument,
  RECORD_FILE_MAX_BYTES,
  type RecordActor,
  type RecordSubject,
  type UploadFailure,
} from './record-documents';
import { askRecordUpload, finishRecordUpload, readArrival, type Arrival, type DirectFailure } from './record-direct-upload';

// The routes of the papers on a record (C235-D), the same for a member of staff (/api/app/staff/[staffId]/...) and a
// student (/api/app/students/[studentId]/...). Each route file opens the shared session guard itself (appRoute or
// appRouteAfter, where the module and write guards run) and hands its record here.
//
//   GET    .../record-documents                                 the papers, with every version, latest first
//   POST   .../record-documents/upload                          asks to send a file straight to the store (C235-D2):
//                                                               JSON { kind, title | documentId, fileName, sizeBytes,
//                                                               mimeType } → an upload link and a sealed pendingId
//   POST   .../record-documents/confirm                         JSON { pendingId }: the file that arrived, checked and
//                                                               written as a new paper or version (the screen's path)
//   POST   .../record-documents                                 a new paper (multipart: file, kind, title), up to 4 MB
//   POST   .../record-documents/[documentId]                    a new version of it (multipart: file), up to 4 MB
//   DELETE .../record-documents/[documentId]                    the paper and all its versions
//   GET    .../record-documents/[documentId]/versions/[versionId]  a five-minute link to that file
//
// A multipart upload is refused from its declared length before any of it is read, and is read and checked for an
// Aadhaar number or card (its OCR takes seconds) after the session is checked and before the transaction opens. It
// takes at most 4 MB, under the hosting's 4.5 MB request limit, so it behaves the same everywhere; the screen sends
// every file directly (src/lib/documents/record-direct-upload.ts), whose confirmation reads and checks the file at the
// same point.


const actorOf = (claims: AppClaims): RecordActor => ({ schoolId: claims.schoolId, userId: claims.sub, role: claims.role });
const FILE_TYPES = 'PDF, JPG, PNG';

function refusal(reason: UploadFailure | DirectFailure, maxBytes = RECORD_FILE_MAX_BYTES): NextResponse {
  switch (reason) {
    case 'not_allowed':
      return ruleError(403, 'not_allowed');
    case 'not_found':
      return ruleError(404, 'not_found', { field: 'document' });
    case 'file_empty':
      return ruleError(400, 'file_empty');
    case 'file_too_large':
      return ruleError(413, 'file_too_large', { field: 'file', maxMb: maxBytes / (1024 * 1024) });
    case 'file_type':
      return ruleError(400, 'file_type', { field: 'file', allowed: FILE_TYPES });
    case 'kind':
      return ruleError(400, 'choose_one', { field: 'document_type' });
    case 'title_missing':
      return ruleError(400, 'required', { field: 'name' });
    case 'title_too_long':
    case 'title_aadhaar':
      return jsonError(400, 'the name of the document was not accepted', { code: reason });
    case 'storage_unavailable':
      return jsonError(503, 'file storage is not available', { code: 'storage_unavailable' });
    case 'not_sent_properly':
      return ruleError(400, 'not_sent_properly');
    case 'upload_unknown':
      return jsonError(400, 'this upload was not recognised', { code: reason });
    case 'upload_expired':
      return jsonError(410, 'this upload took longer than ten minutes and was stopped; send the file again', { code: reason });
    case 'upload_missing':
      return jsonError(409, 'the file did not arrive; send it again', { code: reason });
    case 'upload_done':
      return jsonError(409, 'this file was already added', { code: reason });
    default:
      // An Aadhaar number or card, or words that could not be read (C232 part A): the catalogue's own sentence.
      return isUploadProblem(reason) ? ruleError(400, reason, { field: 'file' }) : ruleError(400, 'not_sent_properly');
  }
}

type Upload = { name: string; bytes: Uint8Array; kind: unknown; title: unknown; checked?: UploadCheck };

// Reads the multipart body: refused from its declared length, then (a new paper) its kind and name, then the file's
// size and kind, and only then the Aadhaar check, the slow part.
async function readUpload(req: NextRequest, claims: AppClaims, ids: string[], newPaper: boolean): Promise<Upload | NextResponse> {
  if (!ids.every(isUuid)) return ruleError(400, 'not_sent_properly');
  if (!mayUploadRecordDocuments(claims.role)) return ruleError(403, 'not_allowed');
  const declared = Number(req.headers.get('content-length'));
  if (!Number.isFinite(declared) || declared <= 0) return ruleError(400, 'not_sent_properly');
  if (declared > RECORD_MULTIPART_MAX_BYTES + 64 * 1024) return refusal('file_too_large', RECORD_MULTIPART_MAX_BYTES);
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') return ruleError(400, 'file_missing');
  const kind = form?.get('kind');
  const title = form?.get('title');
  if (newPaper) {
    if (!isRecordDocumentKind(kind)) return refusal('kind');
    const named = readTitle(title);
    if (!named.ok) return refusal(named.reason);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > RECORD_MULTIPART_MAX_BYTES) return refusal('file_too_large', RECORD_MULTIPART_MAX_BYTES);
  const problem = fileProblem(bytes);
  if (problem) return refusal(problem);
  return { name: file.name, bytes, kind, title, checked: await checkUpload({ bytes, name: file.name }) };
}

type Ctx = { claims: AppClaims; db: PoolClient };

export const recordSubject = (kind: RecordSubject['kind'], id: string): RecordSubject => ({ kind, id });

// The prepare steps of the two uploads (appRouteAfter's first step): run before the transaction opens.
export const readNewPaper = (req: NextRequest, claims: AppClaims, subject: RecordSubject) => readUpload(req, claims, [subject.id], true);
export const readNewVersion = (req: NextRequest, claims: AppClaims, subject: RecordSubject, documentId: string) => readUpload(req, claims, [subject.id, documentId], false);

export async function listPapers({ claims, db }: Ctx, subject: RecordSubject): Promise<NextResponse> {
  if (!isUuid(subject.id)) return ruleError(400, 'not_sent_properly');
  const actor = actorOf(claims);
  const refused = await recordAccess(db, actor, subject);
  if (refused) return refusal(refused);
  return NextResponse.json({ documents: await listRecordDocuments(db, actor, subject), mayUpload: mayUploadRecordDocuments(claims.role) });
}

export async function addPaper({ claims, db, prepared }: Ctx & { prepared: Upload }, subject: RecordSubject): Promise<NextResponse> {
  if (prepared.checked && !prepared.checked.ok) return refusal(prepared.checked.reason);
  const result = await addRecordDocument(db, supabaseFileStorage, actorOf(claims), subject, { kind: prepared.kind, title: prepared.title, file: prepared }, prepared.checked);
  if (!result.ok) return refusal(result.reason);
  return NextResponse.json({ documentId: result.documentId, versionId: result.versionId, versionNo: result.versionNo }, { status: 201 });
}

export async function addVersion({ claims, db, prepared }: Ctx & { prepared: Upload }, subject: RecordSubject, documentId: string): Promise<NextResponse> {
  if (prepared.checked && !prepared.checked.ok) return refusal(prepared.checked.reason);
  const result = await addRecordVersion(db, supabaseFileStorage, actorOf(claims), subject, documentId, prepared, prepared.checked);
  if (!result.ok) return refusal(result.reason);
  return NextResponse.json({ documentId: result.documentId, versionId: result.versionId, versionNo: result.versionNo }, { status: 201 });
}

export async function removePaper({ claims, db }: Ctx, subject: RecordSubject, documentId: string): Promise<NextResponse> {
  if (!isUuid(subject.id) || !isUuid(documentId)) return ruleError(400, 'not_sent_properly');
  const result = await removeRecordDocument(db, supabaseFileStorage, actorOf(claims), subject, documentId);
  if (!result.ok) return refusal(result.reason);
  return NextResponse.json({ removed: true, versionsRemoved: result.versionsRemoved });
}

export async function paperLink({ claims, db }: Ctx, subject: RecordSubject, documentId: string, versionId: string): Promise<NextResponse> {
  if (![subject.id, documentId, versionId].every(isUuid)) return ruleError(400, 'not_sent_properly');
  const result = await recordVersionLink(db, supabaseFileStorage, actorOf(claims), subject, documentId, versionId);
  if (!result.ok) return refusal(result.reason);
  return NextResponse.json({ url: result.url, expiresInSeconds: result.expiresInSeconds }, { headers: { 'Cache-Control': 'no-store' } });
}

// ---- Direct uploads (C235-D2) ----------------------------------------------------------------------------------

const ASK_MAX_BODY = 16 * 1024;

// POST .../record-documents/upload, inside the route's transaction: the checks, the key, the link and the ticket.
export async function askUpload({ claims, db }: Ctx, req: NextRequest, subject: RecordSubject): Promise<NextResponse> {
  if (!isUuid(subject.id)) return ruleError(400, 'not_sent_properly');
  if (!mayUploadRecordDocuments(claims.role)) return ruleError(403, 'not_allowed');
  if (Number(req.headers.get('content-length') ?? 0) > ASK_MAX_BODY) return ruleError(400, 'not_sent_properly');
  const body = await readJson(req);
  if (!body) return ruleError(400, 'not_sent_properly');
  const documentId = body.documentId ?? null;
  if (documentId !== null && !isUuid(documentId)) return ruleError(400, 'not_sent_properly');
  const asked = await askRecordUpload(db, supabaseFileStorage, actorOf(claims), subject, {
    kind: body.kind,
    title: body.title,
    documentId,
    fileName: body.fileName,
    sizeBytes: body.sizeBytes,
    mimeType: body.mimeType,
  });
  if (!asked.ok) return refusal(asked.reason);
  return NextResponse.json(asked.ticket, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}

// POST .../record-documents/confirm, its first step (before the transaction): the ticket, and the file that arrived,
// read and checked. A ticket that is not the caller's own is answered here, with no file touched.
export async function readConfirm(req: NextRequest, claims: AppClaims, subject: RecordSubject): Promise<Arrival | NextResponse> {
  if (!isUuid(subject.id)) return ruleError(400, 'not_sent_properly');
  if (!mayUploadRecordDocuments(claims.role)) return ruleError(403, 'not_allowed');
  if (Number(req.headers.get('content-length') ?? 0) > ASK_MAX_BODY) return ruleError(400, 'not_sent_properly');
  const body = await readJson(req);
  const arrival = await readArrival(supabaseFileStorage, actorOf(claims), subject, body?.pendingId);
  if (!arrival.ok && !arrival.ticket) return refusal(arrival.reason);
  return arrival;
}

// Its second step, inside the transaction: once per ticket, the rows and the audit row; a refusal takes the file away.
export async function confirmUpload({ claims, db, prepared }: Ctx & { prepared: Arrival }, subject: RecordSubject): Promise<NextResponse> {
  const result = await finishRecordUpload(db, supabaseFileStorage, actorOf(claims), subject, prepared);
  if (!result.ok) return refusal(result.reason);
  return NextResponse.json({ documentId: result.documentId, versionId: result.versionId, versionNo: result.versionNo }, { status: 201 });
}
