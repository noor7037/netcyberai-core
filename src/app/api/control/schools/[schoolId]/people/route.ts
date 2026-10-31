import { NextRequest, NextResponse } from 'next/server';
import { withTenantContext } from '@/lib/auth/db';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { listSchoolPeople } from '@/lib/control/people';
import { openInvitations } from '@/lib/onboarding/invitations';
import { isUuid } from '@/lib/frameworks/custom-fields';

// GET: the people of a school, for the founder's "View as" list (C165). Names, roles and status only; and the
// invitations not yet signed in from, with their email, so a login can be made instead (W11-B).
export async function GET(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  if (!isUuid(params.schoolId)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  try {
    // With the invitations no one has signed in from yet, and how their sending is going (W11-B).
    const { people, invites } = await withTenantContext(guard.claims, async (client) => ({ people: await listSchoolPeople(client, params.schoolId), invites: await openInvitations(client, params.schoolId) }));
    return NextResponse.json({ people, invites });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
