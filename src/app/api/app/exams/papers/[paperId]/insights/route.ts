import { NextRequest, NextResponse } from 'next/server';
import { EXAM_READERS } from '@/lib/exams/exams';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { paperInsights } from '@/lib/marking/insights';

// GET a paper's class view (docs/35, C352): from the approved answer sheets, per question the average marks, how many
// attempted and the most common kind of mistake; per topic the class's marks out of the marks possible; and the
// children who may need support by the school's own line, in roll order. Read under the reader's own row level
// security: the office and the coordinator every class, a teacher their own, the accountant none. A paper this person
// may not open is "not found", whatever the reason. Reads only, no model.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { paperId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!isUuid(params.paperId)) return ruleError(400, 'not_sent_properly');
    if (!EXAM_READERS.includes(claims.role)) return ruleError(403, 'not_allowed');
    const data = await paperInsights(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.paperId);
    if (!data) return ruleError(404, 'not_found');
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  });
}
