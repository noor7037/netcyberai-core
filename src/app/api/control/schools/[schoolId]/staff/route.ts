import { NextRequest, NextResponse } from 'next/server';
import { withTenantContext } from '@/lib/auth/db';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { listSchoolStaff } from '@/lib/control/school-staff';
import { isUuid } from '@/lib/frameworks/custom-fields';

// GET: the staff of a school, read-only, for the founder's school page (W13-B). Names, roles, subjects, status and
// the day they joined; nothing private.
export async function GET(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  if (!isUuid(params.schoolId)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  try {
    const result = await withTenantContext(guard.claims, (client) => listSchoolStaff(client, params.schoolId));
    return NextResponse.json(result);
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
