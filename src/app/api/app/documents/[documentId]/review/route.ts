import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
import { assertRowsAffected } from '@/lib/db/rows';

interface Decision {
  extractionId: string;
  accepted: boolean;
  correctedValue?: string | null;
}

// PRD Sec6.1: "human reviews, corrects, confirms -> commit to canonical
// record + link source document." OCR never wrote to the student record
// directly (the capture route only ever wrote to ocr_extractions) --
// this route is the ONLY place a candidate field becomes real student
// data, and only after a human decision on each one, recorded either
// way (accepted or corrected), never silently dropped.
export async function POST(req: NextRequest, { params }: { params: { documentId: string } }) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;

  const body = await req.json().catch(() => null);
  const decisions: Decision[] = Array.isArray(body?.decisions) ? body.decisions : [];
  if (decisions.length === 0) {
    return NextResponse.json({ error: 'decisions (non-empty array) is required' }, { status: 400 });
  }
  for (const d of decisions) {
    if (typeof d.extractionId !== 'string' || typeof d.accepted !== 'boolean') {
      return NextResponse.json({ error: 'each decision needs extractionId (string) and accepted (boolean)' }, { status: 400 });
    }
  }

  try {
    const result = await withTenantContext(guard.claims, async (client) => {
      const docRow = await client.query(
        `select document_id, student_id, doc_type from captured_documents where school_id = $1 and document_id = $2`,
        [guard.claims.schoolId, params.documentId]
      );
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
          [d.accepted, correctedValue, guard.claims.sub, guard.claims.schoolId, d.extractionId, params.documentId]
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
        values.push(guard.claims.schoolId, studentId);
        await client.query(
          `update students set ${setClauses.join(', ')}, updated_at = now()
           where school_id = $${values.length - 1} and student_id = $${values.length}`,
          values
        );
      }

      await client.query(
        `update captured_documents set verified_by = $1, verified_at = now()
         where school_id = $2 and document_id = $3`,
        [guard.claims.sub, guard.claims.schoolId, params.documentId]
      );

      await writeAuditLog(client, {
        schoolId: guard.claims.schoolId,
        actorUserId: guard.claims.sub,
        actorRole: guard.claims.role,
        eventAction: 'document.review',
        targetType: 'captured_documents',
        targetId: params.documentId,
        afterState: { decisionsCount: decisions.length, studentFieldsCommitted: Object.keys(studentPatch) },
      });

      return { documentId: params.documentId, studentFieldsCommitted: Object.keys(studentPatch) };
    });

    if (!result) return NextResponse.json({ error: 'document not found' }, { status: 404 });
    return NextResponse.json(result);
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
