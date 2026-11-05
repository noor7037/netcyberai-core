import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, ruleError } from '@/lib/frameworks/route';
import { jobQueue } from '@/lib/jobs/pg-queue';
import { retryNow } from '@/lib/whatsapp/retry';

// POST: "Retry now" on a message the log shows as failed (W21-M3). The principal and the school admin. A failure that
// trying again cannot mend is refused with its code; the action is audited.
export async function POST(req: NextRequest, { params }: { params: { logId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (claims.role !== 'principal' && claims.role !== 'school_admin') return ruleError(403, 'not_allowed');
    if (!isUuid(params.logId)) return ruleError(400, 'not_sent_properly');
    const r = await retryNow(db, jobQueue, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.logId);
    if (r.ok) return NextResponse.json({ logId: r.logId, status: r.status }, { status: 201 });
    return jsonError(r.reason === 'not_found' ? 404 : r.reason === 'not_allowed' ? 403 : 409, 'the message was not sent again', { code: r.reason });
  });
}
