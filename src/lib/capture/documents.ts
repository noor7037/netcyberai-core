import { withTenantContext } from '@/lib/auth/db';
import type { SessionClaims } from '@/lib/auth/types';
import { writeAuditLog } from '@/lib/audit/log';
import { assertRowsAffected } from '@/lib/db/rows';
import { checkUpload, type UploadProblem } from '@/lib/privacy/upload-check';
import { buildObjectPath, uploadDocument, signedDocumentUrl } from './storage';
import { runOcr, extractCandidateFields, extractAadhaarLast4AndNameMatch } from './ocr';

export const DOC_TYPES = [
  'birth_certificate',
  'previous_school_tc',
  'previous_report_card',
  'address_proof',
  'guardian_id', // Aadhaar constraint applies -- see below
  'student_photograph',
  'caste_category_certificate',
  'medical_record',
] as const;
export type DocType = (typeof DOC_TYPES)[number];

function extensionFor(mimeType: string): string {
  return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[mimeType] ?? 'bin';
}

export interface CapturedExtraction {
  extraction_id: string;
  field_name: string;
  extracted_value: string | null;
  confidence: number | null;
}

export interface CaptureOutcome {
  document: { document_id: string; doc_type: string; storage_path?: string; ocr_status: string; uploaded_at: string };
  extractions: CapturedExtraction[];
  signedUrl: string | null;
}
// A document the upload check refused (C232 part A): an Aadhaar number or card, or words that could not be read.
// Nothing was stored and nothing was written.
export type CaptureRefusal = { refused: UploadProblem };

// PRD Sec6.1's capture flow: check -> upload -> OCR -> candidate fields,
// never committed directly. Extracted from the API route (same reasoning as
// runCsvImport/resolveQrScan) so a verification route can exercise this
// exact logic with fixture claims -- never duplicated, never a
// paraphrase of what production runs.
//
// The upload check (C232 part A, src/lib/privacy/upload-check.ts) runs
// first, before any connection is taken or anything is stored: a document
// that shows an Aadhaar number, reads as an Aadhaar card, or whose words
// could not be read is refused and never kept. Its OCR is the one the
// candidate fields are read from. The guardian ID keeps its own path below.
export async function captureDocument(
  claims: SessionClaims & { schoolId: string },
  studentId: string,
  docType: DocType,
  bytes: Buffer,
  mimeType: string,
  parentId: string | null,
  fileName = ''
): Promise<CaptureOutcome | CaptureRefusal | null> {
  const screen = docType === 'guardian_id' ? null : await checkUpload({ bytes, name: fileName });
  if (screen && !screen.ok) return { refused: screen.reason };
  return withTenantContext(claims, async (client) => {
    const studentCheck = await client.query(`select student_id, name from students where school_id = $1 and student_id = $2`, [
      claims.schoolId,
      studentId,
    ]);
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
          ? await client.query(`select name from parents where school_id = $1 and parent_id = $2`, [claims.schoolId, parentId])
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
        [claims.schoolId, studentId, claims.sub, docType, mimeType, ocrFailed ? 'failed' : extraction ? 'done' : 'failed', claims.sub]
      );
      const document = docRows[0];

      const extractions: CapturedExtraction[] = [];
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
            [claims.schoolId, document.document_id, f.field_name, f.extracted_value, f.confidence]
          );
          extractions.push(rows[0]);
        }
      }

      await writeAuditLog(client, {
        schoolId: claims.schoolId,
        actorUserId: claims.sub,
        actorRole: claims.role,
        eventAction: 'document.capture_guardian_id',
        targetType: 'captured_documents',
        targetId: document.document_id,
        afterState: { docType, ocrStatus: document.ocr_status, imagePersisted: false },
      });

      return { document, extractions, signedUrl: null };
    }

    // Every other doc type: checked above, then a real upload, source image kept and linked.
    const path = buildObjectPath(claims.schoolId, studentId, docType, extensionFor(mimeType));
    await uploadDocument(path, bytes, mimeType);

    // The candidate fields come from the check's own OCR of a photo; a PDF has none (its text layer is only checked).
    const ocrStatus: 'done' | 'failed' = screen?.ok && screen.ocr ? 'done' : 'failed';
    const candidateFields: { fieldName: string; extractedValue: string; confidence: number }[] = screen?.ok && screen.ocr ? extractCandidateFields(screen.ocr) : [];

    const { rows: docRows } = await client.query(
      `insert into captured_documents
         (school_id, student_id, staff_id, doc_type, storage_path, mime_type, size_bytes, ocr_status, uploaded_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning document_id, doc_type, storage_path, ocr_status, uploaded_at`,
      [claims.schoolId, studentId, claims.sub, docType, path, mimeType, bytes.length, ocrStatus, claims.sub]
    );
    const document = docRows[0];

    const extractions: CapturedExtraction[] = [];
    for (const f of candidateFields) {
      const { rows } = await client.query(
        `insert into ocr_extractions (school_id, document_id, field_name, extracted_value, confidence)
         values ($1, $2, $3, $4, $5)
         returning extraction_id, field_name, extracted_value, confidence`,
        [claims.schoolId, document.document_id, f.fieldName, f.extractedValue, f.confidence]
      );
      extractions.push(rows[0]);
    }

    await writeAuditLog(client, {
      schoolId: claims.schoolId,
      actorUserId: claims.sub,
      actorRole: claims.role,
      eventAction: 'document.capture',
      targetType: 'captured_documents',
      targetId: document.document_id,
      afterState: { docType, ocrStatus, fieldsExtracted: candidateFields.length, uploadCheck: screen?.ok ? screen.read : null },
    });

    return { document, extractions, signedUrl: await signedDocumentUrl(path) };
  });
}

