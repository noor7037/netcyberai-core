import { NextRequest, NextResponse } from 'next/server';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { feesPageData } from '@/lib/fees/page-data';
import { FINANCE } from '@/lib/fees/structures';

// GET: everything the Fees page reads when it opens, in one call (C180, docs/19 rule 10).
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!FINANCE.includes(claims.role)) return ruleError(403, 'not_allowed');
    return NextResponse.json(await feesPageData(db, { schoolId: claims.schoolId, role: claims.role }), { headers: { 'Cache-Control': 'no-store' } });
  });
}
