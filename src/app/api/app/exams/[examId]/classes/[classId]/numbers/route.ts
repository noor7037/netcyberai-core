import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { actorOf, mayRead } from '@/lib/marking/http';
import { classNumbers } from '@/lib/marking/numbers';

// One class's candidates with their exam numbers, in roll order: the list the office prints (C348).
//   GET   the exam, the class, and each child on the roll with their number and whether they are withdrawn.
//         The office and the coordinator read every class, a teacher their own. A class with no paper in the exam is not found.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { examId: string; classId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!isUuid(params.examId) || !isUuid(params.classId)) return ruleError(400, 'not_sent_properly');
    if (!mayRead(claims)) return ruleError(403, 'not_allowed');
    const data = await classNumbers(db, actorOf(claims), params.examId, params.classId);
    if (!data) return ruleError(404, 'not_found');
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  });
}
