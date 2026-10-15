import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { withTenantContext } from '@/lib/auth/db';
import { fetchActiveMemberships, fetchLiveUser } from '@/lib/auth/resolve';
import { signAccessToken } from '@/lib/auth/jwt';
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
    return NextResponse.json({ error: unclear ? 'this person belongs to more than one school: say which membership' : 'this person has no such active membership' }, { status: unclear ? 400 : 404 });
  }
  const targetLive = await fetchLiveUser(targetUserId).catch(() => null);
  if (!targetLive || !targetLive.is_active) {
    return NextResponse.json({ error: 'target user is not active' }, { status: 409 });
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
