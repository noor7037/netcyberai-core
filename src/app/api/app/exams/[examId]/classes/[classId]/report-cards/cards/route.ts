import { NextRequest, NextResponse } from 'next/server';
import { reportCards } from '@/lib/exams/report-card';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, ruleError } from '@/lib/frameworks/route';

// The report cards of a published exam's class, to be drawn as a PDF in the browser (docs/27 row 9c, C215).
//   GET   ?student=<id>  one child's card; without it, every child of the class in roll order
// The office (the principal, the school admin, the academic coordinator) and the class teacher, only while the
// result is published.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { examId: string; classId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const student = req.nextUrl.searchParams.get('student');
    if (!isUuid(params.examId) || !isUuid(params.classId) || (student !== null && !isUuid(student))) return ruleError(400, 'not_sent_properly');
    const r = await reportCards(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.examId, params.classId, student);
    if (r.ok) return NextResponse.json(r.set, { headers: { 'Cache-Control': 'no-store' } });
    if (r.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    if (r.reason === 'not_published') return jsonError(409, 'the result is not published', { code: 'not_published' });
    return ruleError(404, 'not_found');
  });
}
