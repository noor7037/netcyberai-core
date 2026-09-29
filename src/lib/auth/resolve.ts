import { withSelfContext, withBackendConnection } from './db';
import { newAuthClient } from './supabase';
import { signAccessToken, signPendingToken, verifyPendingToken } from './jwt';
import { newRefreshToken, hashToken } from './hash';
import { AuthError } from './errors';
import { AUTHENTICATOR_SETUP_TTL_SECONDS } from './cookies';
import { authenticatorStepAtSignIn } from './authenticator-rules';
import type { LoginOutcome, MembershipRow, SessionClaims, StaffRole } from './types';

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days; not specified numerically by PRD Sec2.3, a stated operational default

interface LiveUserRow {
  role: string;
  token_version: number;
  is_active: boolean;
}

async function fetchLiveUser(userId: string): Promise<LiveUserRow> {
  return withSelfContext(userId, async (client) => {
    const { rows } = await client.query(
      `select role, token_version, is_active from users where user_id = $1`,
      [userId]
    );
    if (!rows[0]) {
      throw new AuthError('invalid_credentials', 'no matching users row for authenticated identity');
    }
    return rows[0] as LiveUserRow;
  });
}

async function fetchActiveMemberships(userId: string): Promise<MembershipRow[]> {
  return withSelfContext(userId, async (client) => {
    const { rows } = await client.query(
      `select m.membership_id, m.school_id, s.name as school_name, m.role, m.is_active
       from memberships m
       join schools s on s.school_id = m.school_id
       where m.user_id = $1 and m.is_active = true
       order by m.created_at asc`,
      [userId]
    );
    return rows.map((r) => ({
      membershipId: r.membership_id,
      schoolId: r.school_id,
      schoolName: r.school_name,
      role: r.role as StaffRole,
      isActive: r.is_active,
    }));
  });
}

// membershipId is client-chosen (which school to act as); everything
// else about it -- that it exists, that it belongs to this user, that
// it's active, its role -- is re-read from the row here, never trusted
// from whatever the client claimed.
async function fetchOwnedActiveMembership(userId: string, membershipId: string): Promise<MembershipRow | null> {
  return withSelfContext(userId, async (client) => {
    const { rows } = await client.query(
      `select m.membership_id, m.school_id, s.name as school_name, m.role, m.is_active
       from memberships m
       join schools s on s.school_id = m.school_id
       where m.user_id = $1 and m.membership_id = $2 and m.is_active = true`,
      [userId, membershipId]
    );
    if (!rows[0]) return null;
    return {
      membershipId: rows[0].membership_id,
      schoolId: rows[0].school_id,
      schoolName: rows[0].school_name,
      role: rows[0].role as StaffRole,
      isActive: rows[0].is_active,
    };
  });
}

async function mintSession(
  userId: string,
  role: StaffRole,
  schoolId: string | null,
  membershipId: string | null,
  tokenVersion: number,
  aal: 'aal1' | 'aal2'
): Promise<{ accessToken: string; refreshToken: string; claims: SessionClaims }> {
  const refreshToken = newRefreshToken();
  const refreshHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  const sessionId = await withBackendConnection(async (client) => {
    const { rows } = await client.query(
      `insert into sessions (user_id, refresh_token_hash, selected_school_id, token_version_snapshot, aal, expires_at)
       values ($1, $2, $3, $4, $5, $6)
       returning session_id`,
      [userId, refreshHash, schoolId, tokenVersion, aal, expiresAt]
    );
    return rows[0].session_id as string;
  });

  const claims: SessionClaims = {
    sub: userId,
    role,
    schoolId,
    membershipId,
    tokenVersion,
    aal,
    sessionId,
  };
  const accessToken = await signAccessToken(claims);
  return { accessToken, refreshToken, claims };
}

// What the Supabase session behind this sign-in says about authenticators
// (C95): whether the account has a confirmed one, and whether this session
// came from an emailed code or link. Absent when unknown, which keeps the
// old behaviour (platform admins are asked for a code, nobody else is).
export type AuthenticatorContext = { hasVerified: boolean; emailProven: boolean };

