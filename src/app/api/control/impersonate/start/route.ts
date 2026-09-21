import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { withTenantContext } from '@/lib/auth/db';
import { fetchActiveMemberships, fetchLiveUser } from '@/lib/auth/resolve';
import { signAccessToken } from '@/lib/auth/jwt';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
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
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!targetUserId || !reason) {
    return NextResponse.json({ error: 'targetUserId and a non-empty reason are required' }, { status: 400 });
  }

  const memberships = await fetchActiveMemberships(targetUserId);
  const membership = memberships[0];
  if (!membership) {
    return NextResponse.json({ error: 'target user has no active membership to impersonate into' }, { status: 404 });
  }
  const targetLive = await fetchLiveUser(targetUserId).catch(() => null);
  if (!targetLive || !targetLive.is_active) {
    return NextResponse.json({ error: 'target user is not active' }, { status: 409 });
  }
  // [GAP] a target with multiple active memberships is impersonated into
  // the first (oldest) one only -- PRD §2.3 doesn't specify a school
  // picker for this flow, and this prompt's scope is the mechanism, not
  // every UI affordance around it.

  const expiresAt = new Date(Date.now() + IMPERSONATION_TTL_SECONDS * 1000);

  let impersonationId: string;
  try {
    // eslint-disable-next-line no-console -- TEMPORARY diag, removed with verify-prompt-e
    console.error('DIAG impersonate/start bind values', {
      sub: guard.claims.sub,
      targetUserId,
      membershipSchoolId: membership.schoolId,
    });
    impersonationId = await withTenantContext(guard.claims, async (client) => {
      const { rows } = await client.query(
        `insert into impersonation_sessions (actor_user_id, target_user_id, target_school_id, reason, expires_at)
         values ($1, $2, $3, $4, $5)
         returning impersonation_id`,
        [guard.claims.sub, targetUserId, membership.schoolId, reason, expiresAt]
      );
      await writeAuditLog(client, {
        schoolId: membership.schoolId,
        actorUserId: guard.claims.sub,
        actorRole: guard.claims.role,
        eventAction: 'ImpersonationStarted',
        targetType: 'users',
        targetId: targetUserId,
        afterState: { reason, expiresAt, targetRole: membership.role },
      });
      return rows[0].impersonation_id as string;
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
