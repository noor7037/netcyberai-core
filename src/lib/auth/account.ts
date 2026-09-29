import type { SupabaseClient } from '@supabase/supabase-js';
import { newAuthClient } from './supabase';
import { withBackendConnection, withSelfContext } from './db';
import { resolveAfterCredentials } from './resolve';
import { signPendingToken, verifyPendingToken } from './jwt';
import { AuthError } from './errors';
import type { LoginOutcome } from './types';

// Account recovery and email codes (founder request 2026-09-29, Decision
// Log C89): sign in with a one-time code sent to the account's email,
// set or reset a password with an emailed code, change a password while
// signed in, and let admins send a reset code to someone else.
//
// Supabase Auth stays the only credential oracle (see supabase.ts): it
// generates, emails, rate-limits and verifies the codes. This module never
// sees a code it did not receive from the person typing it, never stores
// a password, and hands every successful sign-in to the same
// resolveAfterCredentials path as password login, so MFA for super_admin
// and school selection behave identically.
//
// Anti-enumeration: requesting a code answers the same way whether or not
// the email has an account. Nobody can create an account through these
// routes (shouldCreateUser: false); accounts come only from invites.

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // bcrypt's input limit in Supabase Auth

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.replace(/\s+/g, '');
  return /^\d{6,10}$/.test(code) ? code : null;
}

// Returns a reason the password is unacceptable, or null when it is fine.
// Supabase Auth applies its own policy on top (and the leaked-password
// check once it is switched on in the dashboard).
export function passwordProblem(raw: unknown): string | null {
  if (typeof raw !== 'string') return 'missing';
  if (raw.length < PASSWORD_MIN) return 'too_short';
  if (raw.length > PASSWORD_MAX) return 'too_long';
  if (raw.trim() !== raw) return 'edge_spaces';
  return null;
}

type SupabaseAuthError = { message?: string; status?: number; code?: string } | null;

function isRateLimit(err: SupabaseAuthError): boolean {
  return !!err && (err.status === 429 || /rate limit|too many/i.test(err.message ?? ''));
}

function needsSecondFactor(err: SupabaseAuthError): boolean {
  return !!err && (err.code === 'insufficient_aal' || /aal2|assurance level/i.test(err.message ?? ''));
}

async function passTotp(client: SupabaseClient, code: string): Promise<void> {
  const { data: factors } = await client.auth.mfa.listFactors();
  const totp = factors?.totp?.find((f) => f.status === 'verified');
  if (!totp) throw new AuthError('mfa_not_enrolled', 'no verified TOTP factor');
  const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({ factorId: totp.id });
  if (challengeError || !challenge) throw new AuthError('mfa_invalid_code', challengeError?.message ?? 'challenge failed');
  const { error } = await client.auth.mfa.verify({ factorId: totp.id, challengeId: challenge.id, code });
  if (error) throw new AuthError('mfa_invalid_code', error.message);
}

async function hasVerifiedTotp(client: SupabaseClient): Promise<boolean> {
  const { data } = await client.auth.mfa.listFactors();
  return !!data?.totp?.some((f) => f.status === 'verified');
}

async function setPassword(client: SupabaseClient, newPassword: string): Promise<void> {
  const { error } = await client.auth.updateUser({ password: newPassword });
  if (!error) return;
  if (needsSecondFactor(error)) throw new AuthError('mfa_required', error.message ?? 'second factor required');
  throw new AuthError('password_rejected', error.message ?? 'password rejected');
}

// Every refresh token of the user stops working. Access tokens already
// issued expire on their own within their 15-minute lifetime.
export async function revokeAllSessions(userId: string, keepSessionId?: string): Promise<number> {
  return withBackendConnection(async (client) => {
    const { rowCount } = await client.query(
      `update sessions set revoked_at = now()
       where user_id = $1 and revoked_at is null and ($2::uuid is null or session_id <> $2::uuid)`,
      [userId, keepSessionId ?? null]
    );
    return rowCount ?? 0;
  });
}

// ---- email codes -----------------------------------------------------------

export type CodePurpose = 'login' | 'reset';

