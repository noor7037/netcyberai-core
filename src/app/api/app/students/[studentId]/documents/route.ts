import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
import { buildObjectPath, uploadDocument, signedDocumentUrl } from '@/lib/capture/storage';
import { runOcr, extractCandidateFields, extractAadhaarLast4AndNameMatch } from '@/lib/capture/ocr';

const DOC_TYPES = [
  'birth_certificate',
  'previous_school_tc',
  'previous_report_card',
  'address_proof',
  'guardian_id', // Aadhaar constraint applies -- see below
  'student_photograph',
  'caste_category_certificate',
  'medical_record',
] as const;

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

function extensionFor(mimeType: string): string {
  return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[mimeType] ?? 'bin';
}

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
// already -> upload to school-scoped storage -> OCR -> candidate fields,
// never committed directly (PRD Sec6.1's own hard constraint).
export async function POST(req: NextRequest, { params }: { params: { studentId: string } }) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const docType = form?.get('docType');
  const parentId = form?.get('parentId'); // guardian_id only: whose ID this is, for the name-match check

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'file (multipart form field) is required' }, { status: 400 });
  }
  if (typeof docType !== 'string' || !DOC_TYPES.includes(docType as (typeof DOC_TYPES)[number])) {
    return NextResponse.json({ error: `docType must be one of ${DOC_TYPES.join(', ')}` }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: `mime type ${file.type} not allowed` }, { status: 400 });
  }
  if (file.size > MAX_BYTES || file.size === 0) {
    return NextResponse.json({ error: 'file must be non-empty and at most 8MB' }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  try {
    const outcome = await withTenantContext(guard.claims, async (client) => {
      const studentCheck = await client.query(
        `select student_id, name from students where school_id = $1 and student_id = $2`,
        [guard.claims.schoolId, params.studentId]
      );
      if (!studentCheck.rows[0]) return null;

      if (docType === 'guardian_id') {
        // AADHAAR CONSTRAINT (PRD Sec6.1, non-negotiable): the image is
        // read to extract last-4 + a name match, then discarded --
        // uploadDocument() is never called for this branch, and `bytes`
        // goes out of scope when this request ends. No full image, no
        // full number, ever persisted.
        let ocrFailed = false;
        let extraction: ReturnType<typeof extractAadhaarLast4AndNameMatch> = null;
        try {
          const guardianNameRow = parentId
            ? await client.query(`select name from parents where school_id = $1 and parent_id = $2`, [
                guard.claims.schoolId,
                parentId,
              ])
            : { rows: [] as { name: string }[] };
          const expectedName = guardianNameRow.rows[0]?.name ?? studentCheck.rows[0].name;
          const ocrResult = await runOcr(bytes);
          extraction = extractAadhaarLast4AndNameMatch(ocrResult, expectedName);
        } catch {
          ocrFailed = true;
        }

        const { rows: docRows } = await client.query(
          `insert into captured_documents
             (school_id, student_id, staff_id, doc_type, storage_path, mime_type, size_bytes, ocr_status, uploaded_by)
           values ($1, $2, $3, $4, 'discarded:aadhaar', $5, 0, $6, $7)
           returning document_id, doc_type, ocr_status, uploaded_at`,
          [
            guard.claims.schoolId,
            params.studentId,
            guard.claims.sub,
            docType,
            file.type,
            ocrFailed ? 'failed' : extraction ? 'done' : 'failed',
            guard.claims.sub,
          ]
        );
        const document = docRows[0];

        const extractions: { extraction_id: string; field_name: string; extracted_value: string | null; confidence: number | null }[] = [];
        if (extraction) {
          const fieldsToInsert = [
            { field_name: 'aadhaar_last4', extracted_value: extraction.last4, confidence: extraction.confidence },
            { field_name: 'name_match', extracted_value: String(extraction.nameMatch), confidence: extraction.confidence },
          ];
          for (const f of fieldsToInsert) {
            const { rows } = await client.query(
              `insert into ocr_extractions (school_id, document_id, field_name, extracted_value, confidence)
               values ($1, $2, $3, $4, $5)
               returning extraction_id, field_name, extracted_value, confidence`,
              [guard.claims.schoolId, document.document_id, f.field_name, f.extracted_value, f.confidence]
            );
            extractions.push(rows[0]);
          }
        }

        await writeAuditLog(client, {
          schoolId: guard.claims.schoolId,
          actorUserId: guard.claims.sub,
          actorRole: guard.claims.role,
          eventAction: 'document.capture_guardian_id',
          targetType: 'captured_documents',
          targetId: document.document_id,
          afterState: { docType, ocrStatus: document.ocr_status, imagePersisted: false },
        });

        return { document, extractions, signedUrl: null };
      }

      // Every other doc type: real upload, source image kept and linked.
      const path = buildObjectPath(guard.claims.schoolId, params.studentId, docType, extensionFor(file.type));
      await uploadDocument(path, bytes, file.type);

      let ocrStatus: 'done' | 'failed' = 'done';
      let candidateFields: { fieldName: string; extractedValue: string; confidence: number }[] = [];
      try {
        const ocrResult = await runOcr(bytes);
        candidateFields = extractCandidateFields(ocrResult);
      } catch {
        ocrStatus = 'failed';
      }

      const { rows: docRows } = await client.query(
        `insert into captured_documents
           (school_id, student_id, staff_id, doc_type, storage_path, mime_type, size_bytes, ocr_status, uploaded_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         returning document_id, doc_type, storage_path, ocr_status, uploaded_at`,
        [guard.claims.schoolId, params.studentId, guard.claims.sub, docType, path, file.type, bytes.length, ocrStatus, guard.claims.sub]
      );
      const document = docRows[0];

      const extractions: { extraction_id: string; field_name: string; extracted_value: string | null; confidence: number | null }[] = [];
      for (const f of candidateFields) {
        const { rows } = await client.query(
          `insert into ocr_extractions (school_id, document_id, field_name, extracted_value, confidence)
           values ($1, $2, $3, $4, $5)
           returning extraction_id, field_name, extracted_value, confidence`,
          [guard.claims.schoolId, document.document_id, f.fieldName, f.extractedValue, f.confidence]
        );
        extractions.push(rows[0]);
      }

      await writeAuditLog(client, {
        schoolId: guard.claims.schoolId,
        actorUserId: guard.claims.sub,
        actorRole: guard.claims.role,
        eventAction: 'document.capture',
        targetType: 'captured_documents',
        targetId: document.document_id,
        afterState: { docType, ocrStatus, fieldsExtracted: candidateFields.length },
      });

      return { document, extractions, signedUrl: await signedDocumentUrl(path) };
    });

    if (!outcome) return NextResponse.json({ error: 'student not found' }, { status: 404 });
    return NextResponse.json(outcome, { status: 201 });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
