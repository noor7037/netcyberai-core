import { NextRequest, NextResponse } from 'next/server';
import { withTenantContext } from '@/lib/auth/db';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { schoolAttendance } from '@/lib/control/school-attendance';
import { isUuid } from '@/lib/frameworks/custom-fields';

// GET: one school's attendance, read-only, for the founder's Control view (W13-C): today's marking, the last 14 days
// and the correction requests waiting. Counts and class names only; no student is named.
export async function GET(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  if (!isUuid(params.schoolId)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  try {
    const attendance = await withTenantContext(guard.claims, (client) => schoolAttendance(client, params.schoolId));
    return NextResponse.json(attendance);
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
