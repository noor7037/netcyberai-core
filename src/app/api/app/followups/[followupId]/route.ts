import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { FOLLOWUP_OUTCOMES, MAX_OUTCOME, decideFollowup } from '@/lib/pulse/followups';

// POST: record what happened: done, or not needed, with the outcome (D6, C148).
export async function POST(req: NextRequest, { params }: { params: { followupId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const body = await readJson(req);
    const status = FOLLOWUP_OUTCOMES.find((s) => s === body?.status);
    if (!isUuid(params.followupId) || !status || typeof body?.outcome !== 'string' || body.outcome.length > MAX_OUTCOME) return ruleError(400, 'not_sent_properly');
    const result = await decideFollowup(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.followupId, { status, outcome: body.outcome });
    if (result.ok) return NextResponse.json({ followup: result.followup });
    if (result.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return jsonError(result.reason === 'not_found' ? 404 : 400, 'the outcome was not saved', { code: result.reason });
  });
}
