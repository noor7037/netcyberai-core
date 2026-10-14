import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { loadDesk } from '@/lib/rte/desk';

// The RTE claim desk (docs/28 slice 10c, C223).
//   GET ?session=<id>  the year's rate, the RTE children with their evidence and the year's claim sheet, and every
//                      year's unpaid claims by age. The principal, the school admin and the accountant only.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const asked = req.nextUrl.searchParams.get('session');
    const desk = await loadDesk(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { sessionId: isUuid(asked) ? asked : null });
    if (!desk) return ruleError(403, 'not_allowed');
    return NextResponse.json(desk, { headers: { 'Cache-Control': 'no-store' } });
  });
}