export async function requestEmailCode(email: string, purpose: CodePurpose): Promise<void> {
  const client = newAuthClient();
  const { error } =
    purpose === 'login'
      ? await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
      : await client.auth.resetPasswordForEmail(email);
  if (isRateLimit(error)) throw new AuthError('rate_limited', error?.message ?? 'rate limited');
  // Any other error (most often "no such account") is deliberately not
  // reported: the answer must not reveal whether an email is registered.
}

export async function loginWithEmailCode(email: string, code: string): Promise<LoginOutcome> {
  const client = newAuthClient();
  const { data, error } = await client.auth.verifyOtp({ email, token: code, type: 'email' });
  if (error || !data.session || !data.user) throw new AuthError('code_invalid', error?.message ?? 'code rejected');
  const { data: aalData } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  const aal = (aalData?.currentLevel ?? 'aal1') as 'aal1' | 'aal2';
  return resolveAfterCredentials(data.user.id, aal, {
    sbAccessToken: data.session.access_token,
    sbRefreshToken: data.session.refresh_token,
  });
}

export type ResetOutcome = { status: 'password_updated'; email: string } | { status: 'mfa_required'; pendingToken: string };

// Verifies the emailed recovery code, then sets the new password. For an
// account with an authenticator, Supabase only changes the password after
// the second factor too: if no authenticator code came with the request,
// the verified (single-use) recovery step is parked in a short-lived
// pending token, and continueResetWithMfa finishes it.
export async function resetPasswordWithCode(email: string, code: string, newPassword: string, mfaCode?: string): Promise<ResetOutcome> {
  const client = newAuthClient();
  const { data, error } = await client.auth.verifyOtp({ email, token: code, type: 'recovery' });
  if (error || !data.session || !data.user) throw new AuthError('code_invalid', error?.message ?? 'code rejected');

  if (await hasVerifiedTotp(client)) {
    if (!mfaCode) {
      const pendingToken = await signPendingToken({
        userId: data.user.id,
        purpose: 'reset',
        aal: 'aal1',
        sbAccessToken: data.session.access_token,
        sbRefreshToken: data.session.refresh_token,
      });
      return { status: 'mfa_required', pendingToken };
    }
    await passTotp(client, mfaCode);
  }
  await setPassword(client, newPassword);
  await revokeAllSessions(data.user.id);
  return { status: 'password_updated', email };
}

export async function continueResetWithMfa(pendingToken: string, newPassword: string, mfaCode: string): Promise<{ status: 'password_updated'; email: string }> {
  const pending = await verifyPendingToken(pendingToken);
  if (!pending || pending.purpose !== 'reset' || !pending.sbAccessToken || !pending.sbRefreshToken) {
    throw new AuthError('pending_token_invalid', 'no pending reset for this token');
  }
  const client = newAuthClient();
  const { data, error } = await client.auth.setSession({ access_token: pending.sbAccessToken, refresh_token: pending.sbRefreshToken });
  if (error || !data.user?.email) throw new AuthError('pending_token_invalid', error?.message ?? 'reset session expired');
  await passTotp(client, mfaCode);
  await setPassword(client, newPassword);
  await revokeAllSessions(pending.userId);
  return { status: 'password_updated', email: data.user.email };
}

// ---- signed-in password change ----------------------------------------------

export async function accountEmail(userId: string): Promise<string | null> {
  return withSelfContext(userId, async (client) => {
    const { rows } = await client.query(`select email from users where user_id = $1`, [userId]);
    return (rows[0]?.email as string | undefined) ?? null;
  });
}

export async function changePassword(
  userId: string,
  sessionId: string,
  currentPassword: string,
  newPassword: string,
  mfaCode?: string
): Promise<void> {
  const email = await accountEmail(userId);
  if (!email) throw new AuthError('invalid_credentials', 'account has no email');
  const client = newAuthClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password: currentPassword });
  // The identity that proved the password must be the signed-in user.
  if (error || !data.user || data.user.id !== userId) throw new AuthError('invalid_credentials', error?.message ?? 'current password wrong');
  if (await hasVerifiedTotp(client)) {
    if (!mfaCode) throw new AuthError('mfa_required', 'authenticator code required');
    await passTotp(client, mfaCode);
  }
  await setPassword(client, newPassword);
  // Other devices are signed out; this one stays signed in.
  await revokeAllSessions(userId, sessionId);
}
