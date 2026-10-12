import { NextRequest, NextResponse } from 'next/server';
import { withTenantContext } from '@/lib/auth/db';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { listSchoolPeople } from '@/lib/control/people';
import { isUuid } from '@/lib/frameworks/custom-fields';

// GET: the people of a school, for the founder's "View as" list (C165). Names, roles and status only.
export async function GET(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  if (!isUuid(params.schoolId)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  try {
    const people = await withTenantContext(guard.claims, (client) => listSchoolPeople(client, params.schoolId));
    return NextResponse.json({ people });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
