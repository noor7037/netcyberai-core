import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { genomePicker } from '@/lib/genome/genome';

// GET the Learning Genome's picker (docs/27 row 9e, C217): the classes this person may open and, with ?class=, the
// children on that class's roll in roll order. The office and the academic coordinator open every class; a teacher
// their own. The accountant is refused.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const classId = req.nextUrl.searchParams.get('class');
    if (classId !== null && !isUuid(classId)) return ruleError(400, 'not_sent_properly');
    const data = await genomePicker(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, classId);
    if (data === null) return ruleError(403, 'not_allowed');
    if (data === 'not_found') return ruleError(404, 'not_found');
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  });
}
