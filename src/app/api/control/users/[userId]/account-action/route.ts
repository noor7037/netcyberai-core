import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { AuthError } from '@/lib/auth/errors';
import { authErrorResponse } from '@/lib/auth/outcome-response';
import { signOutEverywhere } from '@/lib/auth/account';
import { createOneTimeLink, removeAuthenticators, setTemporaryPassword } from '@/lib/auth/admin-actions';
import { findAnyAccount, isUserId } from '@/lib/auth/staff-accounts';
import { writeAuditLog } from '@/lib/audit/log';

// Founder console account tools (C91). Works without email delivery.
// Audited with the action name and flags only: never the link, code or password.
const ACTIONS = ['signin_link', 'reset_link', 'temp_password', 'remove_authenticator', 'sign_out_all'] as const;
type Action = (typeof ACTIONS)[number];

export async function POST(req: NextRequest, { params }: { params: { userId: string } }) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  if (!isUserId(params.userId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = await req.json().catch(() => null);
  const action = body?.action as Action;
  if (!ACTIONS.includes(action)) return NextResponse.json({ error: 'unknown action' }, { status: 400 });

  try {
    return await withTenantContext(guard.claims, async (client) => {
      const target = await findAnyAccount(client, params.userId);
      if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 });
      if (!target.email && (action === 'signin_link' || action === 'reset_link')) {
        return NextResponse.json({ error: 'no_email' }, { status: 409 });
      }
      if (action === 'remove_authenticator' && target.role === 'super_admin') {
        // No in-app authenticator enrolment exists yet, so a platform admin
        // without one could not reach the control panel at all.
        return NextResponse.json({ error: 'super_admin_authenticator' }, { status: 409 });
      }

      let result: Record<string, unknown> = {};
      if (action === 'signin_link' || action === 'reset_link') {
        result = await createOneTimeLink(target.email!, action === 'signin_link' ? 'signin' : 'reset', req.nextUrl.origin);
      } else if (action === 'temp_password') {
        await setTemporaryPassword(target.userId, body?.password);
      } else if (action === 'remove_authenticator') {
        result = { removed: await removeAuthenticators(target.userId) };
      } else {
        result = { signedOut: await signOutEverywhere(target.userId) };
      }

      await writeAuditLog(client, {
        schoolId: target.schoolId,
        actorUserId: guard.claims.sub,
        actorRole: guard.claims.role,
        eventAction: `user.console.${action}`,
        targetType: 'users',
        targetId: target.userId,
        afterState: { action },
      });
      return NextResponse.json({ status: 'done', action, ...result });
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    const res = sessionErrorResponse(err);
    if (res) return res;
    throw err;
  }
}
