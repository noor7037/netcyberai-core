import { NextRequest, NextResponse } from 'next/server';
import { classResult } from '@/lib/exams/results';
import { weightedNamesOf } from '@/lib/exams/weighted-view';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, ruleError } from '@/lib/frameworks/route';

// GET the class result of an exam (docs/27 row 9b, C214): each child in roll order with their marks, and the
// percent and grade by the grading scheme in force. The office and the coordinator read every class; a teacher
// their own classes.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { examId: string; classId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!isUuid(params.examId) || !isUuid(params.classId)) return ruleError(400, 'not_sent_properly');
    if (claims.role === 'accountant') return ruleError(403, 'not_allowed');
    const data = await classResult(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.examId, params.classId);
    if (!data) return ruleError(404, 'not_found');
    // The counted exam types' names (C230-AJ part 2), only when the scheme counts exam types; otherwise the answer is as it was.
    const body = data.weighted ? { ...data, weightedNames: await weightedNamesOf(db, claims.schoolId, data.weighted.weights) } : data;
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  });
}
