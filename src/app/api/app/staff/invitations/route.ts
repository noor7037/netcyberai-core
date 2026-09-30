import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { normalizeEmail } from '@/lib/auth/account';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { kickJobs } from '@/lib/jobs/handlers';
import { jobQueue } from '@/lib/jobs/pg-queue';
import { InvitationExistsError, canInvite, createInvitation, invitableRoles, listInvitations } from '@/lib/onboarding/invitations';

// A school's staff invitations (C98). The principal (or school admin)
// picks the role; the invitee never does, and there are no parent or
// student accounts. The invitation and its job commit together; RLS keeps
// both to the signed-in school.
export async function GET(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  const roles = invitableRoles(guard.claims.role);
  if (!roles.length) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try {
    const invitations = await withTenantContext(guard.claims, (db) => listInvitations(db, guard.claims.schoolId));
    return NextResponse.json({ invitations, roles });
  } catch (err) {
    const res = sessionErrorResponse(err);
    if (res) return res;
    throw err;
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (guard.claims.impersonation) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!canInvite(guard.claims.role, body?.role)) return NextResponse.json({ error: 'role_not_allowed' }, { status: 403 });
  const email = normalizeEmail(body?.email);
  const displayName = typeof body?.displayName === 'string' ? body.displayName.replace(/\s+/g, ' ').trim() : '';
  if (!email || displayName.length < 2 || displayName.length > 200) {
    return NextResponse.json({ error: 'invalid', message: 'A valid email and a name (2 to 200 characters) are required.' }, { status: 400 });
  }
  try {
    const created = await withTenantContext(guard.claims, (db) =>
      createInvitation(db, jobQueue, {
        schoolId: guard.claims.schoolId,
        email,
        displayName,
        role: body.role,
        source: 'staff',
        invitedBy: { userId: guard.claims.sub, role: guard.claims.role },
        redirectTo: `${req.nextUrl.origin}/login`,
      })
    );
    await kickJobs(created.jobKeys);
    return NextResponse.json({ invitationId: created.invitationId }, { status: 201 });
  } catch (err) {
    if (err instanceof InvitationExistsError) return NextResponse.json({ error: 'already_invited' }, { status: 409 });
    const res = sessionErrorResponse(err);
    if (res) return res;
    throw err;
  }
}
