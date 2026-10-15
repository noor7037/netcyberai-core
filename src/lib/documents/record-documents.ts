import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { SchoolRole } from '@/lib/contracts/modules';
import {
  RECORD_DOCUMENT_KINDS,
  RECORD_FILE_MAX_BYTES,
  RECORD_TITLE_MAX,
  type RecordDocument,
  type RecordDocumentKind,
  type RecordFileType,
  type RecordVersion,
} from '@/lib/contracts/record-documents';
import { hasAadhaarNumber } from '@/lib/privacy/aadhaar';
import { checkUpload, type UploadCheck, type UploadProblem } from '@/lib/privacy/upload-check';
import { FileStorageUnavailableError, sniffImageType, type FileStorage } from '@/lib/storage/file-storage';

// Papers on a person's record (C235-D): scanned government IDs, academic certificates, transcripts, experience
// letters and other official papers, on a member of staff's record (teachers included) or a student's. One model for
// both (supabase/migrations/*_c235d_record_documents.sql): a paper has a kind, a name and its versions; uploading a
// new file for the same paper keeps the earlier ones, each with who uploaded it and when, the latest first.
//
// A file is a PDF, a JPEG or a PNG by its own first bytes (never its name or the type the browser claims), of at
// most 10 MB, and it passes the Aadhaar upload check before it is stored (C232 part A: no Aadhaar card or number is
// ever kept, so a guardian's Aadhaar is never stored here either). It is stored through the FileStorage choke point
// under the school's own prefix, and handed out only as a link that works for five minutes, after the paper was read
// under row level security. The file's own name is never kept; the paper's name may hold no Aadhaar number.
//
// Who (the app's check here; row level security says the same in the database):
//   - the principal and the school admin add papers and new versions, remove papers, and open every paper;
//   - a member of staff opens the papers on their own staff record;
//   - a student's papers are opened as the student's record is read: by the academic coordinator and the accountant,
//     and by a teacher only for a child of a class they teach or are class teacher of;
//   - a parent's session never reaches here (the staff app's guard), and the database refuses it too.
// Every paper added, version uploaded, link given out and paper removed is in the audit log, by ids only: never the
// paper's name or the file's name, which could hold personal data.

export { RECORD_DOCUMENT_KINDS, RECORD_FILE_MAX_BYTES, RECORD_TITLE_MAX };
export type { RecordDocument, RecordDocumentKind, RecordFileType, RecordVersion };
export const isRecordDocumentKind = (v: unknown): v is RecordDocumentKind => typeof v === 'string' && (RECORD_DOCUMENT_KINDS as readonly string[]).includes(v);

export const RECORD_LINK_SECONDS = 300;

export type RecordSubject = { kind: 'student' | 'staff'; id: string };
export type RecordActor = { schoolId: string; userId: string; role: SchoolRole };

const OFFICE: readonly SchoolRole[] = ['principal', 'school_admin'];
export const mayUploadRecordDocuments = (role: SchoolRole): boolean => OFFICE.includes(role);

// What a file really is, from its first bytes: a PDF, a JPEG or a PNG; anything else (WebP included) is null.
export function sniffRecordFile(bytes: Uint8Array): RecordFileType | null {
  const image = sniffImageType(bytes);
  if (image === 'image/png' || image === 'image/jpeg') return image;
  if (image) return null;
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d ? 'application/pdf' : null;
}
const EXT: Record<RecordFileType, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

export type FileProblem = 'file_empty' | 'file_too_large' | 'file_type';
// The size and the kind of a file, before anything else is read from it.
export function fileProblem(bytes: Uint8Array): FileProblem | null {
  if (bytes.length === 0) return 'file_empty';
  if (bytes.length > RECORD_FILE_MAX_BYTES) return 'file_too_large';
  return sniffRecordFile(bytes) ? null : 'file_type';
}

