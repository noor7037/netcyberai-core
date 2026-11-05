import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, readJson, ruleError } from '@/lib/frameworks/route';
import { waiveRequest } from '@/lib/documents/certificate-requests';
import { certificateRefusal } from '@/lib/documents/refusal';

// POST { reason }: the principal lets a request held for fees go ahead (W21-M7). The reason is kept on the request.
export async function POST(req: NextRequest, { params }: { params: { requestId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!isUuid(params.requestId) || !b || typeof b.reason !== 'string' || b.reason.length > 2000) return ruleError(400, 'not_sent_properly');
    const done = await waiveRequest(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.requestId, b.reason);
    if (done.ok) return NextResponse.json({ ok: true });
    if (done.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    if (done.reason === 'not_found') return ruleError(404, 'not_found', { field: 'document' });
    return certificateRefusal(done.reason === 'not_held' ? 409 : 400, done.reason);
  });
}
