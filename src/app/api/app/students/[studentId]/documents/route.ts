import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { signedDocumentUrl } from '@/lib/capture/storage';
import { captureDocument, DOC_TYPES, type DocType } from '@/lib/capture/documents';
import { ruleError } from '@/lib/frameworks/route';

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

// GET: list documents already captured for this student, with a fresh
// signed URL per document (never a stored/public one -- PRD Sec6.1).
export async function GET(req: NextRequest, { params }: { params: { studentId: string } }) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;

  try {
    const documents = await withTenantContext(guard.claims, async (client) => {
      const { rows } = await client.query(
        `select document_id, doc_type, storage_path, mime_type, ocr_status, ocr_confidence, uploaded_at, verified_at
         from captured_documents where school_id = $1 and student_id = $2
         order by uploaded_at desc`,
        [guard.claims.schoolId, params.studentId]
      );
      return Promise.all(
        rows.map(async (r) => ({
          ...r,
          // Aadhaar documents were never persisted -- no real object to sign a URL for.
          signedUrl: r.storage_path.startsWith('discarded:') ? null : await signedDocumentUrl(r.storage_path),
        }))
      );
    });
    return NextResponse.json({ documents });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}

// POST: capture (camera/gallery upload) -> compress happened client-side
// already -> the Aadhaar check of what the file says (C232 part A: refused,
// and never stored, when it shows an Aadhaar number, reads as an Aadhaar
// card, or cannot be read) -> upload to school-scoped storage -> OCR ->
// candidate fields, never committed directly (PRD Sec6.1's own hard
// constraint).
export async function POST(req: NextRequest, { params }: { params: { studentId: string } }) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const docType = form?.get('docType');
  const parentId = form?.get('parentId'); // guardian_id only: whose ID this is, for the name-match check

  if (!file || typeof file === 'string') {
    return ruleError(400, 'file_missing');
  }
  if (typeof docType !== 'string' || !DOC_TYPES.includes(docType as DocType)) {
    return ruleError(400, 'choose_one', { field: 'document_type' });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return ruleError(400, 'file_type', { field: 'file', allowed: 'JPEG, PNG, WebP, PDF' });
  }
  if (file.size > MAX_BYTES || file.size === 0) {
    return file.size === 0 ? ruleError(400, 'file_empty') : ruleError(400, 'file_too_large', { field: 'file', maxMb: 8 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  try {
    const outcome = await captureDocument(
      guard.claims,
      params.studentId,
      docType as DocType,
      bytes,
      file.type,
      typeof parentId === 'string' ? parentId : null,
      file.name
    );
    if (!outcome) return ruleError(404, 'not_found', { field: 'student' });
    if ('refused' in outcome) return ruleError(400, outcome.refused, { field: 'file' });
    return NextResponse.json(outcome, { status: 201 });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
