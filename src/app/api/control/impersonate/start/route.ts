import { randomUUID } from 'node:crypto';
import { requireStepUp } from '@/lib/auth/step-up';
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { withTenantContext } from '@/lib/auth/db';
import { fetchActiveMemberships, fetchLiveUser } from '@/lib/auth/resolve';
import { signAccessToken } from '@/lib/auth/jwt';
import type { SessionClaims } from '@/lib/auth/types';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeImpersonationAudit } from '@/lib/audit/log';
import { membershipToViewAs, viewAsReason } from '@/lib/control/people';
import { ACCESS_COOKIE, IMPERSONATION_RETURN_COOKIE, IMPERSONATION_TTL_SECONDS, cookieOptions } from '@/lib/auth/cookies';

// Task 5: impersonation resolves to the target's REAL membership row and
// goes through the exact same withTenantContext choke point as every
// other request -- no second, "just this once" code path for setting
// tenant context. What's specific to impersonation is entirely upstream
// of that: reason recorded before access is granted, logged, time-boxed.
export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  // Viewing as a school asks for the authenticator again (F1-1b, C260).
  const stepUp = await requireStepUp(req, guard.claims);
  if (stepUp) return stepUp;

  const body = await req.json().catch(() => null);
  const targetUserId = typeof body?.targetUserId === 'string' ? body.targetUserId : '';
  const read = viewAsReason(body?.reason);
  const membershipId = typeof body?.membershipId === 'string' && body.membershipId ? body.membershipId : null;
  if (!targetUserId || !read.ok) {
    const aadhaar = !read.ok && read.code === 'aadhaar';
    return NextResponse.json(
      { error: aadhaar ? 'the reason looks like it holds an Aadhaar number: never type one' : 'targetUserId and a reason of at most 300 characters are required', code: aadhaar ? 'aadhaar' : 'reason' },
      { status: 400 }
    );
  }
  const reason = read.reason;

  // The membership the founder chose on that school's page (C165), never
  // simply the person's first. Only its id comes from the request: the row
  // is read here, and must be this person's own and active. The school and
  // the role come from the row.
  const memberships = await fetchActiveMemberships(targetUserId);
  const membership = membershipToViewAs(memberships, membershipId);
  if (!membership) {
    const unclear = !membershipId && memberships.length > 1;
    if (unclear) return NextResponse.json({ error: 'this person belongs to more than one school: say which membership', code: 'which' }, { status: 400 });
    // The refusal names its real reason (W11-B): the membership switched off, or none of this person's at all.
    const code = await refusalReason(guard.claims, targetUserId, membershipId);
    return NextResponse.json({ error: code === 'membership_inactive' ? 'this membership is switched off' : 'this person has no such membership', code }, { status: 404 });
  }
  // A parent's view is not opened from Control (C230-D): the parent rules refuse a parent's session the viewing
  // record, so the founder signs in with the parent's own login to see the family app.
  if (membership.role === 'parent') {
    return NextResponse.json({ error: 'a parent is not viewed as; sign in with the parent login instead', code: 'parent' }, { status: 409 });
  }
  const targetLive = await fetchLiveUser(targetUserId).catch(() => null);
  if (!targetLive || !targetLive.is_active) {
    return NextResponse.json({ error: 'target user is not active', code: 'account_inactive' }, { status: 409 });
  }
  const expiresAt = new Date(Date.now() + IMPERSONATION_TTL_SECONDS * 1000);

  // The viewing's row keeps the reason; the audit row names the viewing by its id and never holds the reason
  // (C224's rule, C230-A): one statement writes both (writeImpersonationAudit).
  const impersonationId = randomUUID();
  try {
    await withTenantContext(guard.claims, async (client) => {
      await writeImpersonationAudit(
        client,
        {
          schoolId: membership.schoolId,
          actorUserId: guard.claims.sub,
          actorRole: guard.claims.role,
          eventAction: 'ImpersonationStarted',
          targetType: 'users',
          targetId: targetUserId,
          afterState: { impersonationId, expiresAt, targetRole: membership.role },
        },
        { impersonationId, targetUserId, reason, expiresAt }
      );
    });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }

  const impersonatedToken = await signAccessToken(
    {
      sub: targetUserId,
      role: membership.role,
      schoolId: membership.schoolId,
      membershipId: membership.membershipId,
      tokenVersion: targetLive.token_version, // re-checked live by withTenantContext's own checkLive on every request regardless
      aal: guard.claims.aal,
      sessionId: `impersonation:${impersonationId}`,
      impersonation: { impersonationId, actorUserId: guard.claims.sub },
    },
    IMPERSONATION_TTL_SECONDS
  );

  const currentAccessToken = req.cookies.get(ACCESS_COOKIE)?.value;
  const res = NextResponse.json({
    status: 'ok',
    impersonationId,
    expiresAt,
    school: { id: membership.schoolId, name: membership.schoolName },
    role: membership.role,
  });
  if (currentAccessToken) {
    res.cookies.set(IMPERSONATION_RETURN_COOKIE, currentAccessToken, cookieOptions(IMPERSONATION_TTL_SECONDS));
  }
  res.cookies.set(ACCESS_COOKIE, impersonatedToken, cookieOptions(IMPERSONATION_TTL_SECONDS));
  return res;
}

// Why no active membership was found, read as the platform: the chosen membership is this person's but switched off,
// or there is none of theirs. Only a code goes back; the screen says it in plain words.
async function refusalReason(claims: SessionClaims, targetUserId: string, membershipId: string | null): Promise<'membership_inactive' | 'no_membership'> {
  if (!membershipId) return 'no_membership';
  const found = await withTenantContext(claims, async (client) => {
    const { rows } = await client.query(`select is_active from memberships where membership_id = $1 and user_id = $2`, [membershipId, targetUserId]);
    return rows[0] as { is_active: boolean } | undefined;
  }).catch(() => undefined);
  return found && !found.is_active ? 'membership_inactive' : 'no_membership';
}
