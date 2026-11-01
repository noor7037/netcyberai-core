import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireStepUp } from '@/lib/auth/step-up';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { AuthError } from '@/lib/auth/errors';
import { authErrorResponse } from '@/lib/auth/outcome-response';
import { signOutEverywhere } from '@/lib/auth/account';
import { createOneTimeLink, ensureLoginAccount, removeAuthenticators, removeLoginAccount, setTemporaryPassword, type EnsuredLogin } from '@/lib/auth/admin-actions';
import { makePassword } from '@/lib/auth/usernames';
import { findAnyAccount, isUserId } from '@/lib/auth/staff-accounts';
import { writeAuditLog, writeEntitlementAudit } from '@/lib/audit/log';
import { canRemoveAuthenticatorOf } from '@/lib/auth/authenticator-rules';
import { viewAsReason } from '@/lib/control/people';
import { isUuid } from '@/lib/frameworks/custom-fields';

// Founder console account tools (C91). Works without email delivery.
// Audited with the action name and flags only: never the link, code or password.
//
// W14-B: a person seeded straight into the database has a users row and no sign-in account; a password or a link for
// them makes the account first, with the same id and email. `deactivate`, `reactivate` and `remove` act on one of the
// person's memberships (`membershipId`) with a reason, which is kept where only the founder reads it
// (entitlement_change_reasons, C124), never in the audit row (C224). Deactivating or removing signs the person out
// everywhere at once.
const ACTIONS = ['signin_link', 'reset_link', 'temp_password', 'remove_authenticator', 'sign_out_all', 'deactivate', 'reactivate', 'remove'] as const;
type Action = (typeof ACTIONS)[number];
type MembershipAction = 'deactivate' | 'reactivate' | 'remove';
const MEMBERSHIP_ACTIONS: readonly Action[] = ['deactivate', 'reactivate', 'remove'];

