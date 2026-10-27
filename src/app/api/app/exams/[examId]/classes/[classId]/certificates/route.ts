import { NextRequest, NextResponse } from 'next/server';
import { makeResultCertificates, resultCertificatesPreview, type ResultCertProblem } from '@/lib/documents/result-certificates';
import { appRoute, ruleError } from '@/lib/frameworks/route';

// Merit and participation certificates from a published class result (C230-AJ part 5), by the rules the school set in its
// Documents settings.
//   GET    who will get which certificate and who already has one from this publication (records nothing)
//   POST   makes the certificates the preview promised and not yet made, into the school's register; a second press makes none
// The principal and the school admin only (the register's people). The seal and signature, the number and the QR check are
// the register's own; the PDF is drawn on the office's device from the register (/api/app/documents/certificates?view=print).
export const dynamic = 'force-dynamic';

const refused = (reason: ResultCertProblem) =>
  reason === 'not_allowed' ? ruleError(403, 'not_allowed') : reason === 'not_found' ? ruleError(404, 'not_found') : NextResponse.json({ error: 'not_published' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });

export async function GET(req: NextRequest, { params }: { params: { examId: string; classId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const r = await resultCertificatesPreview(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.examId, params.classId);
    if (typeof r === 'string') return refused(r);
    return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: NextRequest, { params }: { params: { examId: string; classId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const r = await makeResultCertificates(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.examId, params.classId);
    if (!r.ok) return refused(r.reason);
    return NextResponse.json(r, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  });
}
