import { NextRequest, NextResponse } from 'next/server';
import { withBackendConnection, withTenantContext } from '@/lib/auth/db';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { analyticsCsv, loadPlatformAnalytics, parseAnalyticsRange, recentSignIns } from '@/lib/control/analytics';

// GET ?from&to (India days, at most a year; the last 30 days by default): the platform's numbers (W21-M6).
//   &format=csv   the same numbers as one CSV
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const parsed = parseAnalyticsRange(req.nextUrl.searchParams);
  if (!parsed.ok) return NextResponse.json({ error: 'bad request', code: 'range' }, { status: 400 });
  try {
    const signIns = await withBackendConnection((backend) => recentSignIns(backend));
    const data = await withTenantContext(guard.claims, (db) => loadPlatformAnalytics(db, parsed.range, signIns));
    if (req.nextUrl.searchParams.get('format') === 'csv') {
      return new NextResponse(analyticsCsv(data), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="analytics-${data.range.from}-${data.range.to}.csv"`, 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
