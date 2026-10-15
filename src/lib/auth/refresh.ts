import { withBackendConnection, withSelfContext } from './db';
import { signAccessToken } from './jwt';
import { newRefreshToken, hashToken } from './hash';
import type { SessionClaims, SessionRole } from './types';

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface SessionRow {
  session_id: string;
  user_id: string;
  selected_school_id: string | null;
  token_version_snapshot: number;
  aal: 'aal1' | 'aal2';
}

export type RefreshResult =
  | { ok: true; accessToken: string; refreshToken: string; claims: SessionClaims }
  | { ok: false; reason: 'not_found' | 'expired' | 'token_version_changed' | 'account_disabled' | 'membership_revoked' };

// This is the ONE place is_active-on-membership revocation gets checked
// (see the B2 report's revocation-timing section for the measured
// worst-case delay this implies -- bounded by the access token's
// remaining lifetime at the moment revocation happens, NOT by this
// function's own speed). token_version is checked here too, but ALSO
// on every DB-touching request via withTenantContext -- that's the
// "immediate" guarantee; this is the "at every refresh" one.
export async function refreshSession(refreshTokenPlaintext: string): Promise<RefreshResult> {
  const hash = hashToken(refreshTokenPlaintext);

  const row = await withBackendConnection(async (client) => {
    const { rows } = await client.query(
      `select session_id, user_id, selected_school_id, token_version_snapshot, aal
       from sessions
       where refresh_token_hash = $1 and revoked_at is null and expires_at > now()`,
      [hash]
    );
    return (rows[0] as SessionRow | undefined) ?? null;
  });
  if (!row) return { ok: false, reason: 'not_found' };

  const revoke = () =>
    withBackendConnection((client) =>
      client.query(`update sessions set revoked_at = now() where session_id = $1`, [row.session_id])
    );

  const live = await withSelfContext(row.user_id, async (client) => {
    const { rows } = await client.query(`select role, token_version, is_active from users where user_id = $1`, [
      row.user_id,
    ]);
    return rows[0] as { role: string; token_version: number; is_active: boolean } | undefined;
  });
  if (!live) {
    await revoke();
    return { ok: false, reason: 'not_found' };
  }
  if (Number(live.token_version) !== row.token_version_snapshot) {
    await revoke();
    return { ok: false, reason: 'token_version_changed' };
  }
  if (!live.is_active) {
    await revoke();
    return { ok: false, reason: 'account_disabled' };
  }

  let role: SessionRole;
  let schoolId: string | null;
  let membershipId: string | null;

  if (row.selected_school_id === null) {
    if (live.role !== 'super_admin') {
      await revoke();
      return { ok: false, reason: 'membership_revoked' };
    }
    role = 'super_admin';
    schoolId = null;
    membershipId = null;
  } else {
    const membership = await withSelfContext(row.user_id, async (client) => {
      const { rows } = await client.query(
        `select membership_id, role, is_active from memberships where user_id = $1 and school_id = $2`,
        [row.user_id, row.selected_school_id]
      );
      return rows[0] as { membership_id: string; role: string; is_active: boolean } | undefined;
    });
    if (!membership || !membership.is_active) {
      await revoke();
      return { ok: false, reason: 'membership_revoked' };
    }
    role = membership.role as SessionRole;
    schoolId = row.selected_school_id;
    membershipId = membership.membership_id;
  }

  const newRefresh = newRefreshToken();
  const newHash = hashToken(newRefresh);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  const newSessionId = await withBackendConnection(async (client) => {
    await client.query(`update sessions set revoked_at = now() where session_id = $1`, [row.session_id]);
    const { rows } = await client.query(
      `insert into sessions (user_id, refresh_token_hash, selected_school_id, token_version_snapshot, aal, expires_at)
       values ($1, $2, $3, $4, $5, $6)
       returning session_id`,
      [row.user_id, newHash, schoolId, live.token_version, row.aal, expiresAt]
    );
    return rows[0].session_id as string;
  });

  const claims: SessionClaims = {
    sub: row.user_id,
    role,
    schoolId,
    membershipId,
    tokenVersion: live.token_version,
    aal: row.aal,
    sessionId: newSessionId,
  };
  const accessToken = await signAccessToken(claims);
  return { ok: true, accessToken, refreshToken: newRefresh, claims };
}