export type TitleProblem = 'title_missing' | 'title_too_long' | 'title_aadhaar';
// A paper's name: one line, 1 to 120 characters, with no Aadhaar number (the one rule, src/lib/privacy/aadhaar.ts).
export function readTitle(raw: unknown): { ok: true; value: string } | { ok: false; reason: TitleProblem } {
  // eslint-disable-next-line no-control-regex
  const value = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() : '';
  if (!value) return { ok: false, reason: 'title_missing' };
  if (value.length > RECORD_TITLE_MAX) return { ok: false, reason: 'title_too_long' };
  if (hasAadhaarNumber(value)) return { ok: false, reason: 'title_aadhaar' };
  return { ok: true, value };
}

const column = (subject: RecordSubject) => (subject.kind === 'student' ? 'student_id' : 'staff_user_id');

// Whether the record exists in this school (and, for a student, can be read by this person at all).
async function subjectExists(db: PoolClient, actor: RecordActor, subject: RecordSubject): Promise<boolean> {
  if (subject.kind === 'student') return !!(await db.query(`select 1 from students where school_id = $1 and student_id = $2`, [actor.schoolId, subject.id])).rows[0];
  return !!(
    await db.query(
      `select 1 from memberships m join users u on u.user_id = m.user_id
        where m.school_id = $1 and m.user_id = $2 and u.school_id = m.school_id and u.role <> 'super_admin' and m.role::text <> 'parent'`,
      [actor.schoolId, subject.id]
    )
  ).rows[0];
}

export type AccessRefusal = 'not_allowed' | 'not_found';

// May this person open the papers on this record? The app's own check (row level security repeats it).
export async function recordAccess(db: PoolClient, actor: RecordActor, subject: RecordSubject): Promise<AccessRefusal | null> {
  const office = OFFICE.includes(actor.role);
  if (subject.kind === 'staff') {
    if (!office && subject.id !== actor.userId) return 'not_allowed';
    return (await subjectExists(db, actor, subject)) ? null : 'not_found';
  }
  if (!office && !['teacher', 'academic_coordinator', 'accountant'].includes(actor.role)) return 'not_allowed';
  if (actor.role === 'teacher') {
    const own = await db.query(`select 1 from students where school_id = $1 and student_id = $2 and class_id = any(public.teacher_own_class_ids())`, [actor.schoolId, subject.id]);
    if (!own.rows[0]) return (await subjectExists(db, actor, subject)) ? 'not_allowed' : 'not_found';
    return null;
  }
  return (await subjectExists(db, actor, subject)) ? null : 'not_found';
}

// The papers on a record, the one with the latest upload first; each paper's versions, the latest first.
export async function listRecordDocuments(db: PoolClient, actor: RecordActor, subject: RecordSubject): Promise<RecordDocument[]> {
  const { rows } = await db.query(
    `select d.document_id, d.kind, d.title, d.created_at, v.version_id, v.version_no, v.mime_type, v.size_bytes, v.uploaded_at,
            u.display_name as uploaded_by
       from record_documents d
       join record_document_versions v on v.school_id = d.school_id and v.document_id = d.document_id
       left join users u on u.school_id = v.school_id and u.user_id = v.uploaded_by
      where d.school_id = $1 and d.${column(subject)} = $2
      order by v.version_no desc`,
    [actor.schoolId, subject.id]
  );
  const byId = new Map<string, RecordDocument>();
  for (const r of rows) {
    const doc: RecordDocument = byId.get(r.document_id) ?? { documentId: r.document_id, kind: r.kind, title: r.title, createdAt: new Date(r.created_at).toISOString(), versions: [] };
    doc.versions.push({ versionId: r.version_id, versionNo: r.version_no, mimeType: r.mime_type, sizeBytes: r.size_bytes, uploadedBy: r.uploaded_by ?? null, uploadedAt: new Date(r.uploaded_at).toISOString() });
    byId.set(r.document_id, doc);
  }
  return [...byId.values()].sort((a, b) => b.versions[0].uploadedAt.localeCompare(a.versions[0].uploadedAt) || b.createdAt.localeCompare(a.createdAt));
}

export type UploadFailure = AccessRefusal | FileProblem | TitleProblem | 'kind' | 'storage_unavailable' | UploadProblem;
export type UploadResult = { ok: true; documentId: string; versionId: string; versionNo: number } | { ok: false; reason: UploadFailure };
type NewFile = { name: string; bytes: Uint8Array };

