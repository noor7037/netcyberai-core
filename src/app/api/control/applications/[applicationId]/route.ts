import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { kickJobs } from '@/lib/jobs/handlers';
import { jobQueue } from '@/lib/jobs/pg-queue';
import {
  ApplicationError,
  approveApplication,
  getApplication,
  rejectApplication,
  startReview,
  type Actor,
} from '@/lib/onboarding/applications';
import { resendInvitation } from '@/lib/onboarding/invitations';
import { UUID_RE } from '@/lib/onboarding/public-http';

// The founder's decisions on a school application (C98). Each runs in one
// transaction through the state machine and is audited; approve and
// resend are idempotent, so a double click does nothing twice.
const ACTIONS = ['start_review', 'approve', 'reject', 'resend_invite'] as const;
type Action = (typeof ACTIONS)[number];

export async function POST(req: NextRequest, { params }: { params: { applicationId: string } }) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  if (!UUID_RE.test(params.applicationId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = await req.json().catch(() => null);
  const action = body?.action as Action;
  if (!ACTIONS.includes(action)) return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (action === 'reject' && (reason.length < 3 || reason.length > 1000)) {
    return NextResponse.json({ error: 'reason_required' }, { status: 400 });
  }
  const actor: Actor = { userId: guard.claims.sub, role: guard.claims.role };
  const origin = req.nextUrl.origin;
  const id = params.applicationId;

  try {
    const jobKeys = await withTenantContext(guard.claims, async (db) => {
      if (action === 'start_review') {
        await startReview(db, id, actor);
        return [];
      }
      if (action === 'approve') return (await approveApplication(db, jobQueue, id, actor, origin)).jobKeys;
      if (action === 'reject') {
        await rejectApplication(db, id, actor, reason);
        return [];
      }
      const app = await getApplication(db, id);
      if (!app?.invitation_id) throw new ApplicationError('no_invitation', 409);
      return (await resendInvitation(db, jobQueue, app.invitation_id, actor, `${origin}/login`)).jobKeys;
    });
    await kickJobs(jobKeys);
    const app = await withTenantContext(guard.claims, (db) => getApplication(db, id));
    return NextResponse.json({ status: 'done', applicationStatus: app?.status ?? null });
  } catch (err) {
    if (err instanceof ApplicationError) return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    const res = sessionErrorResponse(err);
    if (res) return res;
    throw err;
  }
}
