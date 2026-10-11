import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { FOLLOWUP_KINDS, MAX_REASON, createFollowup, listFollowups } from '@/lib/pulse/followups';

// The "needs help" queue (D6, C148).
//   GET   the open items in the order they arrived, and the recently decided
//   POST  add a student who needs a follow-up
const STAFF = ['principal', 'school_admin', 'academic_coordinator', 'teacher'];

export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!STAFF.includes(claims.role)) return ruleError(403, 'not_allowed');
    return NextResponse.json(await listFollowups(db, claims.schoolId));
  });
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!STAFF.includes(claims.role)) return ruleError(403, 'not_allowed');
    const body = await readJson(req);
    const kind = FOLLOWUP_KINDS.find((k) => k === body?.kind);
    const reason = typeof body?.reason === 'string' ? body.reason.trim().replace(/\s+/g, ' ') : '';
    if (!isUuid(body?.studentId) || !kind || reason.length > MAX_REASON) return ruleError(400, 'not_sent_properly');
    const result = await createFollowup(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { studentId: body.studentId as string, kind, reason: reason || null });
    if (!result.ok) return result.reason === 'not_allowed' ? ruleError(403, 'not_allowed') : jsonError(404, 'that student is not one of yours', { code: result.reason });
    return NextResponse.json({ followup: result.followup, already: result.already }, { status: result.already ? 200 : 201 });
  });
}
