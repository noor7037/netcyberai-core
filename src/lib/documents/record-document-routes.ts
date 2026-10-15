import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import type { PoolClient } from 'pg';
import { jsonError, ruleError, type AppClaims } from '@/lib/frameworks/route';
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

// The routes of the papers on a record (C235-D), the same for a member of staff (/api/app/staff/[staffId]/...) and a
// student (/api/app/students/[studentId]/...). Each route file opens the shared session guard itself (appRoute or
// appRouteAfter, where the module and write guards run) and hands its record here.
//
//   GET    .../record-documents                                 the papers, with every version, latest first
//   POST   .../record-documents                                 a new paper (multipart: file, kind, title)
//   POST   .../record-documents/[documentId]                    a new version of it (multipart: file)
//   DELETE .../record-documents/[documentId]                    the paper and all its versions
//   GET    .../record-documents/[documentId]/versions/[versionId]  a five-minute link to that file
//
// An upload is refused from its declared length before any of it is read, and is read and checked for an Aadhaar
// number or card (its OCR takes seconds) after the session is checked and before the transaction opens.


const actorOf = (claims: AppClaims): RecordActor => ({ schoolId: claims.schoolId, userId: claims.sub, role: claims.role });
const FILE_TYPES = 'PDF, JPG, PNG';

function refusal(reason: UploadFailure | 'storage_unavailable'): NextResponse {
  switch (reason) {
    case 'not_allowed':
      return ruleError(403, 'not_allowed');
    case 'not_found':
      return ruleError(404, 'not_found', { field: 'document' });
    case 'file_empty':
      return ruleError(400, 'file_empty');
    case 'file_too_large':
      return ruleError(413, 'file_too_large', { field: 'file', maxMb: RECORD_FILE_MAX_BYTES / (1024 * 1024) });
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
  if (declared > RECORD_FILE_MAX_BYTES + 64 * 1024) return refusal('file_too_large');
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
