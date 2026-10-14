import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { deskInPlan, loadDesk } from '@/lib/rte/desk';

// The RTE claim desk (docs/28 slice 10c, C223; C225).
//   GET ?session=<id>  the year's rate, which fee heads count, the RTE children with their evidence and the year's
//                      claim sheet (receipts included), and every year's unpaid claims by age. The principal, the
//                      school admin and the accountant only, of a school whose plan has the desk.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!(await deskInPlan(db, claims.schoolId))) return ruleError(403, 'not_allowed'); // a part of the plan (C223-A)
    const asked = req.nextUrl.searchParams.get('session');
    const desk = await loadDesk(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { sessionId: isUuid(asked) ? asked : null });
    if (!desk) return ruleError(403, 'not_allowed');
    return NextResponse.json(desk, { headers: { 'Cache-Control': 'no-store' } });
  });
}
