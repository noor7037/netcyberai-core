import { NextRequest, NextResponse } from 'next/server';
import { withTenantContext } from '@/lib/auth/db';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { loadSchoolFees } from '@/lib/control/school-fees';
import { isUuid } from '@/lib/frameworks/custom-fields';

// GET: one school's fees for the founder's Control view (W13-D): totals, students with dues, the last 30 days by
// method and by day. Read-only; no student names, no bank details.
export async function GET(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  if (!isUuid(params.schoolId)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  try {
    const fees = await withTenantContext(guard.claims, (client) => loadSchoolFees(client, params.schoolId));
    return NextResponse.json(fees, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
