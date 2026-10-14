import { NextRequest, NextResponse } from 'next/server';
import { loadEntitlements } from '@/lib/frameworks/entitlements';
import { appRoute } from '@/lib/frameworks/route';
import { askReport } from '@/lib/reports/load';
import { reportRefusal } from '@/lib/reports/refusal';

// GET ?range=today|7d|30d, or ?from=YYYY-MM-DD&to=YYYY-MM-DD: one report's rows and its total row for those
// days (docs/26 slice 8h, C207), run in the caller's own tenant transaction, so row level security decides every
// row. A report that is not this role's is refused here, as it is absent from the list.
export async function GET(req: NextRequest, { params }: { params: { reportId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const asked = await askReport(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, await loadEntitlements(db, claims.schoolId), params.reportId, req.nextUrl.searchParams);
    if (!asked.ok) return reportRefusal(asked.reason);
    return NextResponse.json({ report: asked.result, rangeId: asked.asked.rangeId }, { headers: { 'Cache-Control': 'no-store' } });
  });
}
