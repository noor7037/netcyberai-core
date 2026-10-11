import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { decidePlan, decidedPlans, findCandidates } from '@/lib/recovery/recovery';
import { indiaDate } from '@/lib/time/india';

// Homework Recovery v1 (docs/20 5g, C152).
//   GET   the students over the school's threshold, each with a suggested catch-up plan; and the plans decided
//   POST  approve or dismiss the plan suggested for one student
const STAFF = ['principal', 'school_admin', 'academic_coordinator', 'teacher'];

export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!STAFF.includes(claims.role)) return ruleError(403, 'not_allowed');
    const today = indiaDate();
    const found = await findCandidates(db, claims.schoolId, today);
    return NextResponse.json({ today, from: found.from, threshold: found.settings.threshold, windowDays: found.settings.windowDays, candidates: found.candidates, decided: await decidedPlans(db, claims.schoolId) });
  });
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!STAFF.includes(claims.role)) return ruleError(403, 'not_allowed');
    const body = await readJson(req);
    const status = body?.status === 'approved' || body?.status === 'dismissed' ? body.status : null;
    const note = typeof body?.note === 'string' ? body.note.trim().replace(/\s+/g, ' ') : '';
    if (!isUuid(body?.studentId) || !status || note.length > 300) return ruleError(400, 'not_sent_properly');
    const result = await decidePlan(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { studentId: body.studentId as string, status, note: note || null, today: indiaDate() });
    if (result.ok) return NextResponse.json({ planId: result.planId }, { status: 201 });
    return result.reason === 'not_allowed' ? ruleError(403, 'not_allowed') : jsonError(409, 'this student is no longer on the list', { code: result.reason });
  });
}