async function resolveAfterCredentials(
  userId: string,
  aal: 'aal1' | 'aal2',
  pendingSupabaseTokens?: { sbAccessToken: string; sbRefreshToken: string },
  authenticator?: AuthenticatorContext
): Promise<LoginOutcome> {
  const live = await fetchLiveUser(userId);
  if (!live.is_active) {
    throw new AuthError('account_disabled', 'users.is_active is false');
  }

  const step = authenticatorStepAtSignIn({
    role: live.role,
    aal,
    // Unknown counts as "has one" for a platform admin (ask for the code, as
    // before C95) and as "has none" for everyone else (nothing to ask).
    hasVerifiedAuthenticator: authenticator?.hasVerified ?? live.role === 'super_admin',
    emailProven: authenticator?.emailProven ?? false,
  });
  if (step === 'not_enrolled') {
    throw new AuthError('mfa_not_enrolled', 'platform admin has no authenticator and the email was not proven in this sign-in');
  }
  if (step === 'setup') {
    if (!pendingSupabaseTokens) throw new AuthError('pending_token_invalid', 'no Supabase session to enrol with');
    const pendingToken = await signPendingToken(
      { userId, purpose: 'mfa_setup', aal: 'aal1', ...pendingSupabaseTokens },
      AUTHENTICATOR_SETUP_TTL_SECONDS
    );
    return { status: 'mfa_setup', pendingToken };
  }
  if (step === 'verify') {
    const pendingToken = await signPendingToken({
      userId,
      purpose: 'mfa',
      aal: 'aal1',
      ...pendingSupabaseTokens,
    });
    return { status: 'mfa_required', pendingToken };
  }

  if (live.role === 'super_admin') {
    // Reached only at aal2: step is 'none' for a platform admin only then.
    const minted = await mintSession(userId, 'super_admin', null, null, live.token_version, 'aal2');
    return { status: 'ok', ...minted };
  }

  const memberships = await fetchActiveMemberships(userId);
  if (memberships.length === 0) {
    return { status: 'no_memberships' };
  }
  if (memberships.length === 1) {
    const m = memberships[0];
    const minted = await mintSession(userId, m.role, m.schoolId, m.membershipId, live.token_version, aal);
    return { status: 'ok', ...minted };
  }
  const pendingToken = await signPendingToken({ userId, purpose: 'select_school', aal });
  return { status: 'select_school', pendingToken, memberships };
}

// Password sign-in lives in account.ts (passwordLogin, C90) so that it can
// never skip the email-code step; it hands off to resolveAfterCredentials.

export async function verifyMfaAndContinue(pendingToken: string, code: string): Promise<LoginOutcome> {
  const pending = await verifyPendingToken(pendingToken);
  if (!pending || pending.purpose !== 'mfa' || !pending.sbAccessToken || !pending.sbRefreshToken) {
    throw new AuthError('pending_token_invalid', 'no pending MFA step for this token');
  }

  const client = newAuthClient();
  await client.auth.setSession({ access_token: pending.sbAccessToken, refresh_token: pending.sbRefreshToken });

  const { data: factorsData, error: factorsError } = await client.auth.mfa.listFactors();
  const totpFactor = factorsData?.totp?.find((f) => f.status === 'verified');
  if (factorsError || !totpFactor) {
    throw new AuthError('mfa_not_enrolled', 'no verified TOTP factor for super_admin account');
  }

  const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({ factorId: totpFactor.id });
  if (challengeError || !challenge) {
    throw new AuthError('mfa_invalid_code', challengeError?.message ?? 'challenge failed');
  }

  const { data: verifyData, error: verifyError } = await client.auth.mfa.verify({
    factorId: totpFactor.id,
    challengeId: challenge.id,
    code,
  });
  if (verifyError || !verifyData) {
    throw new AuthError('mfa_invalid_code', verifyError?.message ?? 'invalid code');
  }

  return resolveAfterCredentials(pending.userId, 'aal2');
}

export async function selectSchool(
  pendingUserId: string,
  pendingAal: 'aal1' | 'aal2',
  membershipId: string
): Promise<LoginOutcome> {
  const membership = await fetchOwnedActiveMembership(pendingUserId, membershipId);
  if (!membership) {
    throw new AuthError('membership_invalid', 'membership does not exist, is not active, or does not belong to this user');
  }
  const live = await fetchLiveUser(pendingUserId);
  const minted = await mintSession(pendingUserId, membership.role, membership.schoolId, membership.membershipId, live.token_version, pendingAal);
  return { status: 'ok', ...minted };
}

// Re-runs the same resolution as selectSchool, then revokes the session
// being switched away from -- the client's cookies are being replaced
// either way, and there's no legitimate reason for the old refresh
// token to keep working once a newer one for the same user exists.
export async function switchSchool(current: SessionClaims, membershipId: string): Promise<LoginOutcome> {
  const outcome = await selectSchool(current.sub, current.aal, membershipId);
  await withBackendConnection((client) =>
    client.query(`update sessions set revoked_at = now() where session_id = $1`, [current.sessionId])
  );
  return outcome;
}

export { fetchLiveUser, fetchActiveMemberships, fetchOwnedActiveMembership, mintSession, resolveAfterCredentials };
