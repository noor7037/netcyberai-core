import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { addEvidence } from '@/lib/rte/desk';

// POST { studentId, kind, documentId | null, note | null }: add to an RTE child's evidence file one of the child's
// own captured documents, or a typed note, with what it proves (C223). Never an Aadhaar number.
export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    const documentId = b?.documentId ?? null;
    const note = b?.note ?? null;
    if (!b || !isUuid(b.studentId) || typeof b.kind !== 'string' || (documentId !== null && !isUuid(documentId)) || (note !== null && (typeof note !== 'string' || note.length > 2000))) return ruleError(400, 'not_sent_properly');
    const made = await addEvidence(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { studentId: b.studentId as string, kind: b.kind, documentId: documentId as string | null, note });
    if (made.ok) return NextResponse.json({ evidenceId: made.evidenceId }, { status: 201 });
    if (made.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return jsonError(400, 'the evidence was not added', { code: made.reason });
  });
}