// Store the file under the school's prefix, then its version row; a row that fails takes its file away again.
async function storeVersion(db: PoolClient, storage: FileStorage, actor: RecordActor, subject: RecordSubject, documentId: string, file: NewFile, mime: RecordFileType, newId: () => string): Promise<{ versionId: string; versionNo: number } | 'storage_unavailable'> {
  const key = `${actor.schoolId}/record-documents/${subject.kind}/${subject.id}/${documentId}/${newId()}.${EXT[mime]}`;
  try {
    await storage.put(key, file.bytes, mime);
  } catch (err) {
    if (err instanceof FileStorageUnavailableError) return 'storage_unavailable';
    throw err;
  }
  try {
    const { rows } = await db.query(
      `insert into record_document_versions (school_id, document_id, version_no, storage_key, mime_type, size_bytes, uploaded_by)
       values ($1, $2, 1, $3, $4, $5, $6) returning version_id, version_no`,
      [actor.schoolId, documentId, key, mime, file.bytes.length, actor.userId]
    );
    return { versionId: rows[0].version_id, versionNo: rows[0].version_no };
  } catch (err) {
    await storage.remove(key).catch(() => undefined);
    throw err;
  }
}

// Checks shared by a new paper and a new version: the office, a real record, a PDF/JPEG/PNG within the size, and the
// Aadhaar upload check (`checked`: already run by the route before its transaction opened; otherwise run here).
async function checkNewFile(db: PoolClient, actor: RecordActor, subject: RecordSubject, file: NewFile, checked?: UploadCheck): Promise<{ ok: true; mime: RecordFileType; read: string } | { ok: false; reason: UploadFailure }> {
  if (!mayUploadRecordDocuments(actor.role)) return { ok: false, reason: 'not_allowed' };
  if (!(await subjectExists(db, actor, subject))) return { ok: false, reason: 'not_found' };
  const problem = fileProblem(file.bytes);
  if (problem) return { ok: false, reason: problem };
  const screen = checked ?? (await checkUpload({ bytes: file.bytes, name: file.name }));
  if (!screen.ok) return { ok: false, reason: screen.reason };
  return { ok: true, mime: sniffRecordFile(file.bytes) as RecordFileType, read: screen.read };
}

export async function addRecordDocument(
  db: PoolClient,
  storage: FileStorage,
  actor: RecordActor,
  subject: RecordSubject,
  input: { kind: unknown; title: unknown; file: NewFile },
  checked?: UploadCheck,
  newId: () => string = () => crypto.randomUUID()
): Promise<UploadResult> {
  if (!mayUploadRecordDocuments(actor.role)) return { ok: false, reason: 'not_allowed' };
  if (!isRecordDocumentKind(input.kind)) return { ok: false, reason: 'kind' };
  const title = readTitle(input.title);
  if (!title.ok) return { ok: false, reason: title.reason };
  const file = await checkNewFile(db, actor, subject, input.file, checked);
  if (!file.ok) return file;
  const made = await db.query(
    `insert into record_documents (school_id, ${column(subject)}, kind, title, created_by) values ($1, $2, $3, $4, $5) returning document_id`,
    [actor.schoolId, subject.id, input.kind, title.value, actor.userId]
  );
  const documentId: string = made.rows[0].document_id;
  const version = await storeVersion(db, storage, actor, subject, documentId, input.file, file.mime, newId);
  if (version === 'storage_unavailable') {
    await db.query(`delete from record_documents where school_id = $1 and document_id = $2`, [actor.schoolId, documentId]);
    return { ok: false, reason: 'storage_unavailable' };
  }
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'record_document.added',
    targetType: 'record_documents',
    targetId: documentId,
    afterState: { record: subject.kind, recordId: subject.id, kind: input.kind, versionId: version.versionId, versionNo: version.versionNo, mime: file.mime, sizeBytes: input.file.bytes.length, uploadCheck: file.read },
  });
  return { ok: true, documentId, ...version };
}

