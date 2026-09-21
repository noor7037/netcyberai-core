import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession } from '@/lib/auth/require-app-session';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { NoRowsAffectedError } from '@/lib/db/rows';
import { reviewDocument, type ReviewDecision } from '@/lib/capture/documents';

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
  const decisions: ReviewDecision[] = Array.isArray(body?.decisions) ? body.decisions : [];
  if (decisions.length === 0) {
    return NextResponse.json({ error: 'decisions (non-empty array) is required' }, { status: 400 });
  }
  for (const d of decisions) {
    if (typeof d.extractionId !== 'string' || typeof d.accepted !== 'boolean') {
      return NextResponse.json({ error: 'each decision needs extractionId (string) and accepted (boolean)' }, { status: 400 });
    }
  }

  try {
    const result = await reviewDocument(guard.claims, params.documentId, decisions);
    if (!result) return NextResponse.json({ error: 'document not found' }, { status: 404 });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NoRowsAffectedError) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
