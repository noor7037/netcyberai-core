import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { decideNotice } from '@/lib/communication/notices';
import { jobQueue } from '@/lib/jobs/pg-queue';

// POST { action: 'approve' } | { action: 'reject', reason }: the principal decides a notice (C191). Approving it is
// what sends it; nothing else does.
export async function POST(req: NextRequest, { params }: { params: { noticeId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const body = await readJson(req);
    if (!isUuid(params.noticeId) || (body?.action !== 'approve' && body?.action !== 'reject') || (body.action === 'reject' && (typeof body.reason !== 'string' || body.reason.length > 400))) return ruleError(400, 'not_sent_properly');
    const done = await decideNotice(db, jobQueue, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.noticeId, body.action === 'approve' ? { approve: true } : { approve: false, reason: body.reason as string });
    if (done.ok) return NextResponse.json({ queued: done.queued, held: done.held, withoutNumber: done.withoutNumber });
    if (done.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return done.reason === 'not_found' ? ruleError(404, 'not_found') : jsonError(done.reason === 'reason' ? 400 : 409, 'the notice was not decided', { code: done.reason });
  });
}
