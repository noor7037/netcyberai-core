import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, readJson, ruleError } from '@/lib/frameworks/route';
import { withdrawCertificate } from '@/lib/documents/certificates';
import { certificateRefusal } from '@/lib/documents/refusal';

// POST { reason }: the principal withdraws a certificate (C228). It keeps its number; the QR check says "withdrawn".
export async function POST(req: NextRequest, { params }: { params: { certificateId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!isUuid(params.certificateId) || !b || typeof b.reason !== 'string' || b.reason.length > 2000) return ruleError(400, 'not_sent_properly');
    const done = await withdrawCertificate(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.certificateId, b.reason);
    if (done.ok) return NextResponse.json({ ok: true });
    if (done.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    if (done.reason === 'not_found') return ruleError(404, 'not_found', { field: 'document' });
    return certificateRefusal(400, done.reason);
  });
}
