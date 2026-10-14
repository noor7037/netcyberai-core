import { NextRequest, NextResponse } from 'next/server';
import { gapScreen } from '@/lib/curriculum-gap/curriculum-gap';
import { appRoute, ruleError } from '@/lib/frameworks/route';

// GET the Curriculum Gap Detector (docs/27 row 9d, C216): ?classId=&subjectId=&sessionId= (each optional; the session
// is the current one unless another is chosen, C219). The person's classes
// (the office and the academic coordinator: every class; a teacher: their own), the school's subjects with whether the
// class has a syllabus map for each, and the chosen class and subject's units in the map's order, each with its state
// and the days it rests on, and a count of each state. Read only: nothing here changes anything.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const url = new URL(req.url);
    const got = await gapScreen(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { classId: url.searchParams.get('classId'), subjectId: url.searchParams.get('subjectId'), sessionId: url.searchParams.get('sessionId') });
    if (!got.ok) return got.reason === 'not_allowed' ? ruleError(403, 'not_allowed') : ruleError(404, 'not_found');
    return NextResponse.json(got.screen, { headers: { 'Cache-Control': 'no-store' } });
  });
}
