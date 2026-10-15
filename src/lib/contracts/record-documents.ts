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