export async function POST(req: NextRequest, { params }: { params: { userId: string } }) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  if (!isUserId(params.userId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = await req.json().catch(() => null);
  const action = body?.action as Action;
  if (!ACTIONS.includes(action)) return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  // A sign-in link, a temporary password, removing an authenticator or switching a person off or on hands over or
  // changes another person's access: the authenticator is asked again (F1-1b, C260). Signing out only protects.
  if (action !== 'sign_out_all') {
    const stepUp = await requireStepUp(req, guard.claims);
    if (stepUp) return stepUp;
  }

  try {
    if (MEMBERSHIP_ACTIONS.includes(action)) return await membershipAction(guard.claims, params.userId, action as MembershipAction, body);

    // The account is read in one transaction, changed in Supabase Auth outside it, and the audit row written after,
    // so no database transaction is held open while Supabase answers.
    const target = await withTenantContext(guard.claims, (client) => findAnyAccount(client, params.userId));
    if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (!target.email && (action === 'signin_link' || action === 'reset_link')) {
      return NextResponse.json({ error: 'no_email' }, { status: 409 });
    }
    // Anyone's authenticator can be removed, a platform admin's included:
    // they enrol a new one during their next sign-in, after the email step
    // (C95). Never the caller's own, or a stolen password and email could
    // swap the authenticator out from inside the console.
    if (action === 'remove_authenticator' && !canRemoveAuthenticatorOf(guard.claims.sub, target.userId)) {
      return NextResponse.json({ error: 'own_authenticator' }, { status: 409 });
    }

    let result: Record<string, unknown> = {};
    let ensured: EnsuredLogin | null = null;
    if (action === 'signin_link' || action === 'reset_link' || action === 'temp_password') {
      // No sign-in account yet (seeded staff): made now with the row's own id and email (W14-B). A link's account gets
      // a random password no one sees.
      ensured = await ensureLoginAccount(target.userId, target.email, action === 'temp_password' ? body?.password : makePassword(randomBytes(64)));
      if (ensured.state === 'no_email') return NextResponse.json({ error: 'no_email' }, { status: 409 });
      if (ensured.state === 'refused') {
        const f = ensured.failure;
        if (f === 'service_key') return NextResponse.json({ error: 'setup_required' }, { status: 503 });
        return NextResponse.json({ error: f === 'already_registered' ? 'already_registered' : 'not_created' }, { status: f === 'already_registered' ? 409 : 502 });
      }
    }
    if (action === 'signin_link' || action === 'reset_link') {
      result = await createOneTimeLink(target.email!, action === 'signin_link' ? 'signin' : 'reset', req.nextUrl.origin);
    } else if (action === 'temp_password') {
      // An account made just now already has this password.
      if (ensured?.state !== 'created') await setTemporaryPassword(target.userId, body?.password);
    } else if (action === 'remove_authenticator') {
      result = { removed: await removeAuthenticators(target.userId) };
    } else {
      result = { signedOut: await signOutEverywhere(target.userId) };
    }
    const loginCreated = ensured?.state === 'created';

    await withTenantContext(guard.claims, (client) =>
      writeAuditLog(client, {
        schoolId: target.schoolId,
        actorUserId: guard.claims.sub,
        actorRole: guard.claims.role,
        eventAction: `user.console.${action}`,
        targetType: 'users',
        targetId: target.userId,
        afterState: loginCreated ? { action, loginCreated } : { action },
      })
    );
    return NextResponse.json({ status: 'done', action, ...(loginCreated ? { loginCreated } : {}), ...result });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    const res = sessionErrorResponse(err);
    if (res) return res;
    throw err;
  }
}

// One membership of the person: switched off, switched back on, or removed (W14-B). Removing their only school keeps
// the users row (the school's history names it), marks it and the membership inactive and deletes the sign-in
// account; with another school left, only this membership goes (kept, switched off, when the school's records still
// point at it).
async function membershipAction(
  claims: Parameters<typeof withTenantContext>[0],
  userId: string,
  action: MembershipAction,
  body: { membershipId?: unknown; reason?: unknown } | null
): Promise<NextResponse> {
  const membershipId = body?.membershipId;
  if (!isUuid(membershipId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const why = viewAsReason(body?.reason);
  if (!why.ok) return NextResponse.json({ error: 'reason', code: why.code }, { status: 400 });
  if (userId === claims.sub) return NextResponse.json({ error: 'own_account' }, { status: 409 });

  const done = await withTenantContext(claims, async (client) => {
    const m = (await client.query(`select school_id, is_active from memberships where membership_id = $1 and user_id = $2 for update`, [membershipId, userId])).rows[0] as
      | { school_id: string; is_active: boolean }
      | undefined;
    if (!m) return null;
    const others = Number((await client.query(`select count(*)::int as n from memberships where user_id = $1 and membership_id <> $2`, [userId, membershipId])).rows[0].n);
    let after: Record<string, unknown>;
    if (action === 'deactivate') {
      await client.query(`update memberships set is_active = false where membership_id = $1`, [membershipId]);
      after = { membershipId, reasoned: true };
    } else if (action === 'reactivate') {
      await client.query(`update memberships set is_active = true where membership_id = $1`, [membershipId]);
      await client.query(`update users set is_active = true, updated_at = now() where user_id = $1 and not is_active`, [userId]);
      after = { membershipId, reasoned: true };
    } else if (others > 0) {
      // Another school keeps the person: this membership goes, unless this school's records (a past "View as") still
      // point at it; then it stays, switched off.
      await client.query('savepoint w14b_remove');
      const deleted = await client.query(`delete from memberships where membership_id = $1`, [membershipId]).then(
        () => true,
        async () => {
          await client.query('rollback to savepoint w14b_remove');
          await client.query(`update memberships set is_active = false where membership_id = $1`, [membershipId]);
          return false;
        }
      );
      after = { membershipId, membershipDeleted: deleted, accountDeleted: false, reasoned: true };
    } else {
      await client.query(`update memberships set is_active = false where membership_id = $1`, [membershipId]);
      await client.query(`update users set is_active = false, updated_at = now() where user_id = $1`, [userId]);
      after = { membershipId, membershipDeleted: false, accountDeleted: true, reasoned: true };
    }
    await writeEntitlementAudit(
      client,
      {
        schoolId: m.school_id,
        actorUserId: claims.sub,
        actorRole: claims.role,
        eventAction: action === 'deactivate' ? 'user.deactivated' : action === 'reactivate' ? 'user.reactivated' : 'user.removed',
        targetType: 'users',
        targetId: userId,
        beforeState: { membershipActive: m.is_active },
        afterState: after,
      },
      why.reason
    );
    return { deleteAccount: action === 'remove' && others === 0 };
  });
  if (!done) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Every session of the person ends now, not when its access token runs out: the sessions are revoked, the token
  // version moves on and remembered devices are forgotten. After the transaction, which holds the users row.
  const signedOut = action === 'reactivate' ? 0 : await signOutEverywhere(userId);
  if (done.deleteAccount && !(await removeLoginAccount(userId))) {
    return NextResponse.json({ error: 'account_not_deleted', signedOut }, { status: 502 });
  }
  return NextResponse.json({ status: 'done', action, signedOut, ...(action === 'remove' ? { accountDeleted: done.deleteAccount } : {}) });
}
