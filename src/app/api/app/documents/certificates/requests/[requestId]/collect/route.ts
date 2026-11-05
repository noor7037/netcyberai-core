import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { markCollected } from '@/lib/documents/certificate-requests';
import { certificateRefusal } from '@/lib/documents/refusal';

// POST: the office marks the paper copy of a request collected (W21-M7).
export async function POST(req: NextRequest, { params }: { params: { requestId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!isUuid(params.requestId)) return ruleError(400, 'not_sent_properly');
    const done = await markCollected(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.requestId);
    if (done.ok) return NextResponse.json({ ok: true });
    if (done.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    if (done.reason === 'not_found') return ruleError(404, 'not_found', { field: 'document' });
    return certificateRefusal(409, done.reason);
  });
}
