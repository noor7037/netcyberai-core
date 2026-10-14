import { NextRequest, NextResponse } from 'next/server';
import { loadEntitlements } from '@/lib/frameworks/entitlements';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { REPORT_ROLES, listed, reportsFor } from '@/lib/reports/load';
import { indiaDate } from '@/lib/time/india';

// GET: the reports this person may run (docs/26 slice 8h, C207). A report that is not this role's, or whose
// module the school has switched off, is not in the list. A role Reports is not for has no list at all.
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!REPORT_ROLES.includes(claims.role)) return ruleError(403, 'not_allowed');
    const mine = reportsFor(claims.role, await loadEntitlements(db, claims.schoolId));
    return NextResponse.json({ reports: mine.map(listed), today: indiaDate() }, { headers: { 'Cache-Control': 'no-store' } });
  });
}
