import { NextRequest, NextResponse } from 'next/server';
import { progressReport } from '@/lib/exams/progress-report';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, ruleError } from '@/lib/frameworks/route';

// A child's progress report (C230-AJ part 5): the child across a session's assessments, by exam type, from the marks of
// classes the school has published only. No rank, no other child.
//   GET   ?session=<id>   the report for that session; without it, the school's current one
// The office (the principal, the school admin, the academic coordinator) and the child's class teacher.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { studentId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const session = req.nextUrl.searchParams.get('session');
    if (!isUuid(params.studentId) || (session !== null && !isUuid(session))) return ruleError(400, 'not_sent_properly');
    const r = await progressReport(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.studentId, session);
    if (r.ok) return NextResponse.json(r.report, { headers: { 'Cache-Control': 'no-store' } });
    return r.reason === 'not_allowed' ? ruleError(403, 'not_allowed') : ruleError(404, 'not_found');
  });
}
