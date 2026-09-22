import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { login, verifyMfaAndContinue, fetchActiveMemberships, fetchLiveUser } from '@/lib/auth/resolve';
import { signAccessToken } from '@/lib/auth/jwt';
import { withTenantContext } from '@/lib/auth/db';
import { writeAuditLog } from '@/lib/audit/log';
import { shellForRole, canAccessControl, canAccessApp } from '@/lib/auth/guards';
import type { SessionClaims } from '@/lib/auth/types';

// TEMPORARY, C38-pattern diagnostic route: proves the real login -> MFA
// -> impersonation round trip end to end against production, since this
// sandbox's own egress policy cannot reach netcyberai.com or
// *.supabase.co directly to exercise it via a normal HTTP client.
// Token-gated, 404s on a bad/missing token, removed before this PR
// merges -- same discipline as every other diagnostic route this
// project has used (Decision Log C38 and every prompt since).

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of input.toUpperCase().replace(/=+$/, '')) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function totpNow(secretBase32: string, step = 30, digits = 6): string {
  const key = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / step);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 10 ** digits).padStart(digits, '0');
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token || token !== process.env.DIAG_TOKEN_DEMO_ACCESS) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const report: Record<string, unknown> = {};

  try {
    // Step 1: real password login against production GoTrue.
    const loginOutcome = await login('founder-demo@netcyberai.dev', process.env.DIAG_DEMO_PASSWORD ?? '');
    report.step1_login = { status: loginOutcome.status };
    if (loginOutcome.status !== 'mfa_required') {
      return NextResponse.json({ report, fatal: 'expected mfa_required' }, { status: 500 });
    }

    // Step 2: real TOTP verification, code computed live from the same
    // secret stored in auth.mfa_factors for this account.
    const code = totpNow(process.env.DIAG_DEMO_TOTP_SECRET ?? '');
    const mfaOutcome = await verifyMfaAndContinue(loginOutcome.pendingToken, code);
    report.step2_mfa = { status: mfaOutcome.status };
    if (mfaOutcome.status !== 'ok') {
      return NextResponse.json({ report, fatal: 'expected ok after MFA' }, { status: 500 });
    }

    const superAdminClaims = mfaOutcome.claims;
    report.step2_mfa = {
      ...(report.step2_mfa as object),
      role: superAdminClaims.role,
      schoolId: superAdminClaims.schoolId,
      aal: superAdminClaims.aal,
      hasAccessToken: Boolean(mfaOutcome.accessToken),
      hasRefreshToken: Boolean(mfaOutcome.refreshToken),
      canAccessControl: canAccessControl(superAdminClaims),
    };

    // Step 3: impersonate into each real target, exactly replicating
    // POST /api/control/impersonate/start's own logic (not re-testing a
    // mock -- the same fetchActiveMemberships/fetchLiveUser/
    // signAccessToken/withTenantContext choke point).
    async function impersonate(targetUserId: string, label: string) {
      const memberships = await fetchActiveMemberships(targetUserId);
      const membership = memberships[0];
      if (!membership) return { label, error: 'no active membership' };
      const targetLive = await fetchLiveUser(targetUserId).catch(() => null);
      if (!targetLive || !targetLive.is_active) return { label, error: 'target not active' };

      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      const impersonationId = await withTenantContext(superAdminClaims, async (client) => {
        const { rows } = await client.query(
          `insert into impersonation_sessions (actor_user_id, target_user_id, target_school_id, reason, expires_at)
           values ($1, $2, $3, $4, $5)
           returning impersonation_id`,
          [superAdminClaims.sub, targetUserId, membership.schoolId, 'Founder product review (diag-demo-access)', expiresAt]
        );
        await writeAuditLog(client, {
          schoolId: membership.schoolId,
          actorUserId: superAdminClaims.sub,
          actorRole: superAdminClaims.role,
          eventAction: 'ImpersonationStarted',
          targetType: 'users',
          targetId: targetUserId,
          afterState: { reason: 'diag-demo-access', expiresAt, targetRole: membership.role },
        });
        return rows[0].impersonation_id as string;
      });

      const impersonatedClaims: SessionClaims = {
        sub: targetUserId,
        role: membership.role,
        schoolId: membership.schoolId,
        membershipId: membership.membershipId,
        tokenVersion: targetLive.token_version,
        aal: superAdminClaims.aal,
        sessionId: `impersonation:${impersonationId}`,
      };
      const impersonatedToken = await signAccessToken(impersonatedClaims, 15 * 60);

      return {
        label,
        impersonationId,
        role: membership.role,
        schoolId: membership.schoolId,
        schoolName: membership.schoolName,
        shell: shellForRole(membership.role),
        canAccessApp: canAccessApp(impersonatedClaims),
        hasImpersonatedToken: Boolean(impersonatedToken),
      };
    }

    report.step3_impersonate_school_admin = await impersonate('932b65ef-59fd-446b-bb52-6d6189dd6d0e', 'school_admin');
    report.step3_impersonate_teacher = await impersonate('069eab8e-6645-4312-8ba7-7d79c74bb8c7', 'teacher');

    return NextResponse.json({ report, ok: true });
  } catch (err) {
    return NextResponse.json({ report, fatal: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
