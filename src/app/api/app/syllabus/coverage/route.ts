import { NextRequest, NextResponse } from 'next/server';
import { coverageTable } from '@/lib/academics/coverage';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { indiaDate } from '@/lib/time/india';

// Syllabus coverage by class and subject (W20-D, H4): planned, taught, %, the trend against the session's elapsed
// share, and the objectives met. A teacher sees their own classes; the office sees every class.
const STAFF = ['principal', 'school_admin', 'academic_coordinator', 'teacher'];

export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!STAFF.includes(claims.role)) return ruleError(403, 'not_allowed');
    return NextResponse.json(await coverageTable(db, claims.schoolId, claims.role, indiaDate()));
  });
}
