import { NextRequest, NextResponse } from 'next/server';
import { taughtToday } from '@/lib/copilot/today';
import { checkModuleAccess } from '@/lib/frameworks/entitlements';
import { accessDenied, appRoute, ruleError } from '@/lib/frameworks/route';
import { indiaDate } from '@/lib/time/india';

// The teacher's hour (W20-C): today's lessons recorded against the syllabus map, where Copilot starts.
//   GET  the caller's lessons today (a teacher: their own class and subject pairs only)
const STAFF = ['principal', 'school_admin', 'academic_coordinator', 'teacher'];
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const access = await checkModuleAccess(db, claims, 'teacher-copilot');
    if (!access.ok) return accessDenied(access);
    if (!STAFF.includes(claims.role)) return ruleError(403, 'not_allowed');
    const date = indiaDate();
    return NextResponse.json({ date, lessons: await taughtToday(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, date) });
  });
}
