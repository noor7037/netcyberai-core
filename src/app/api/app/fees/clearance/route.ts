import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { feeClearance, mayReadClearance, overrideClearance } from '@/lib/fees/clearance';

// Fee clearance for a transfer or leaving certificate (docs/23 6g, C179).
//   GET   ?studentId=            cleared, or held and how much is owed
//   POST  { studentId, reason }  the principal or school admin lets it through, with a reason
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!mayReadClearance(claims.role)) return ruleError(403, 'not_allowed');
    const studentId = req.nextUrl.searchParams.get('studentId');
    if (!isUuid(studentId)) return ruleError(400, 'not_sent_properly');
    const clearance = await feeClearance(db, claims.schoolId, studentId);
    if (!clearance) return ruleError(404, 'not_found');
    return NextResponse.json({ clearance, mayOverride: claims.role === 'principal' || claims.role === 'school_admin' });
  });
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const body = await readJson(req);
    if (!isUuid(body?.studentId) || typeof body.reason !== 'string' || body.reason.length > 400) return ruleError(400, 'not_sent_properly');
    const done = await overrideClearance(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, body.studentId as string, body.reason);
    if (done.ok) return NextResponse.json({ ok: true }, { status: 201 });
    if (done.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return done.reason === 'unknown_student' ? ruleError(404, 'not_found') : jsonError(400, 'not recorded', { code: done.reason });
  });
}
