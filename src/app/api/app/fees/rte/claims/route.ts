import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { raiseClaims } from '@/lib/rte/desk';

// POST { sessionId, studentIds: [...], raisedOn: "yyyy-mm-dd" }: raise the year's claim for each child the sheet
// says is ready (C223). The amount is never sent: it is the rule's, on the year's rate and the child's fee.
export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    const ids = b?.studentIds;
    if (!b || !isUuid(b.sessionId) || !Array.isArray(ids) || ids.length === 0 || ids.length > 500 || !ids.every(isUuid) || typeof b.raisedOn !== 'string') return ruleError(400, 'not_sent_properly');
    const made = await raiseClaims(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { sessionId: b.sessionId as string, studentIds: ids as string[], raisedOn: b.raisedOn });
    if (made.ok) return NextResponse.json({ raised: made.raised.length, skipped: made.skipped }, { status: 201 });
    if (made.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return jsonError(made.reason === 'unknown_session' ? 404 : 400, 'the claim was not raised', { code: made.reason });
  });
}
