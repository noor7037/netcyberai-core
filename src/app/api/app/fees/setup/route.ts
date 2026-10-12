import { NextRequest, NextResponse } from 'next/server';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { FEES_PARTS } from '@/lib/fees/page-data';
import { FINANCE } from '@/lib/fees/structures';

// GET: what the Fees page needs to show and edit heads and structures (docs/23 6a, C157).
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!FINANCE.includes(claims.role)) return ruleError(403, 'not_allowed');
    return NextResponse.json(await FEES_PARTS.setup(db, { schoolId: claims.schoolId, role: claims.role }));
  });
}
