import { NextRequest, NextResponse } from 'next/server';
import { decideCorrectionRequest } from '@/lib/attendance/attendance';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { indiaDate } from '@/lib/time/india';

// POST: the office applies or dismisses one correction request, with a reason (C146).
export async function POST(req: NextRequest, { params }: { params: { requestId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!['principal', 'school_admin'].includes(claims.role)) return ruleError(403, 'not_allowed');
    const body = await readJson(req);
    const action = body?.action === 'apply' || body?.action === 'dismiss' ? body.action : null;
    if (!isUuid(params.requestId) || !action || typeof body?.reason !== 'string' || body.reason.length > 500) return ruleError(400, 'not_sent_properly');
    const result = await decideCorrectionRequest(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { requestId: params.requestId, action, reason: body.reason, today: indiaDate() });
    if (result.ok) return NextResponse.json(result);
    if (result.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return jsonError(result.reason === 'not_found' ? 404 : result.reason === 'outside_window' ? 409 : 400, 'this request was not decided', { code: result.reason });
  });
}