// A new file for a paper already on the record: a new version; the earlier ones are kept.
export async function addRecordVersion(
  db: PoolClient,
  storage: FileStorage,
  actor: RecordActor,
  subject: RecordSubject,
  documentId: string,
  file: NewFile,
  checked?: UploadCheck,
  newId: () => string = () => crypto.randomUUID()
): Promise<UploadResult> {
  if (!mayUploadRecordDocuments(actor.role)) return { ok: false, reason: 'not_allowed' };
  const found = await db.query(`select 1 from record_documents where school_id = $1 and document_id = $2 and ${column(subject)} = $3`, [actor.schoolId, documentId, subject.id]);
  if (!found.rows[0]) return { ok: false, reason: 'not_found' };
  const checkedFile = await checkNewFile(db, actor, subject, file, checked);
  if (!checkedFile.ok) return checkedFile;
  const version = await storeVersion(db, storage, actor, subject, documentId, file, checkedFile.mime, newId);
  if (version === 'storage_unavailable') return { ok: false, reason: 'storage_unavailable' };
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'record_document.version_added',
    targetType: 'record_documents',
    targetId: documentId,
    afterState: { record: subject.kind, recordId: subject.id, versionId: version.versionId, versionNo: version.versionNo, mime: checkedFile.mime, sizeBytes: file.bytes.length, uploadCheck: checkedFile.read },
  });
  return { ok: true, documentId, ...version };
}

export type LinkResult = { ok: true; url: string; expiresInSeconds: number } | { ok: false; reason: AccessRefusal | 'storage_unavailable' };

// A link to one version that works for five minutes, given only after the version was read under row level security.
export async function recordVersionLink(db: PoolClient, storage: FileStorage, actor: RecordActor, subject: RecordSubject, documentId: string, versionId: string): Promise<LinkResult> {
  const refused = await recordAccess(db, actor, subject);
  if (refused) return { ok: false, reason: refused };
  const row = (
    await db.query(
      `select v.storage_key, v.version_no from record_document_versions v
         join record_documents d on d.school_id = v.school_id and d.document_id = v.document_id
        where v.school_id = $1 and v.document_id = $2 and v.version_id = $3 and d.${column(subject)} = $4`,
      [actor.schoolId, documentId, versionId, subject.id]
    )
  ).rows[0];
  if (!row) return { ok: false, reason: 'not_found' };
  let url: string;
  try {
    url = await storage.signedUrl(row.storage_key, RECORD_LINK_SECONDS);
  } catch (err) {
    if (err instanceof FileStorageUnavailableError) return { ok: false, reason: 'storage_unavailable' };
    throw err;
  }
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'record_document.link_issued',
    targetType: 'record_documents',
    targetId: documentId,
    afterState: { record: subject.kind, recordId: subject.id, versionId, versionNo: row.version_no, seconds: RECORD_LINK_SECONDS },
  });
  return { ok: true, url, expiresInSeconds: RECORD_LINK_SECONDS };
}

export type RemoveResult = { ok: true; versionsRemoved: number; filesNotRemoved: number } | { ok: false; reason: AccessRefusal };

// A paper and all its versions, removed by the office. The rows go first; then each file, as far as the storage
// allows; how many files could not be reached is in the audit row.
export async function removeRecordDocument(db: PoolClient, storage: FileStorage, actor: RecordActor, subject: RecordSubject, documentId: string): Promise<RemoveResult> {
  if (!mayUploadRecordDocuments(actor.role)) return { ok: false, reason: 'not_allowed' };
  const found = await db.query(`select 1 from record_documents where school_id = $1 and document_id = $2 and ${column(subject)} = $3`, [actor.schoolId, documentId, subject.id]);
  if (!found.rows[0]) return { ok: false, reason: 'not_found' };
  const gone = await db.query(`delete from record_document_versions where school_id = $1 and document_id = $2 returning storage_key`, [actor.schoolId, documentId]);
  await db.query(`delete from record_documents where school_id = $1 and document_id = $2`, [actor.schoolId, documentId]);
  let filesNotRemoved = 0;
  for (const r of gone.rows) await storage.remove(r.storage_key).catch(() => (filesNotRemoved += 1));
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'record_document.removed',
    targetType: 'record_documents',
    targetId: documentId,
    afterState: { record: subject.kind, recordId: subject.id, versionsRemoved: gone.rows.length, filesNotRemoved },
  });
  return { ok: true, versionsRemoved: gone.rows.length, filesNotRemoved };
}