export interface ReviewDecision {
  extractionId: string;
  accepted: boolean;
  correctedValue?: string | null;
}

export interface ReviewResult {
  documentId: string;
  studentFieldsCommitted: string[];
}

// PRD Sec6.1: "human reviews, corrects, confirms -> commit to canonical
// record + link source document." This is the ONLY place a candidate
// field becomes real student data, and only after a human decision on
// each one, recorded either way (accepted or corrected), never silently
// dropped. Extracted from the API route for the same reason as
// captureDocument above.
export async function reviewDocument(
  claims: SessionClaims & { schoolId: string },
  documentId: string,
  decisions: ReviewDecision[]
): Promise<ReviewResult | null> {
  return withTenantContext(claims, async (client) => {
    const docRow = await client.query(`select document_id, student_id, doc_type from captured_documents where school_id = $1 and document_id = $2`, [
      claims.schoolId,
      documentId,
    ]);
    if (!docRow.rows[0]) return null;
    const { student_id: studentId } = docRow.rows[0];

    const studentPatch: Record<string, string> = {};

    for (const d of decisions) {
      const correctedValue = d.accepted ? null : d.correctedValue ?? null;
      const result = await client.query(
        `update ocr_extractions
           set accepted = $1, corrected_value = $2, reviewed_by = $3, reviewed_at = now()
         where school_id = $4 and extraction_id = $5 and document_id = $6
         returning field_name, extracted_value, corrected_value, accepted`,
        [d.accepted, correctedValue, claims.sub, claims.schoolId, d.extractionId, documentId]
      );
      assertRowsAffected(result, `ocr_extraction ${d.extractionId} update matched 0 rows`);
      const row = result.rows[0];

      // Commit to the canonical record: only name/dob map onto the
      // student row directly. aadhaar_last4/name_match have no
      // canonical column of their own -- the reviewed ocr_extractions
      // row itself (accepted/corrected_value, now set above) IS the
      // canonical, stored record for those, exactly what PRD Sec6.1
      // asks be stored.
      if (row.field_name === 'name' || row.field_name === 'dob') {
        const finalValue = row.accepted ? row.extracted_value : row.corrected_value;
        if (finalValue) studentPatch[row.field_name] = finalValue;
      }
    }

    if (studentId && Object.keys(studentPatch).length > 0) {
      const setClauses = Object.keys(studentPatch).map((col, i) => `${col} = $${i + 1}`);
      const values = Object.values(studentPatch);
      values.push(claims.schoolId, studentId);
      await client.query(
        `update students set ${setClauses.join(', ')}, updated_at = now()
         where school_id = $${values.length - 1} and student_id = $${values.length}`,
        values
      );
    }

    await client.query(
      `update captured_documents set verified_by = $1, verified_at = now()
       where school_id = $2 and document_id = $3`,
      [claims.sub, claims.schoolId, documentId]
    );

    await writeAuditLog(client, {
      schoolId: claims.schoolId,
      actorUserId: claims.sub,
      actorRole: claims.role,
      eventAction: 'document.review',
      targetType: 'captured_documents',
      targetId: documentId,
      afterState: { decisionsCount: decisions.length, studentFieldsCommitted: Object.keys(studentPatch) },
    });

    return { documentId, studentFieldsCommitted: Object.keys(studentPatch) };
  });
}
