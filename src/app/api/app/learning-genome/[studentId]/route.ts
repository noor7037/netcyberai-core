import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { childGenome } from '@/lib/genome/genome';
import { GENOME_READERS } from '@/lib/genome/rules';

// GET one child's Learning Genome (docs/27 row 9e, C217), worked out now from the rows this person may read: each
// subject's own percent in each exam with marks entered, homework done, the Daily Pulse replies to each chapter, and
// strengths and gaps by the school's settings. A child this person may not read is "not found", whatever the reason.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { studentId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!isUuid(params.studentId)) return ruleError(400, 'not_sent_properly');
    if (!GENOME_READERS.includes(claims.role)) return ruleError(403, 'not_allowed');
    const data = await childGenome(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.studentId);
    if (!data) return ruleError(404, 'not_found');
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  });
}
