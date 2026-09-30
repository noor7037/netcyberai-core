import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { kickJobs } from '@/lib/jobs/handlers';
import { jobQueue } from '@/lib/jobs/pg-queue';
import { PermanentJobError } from '@/lib/jobs/types';
import { invitableRoles, resendInvitation } from '@/lib/onboarding/invitations';
import { UUID_RE } from '@/lib/onboarding/public-http';

// "Resend invite" for one of the school's own invitations (RLS: another
// school's invitation is simply not found).
export async function POST(req: NextRequest, { params }: { params: { invitationId: string } }) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!invitableRoles(guard.claims.role).length || guard.claims.impersonation) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!UUID_RE.test(params.invitationId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  try {
    const { jobKeys } = await withTenantContext(guard.claims, (db) =>
      resendInvitation(db, jobQueue, params.invitationId, { userId: guard.claims.sub, role: guard.claims.role }, `${req.nextUrl.origin}/login`)
    );
    await kickJobs(jobKeys);
    return NextResponse.json({ status: jobKeys.length ? 'queued' : 'nothing_to_send' });
  } catch (err) {
    if (err instanceof PermanentJobError) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const res = sessionErrorResponse(err);
    if (res) return res;
    throw err;
  }
}
