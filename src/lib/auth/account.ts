import type { SupabaseClient } from '@supabase/supabase-js';
import { newAuthClient } from './supabase';
import { bumpTokenVersion, emailForPhone, withBackendConnection, withSelfContext } from './db';
import { fetchLiveUser, resolveAfterCredentials, type AuthenticatorContext } from './resolve';
import { signPendingToken, verifyDeviceToken, verifyPendingToken } from './jwt';
import { EMAIL_STEP_TTL_SECONDS } from './cookies';
import { AuthError } from './errors';
import type { LoginOutcome } from './types';
import { emailProofFromAccessToken, emailProofFromAmr, rememberedDeviceSkipsEmailStep } from './authenticator-rules';

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

// Indian mobile numbers (C90): 10 digits, optionally written with +91, 91
// or a leading 0, and any spaces or dashes. Returns the 10 digits.
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let digits = raw.replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(digits)) return null;
  digits = digits.replace(/^\+/, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

// Email or mobile number -> the account's email. A mobile number resolves
// only when exactly one active account has it.
export async function resolveIdentifier(raw: unknown): Promise<string | null> {
  if (typeof raw !== 'string') return null;
  if (raw.includes('@')) return normalizeEmail(raw);
  const phone = normalizePhone(raw);
  return phone ? emailForPhone(phone) : null;
}

export function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  const shown = name.length <= 2 ? name[0] : `${name[0]}${'*'.repeat(Math.min(6, name.length - 2))}${name[name.length - 1]}`;
  return `${shown}@${domain}`;
}

// Email code after the password (C90): on unless AUTH_EMAIL_STEP=off, the
// switch for when email cannot be delivered (for example before custom SMTP
// is set up) or for automated tests.
export function emailStepEnabled(): boolean {
  return process.env.AUTH_EMAIL_STEP !== 'off';
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
  return !!err && (err.status === 429 || /rate limit|too many|only request this after/i.test(err.message ?? ''));
}

// Supabase answers two different "slow down"s (C91): the per-address wait
// between emails ("you can only request this after 42 seconds"), and the
// project's hourly email cap (over_email_send_rate_limit), which with the
// built-in email service is only a few messages an hour for the whole site.
function throwIfRateLimited(err: SupabaseAuthError): void {
  if (!isRateLimit(err)) return;
  const wait = /after (\d+) second/i.exec(err?.message ?? '');
  if (wait) throw new AuthError('rate_limited', err?.message ?? 'rate limited', Number(wait[1]));
  if (err?.code === 'over_email_send_rate_limit' || /email rate limit/i.test(err?.message ?? '')) {
    throw new AuthError('email_limit', err?.message ?? 'email limit reached');
  }
  throw new AuthError('rate_limited', err?.message ?? 'rate limited', 60);
}

function needsSecondFactor(err: SupabaseAuthError): boolean {
  return !!err && (err.code === 'insufficient_aal' || /aal2|assurance level/i.test(err.message ?? ''));
}

export async function passTotp(client: SupabaseClient, code: string): Promise<void> {
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

// `redirectTo` is where the email's link lands (C91): the login page, which
// finishes the sign-in or password change from the link itself, so an email
// works whether its template shows the code, the link, or both.
export async function requestEmailCode(email: string, purpose: CodePurpose, redirectTo?: string): Promise<void> {
  const client = newAuthClient();
  const { error } =
    purpose === 'login'
      ? await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } })
      : await client.auth.resetPasswordForEmail(email, { redirectTo });
  throwIfRateLimited(error);
  // The email service itself failing (a 5xx: wrong SMTP login, provider
  // down) is reported, so nobody waits for an email that was never sent.
  // Supabase only reaches the sending step for a registered address, so this
  // reveals an account's existence only while email is broken (C92).
  if (error && (error.status ?? 0) >= 500) throw new AuthError('email_send_failed', error.message ?? 'email not sent');
  // Any other error (most often "no such account") is deliberately not
  // reported: the answer must not reveal whether an email is registered.
}

export type SignedIn = { outcome: LoginOutcome; userId: string };

// C95: whether the account has a confirmed authenticator, and whether this
// session came from an emailed code or link. nextLevel (from the session
// Supabase just issued) is aal2 exactly when an authenticator exists; "none"
// is confirmed with Supabase before it is believed, because it can send a
// platform admin into enrolment. Unknown (undefined) keeps the pre-C95
// behaviour.
async function authenticatorContext(
  client: SupabaseClient,
  aalData: { nextLevel: string | null; currentAuthenticationMethods: unknown } | null,
  passwordProven: boolean
): Promise<AuthenticatorContext | undefined> {
  if (!aalData) return undefined;
  const emailProven = !!emailProofFromAmr(aalData.currentAuthenticationMethods);
  if (aalData.nextLevel === 'aal2') return { hasVerified: true, emailProven, passwordProven };
  const { data, error } = await client.auth.mfa.listFactors();
  if (error || !data) return undefined;
  return { hasVerified: data.totp.length > 0, emailProven, passwordProven };
}

// `passwordProven`: the account's password was checked earlier in this same
// sign-in (passwordLogin, then completeEmailStep). A platform admin may enrol
// an authenticator only when that and the email are both proven (C95).
async function signInFromClient(
  client: SupabaseClient,
  userId: string,
  session: { access_token: string; refresh_token: string },
  passwordProven = false
): Promise<SignedIn> {
  const { data: aalData } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  const aal = (aalData?.currentLevel ?? 'aal1') as 'aal1' | 'aal2';
  const authenticator = aal === 'aal2' ? undefined : await authenticatorContext(client, aalData, passwordProven);
  const outcome = await resolveAfterCredentials(
    userId,
    aal,
    { sbAccessToken: session.access_token, sbRefreshToken: session.refresh_token },
    authenticator
  );
  return { outcome, userId };
}

export async function loginWithEmailCode(email: string, code: string): Promise<SignedIn> {
  const client = newAuthClient();
  const { data, error } = await client.auth.verifyOtp({ email, token: code, type: 'email' });
  if (error || !data.session || !data.user) throw new AuthError('code_invalid', error?.message ?? 'code rejected');
  return signInFromClient(client, data.user.id, data.session);
}

// ---- password sign-in with the email-code step (C90) -------------------------

async function sendSignInCode(email: string, redirectTo?: string): Promise<void> {
  const { error } = await newAuthClient().auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } });
  if (!error) return;
  throwIfRateLimited(error);
  // The password was already right, so saying the email failed reveals nothing.
  throw new AuthError('email_send_failed', error.message ?? 'email not sent');
}

async function deviceTrusted(deviceToken: string | undefined, userId: string): Promise<boolean> {
  if (!deviceToken) return false;
  const device = await verifyDeviceToken(deviceToken);
  if (!device || device.userId !== userId) return false;
  const live = await fetchLiveUser(userId);
  return Number(live.token_version) === device.tokenVersion;
}

// A remembered device skips the email step, except for platform admins, who
// get it at every password sign-in (C95, deliberate): their accounts reach
// every school, and enrolling an authenticator needs that email proof.
async function deviceSkipsEmailStep(deviceToken: string | undefined, userId: string): Promise<boolean> {
  if (!(await deviceTrusted(deviceToken, userId))) return false;
  return rememberedDeviceSkipsEmailStep((await fetchLiveUser(userId)).role);
}

export async function passwordLogin(identifier: string, password: string, deviceToken?: string, redirectTo?: string): Promise<LoginOutcome> {
  const email = await resolveIdentifier(identifier);
  if (!email) throw new AuthError('invalid_credentials', 'no account for that email or mobile number');
  const client = newAuthClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) throw new AuthError('invalid_credentials', error?.message ?? 'sign-in failed');

  if (emailStepEnabled() && !(await deviceSkipsEmailStep(deviceToken, data.user.id))) {
    await sendSignInCode(email, redirectTo);
    const pendingToken = await signPendingToken({ userId: data.user.id, purpose: 'email_step', aal: 'aal1' }, EMAIL_STEP_TTL_SECONDS);
    return { status: 'email_step', pendingToken, maskedEmail: maskEmail(email) };
  }
  return (await signInFromClient(client, data.user.id, data.session, true)).outcome;
}

async function pendingEmailStep(pendingToken: string | undefined): Promise<{ userId: string; email: string }> {
  const pending = pendingToken ? await verifyPendingToken(pendingToken) : null;
  if (!pending || pending.purpose !== 'email_step') throw new AuthError('pending_token_invalid', 'no pending email step');
  const email = await accountEmail(pending.userId);
  if (!email) throw new AuthError('pending_token_invalid', 'account has no email');
  return { userId: pending.userId, email };
}

export async function resendEmailStep(pendingToken: string | undefined, redirectTo?: string): Promise<void> {
  const { email } = await pendingEmailStep(pendingToken);
  await sendSignInCode(email, redirectTo);
}

export async function completeEmailStep(pendingToken: string | undefined, code: string): Promise<SignedIn> {
  const { userId, email } = await pendingEmailStep(pendingToken);
  const client = newAuthClient();
  const { data, error } = await client.auth.verifyOtp({ email, token: code, type: 'email' });
  if (error || !data.session || !data.user) throw new AuthError('code_invalid', error?.message ?? 'code rejected');
  // The code must belong to the account whose password was just checked.
  if (data.user.id !== userId) throw new AuthError('code_invalid', 'code belongs to another account');
  // The pending token proves passwordLogin checked the password first.
  return signInFromClient(client, userId, data.session, true);
}

// Signs the user out everywhere: every session, every access token on its
// next request, every remembered device.
export async function signOutEverywhere(userId: string): Promise<number> {
  await bumpTokenVersion(userId);
  return revokeAllSessions(userId);
}

export type ResetOutcome = { status: 'signed_in'; signedIn: SignedIn } | { status: 'mfa_required'; pendingToken: string };

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
  // Proving the email and choosing a new password signs the person in here;
  // everywhere else they are signed out.
  await signOutEverywhere(data.user.id);
  // After an authenticator check the client holds a newer (aal2) session.
  const { data: fresh } = await client.auth.getSession();
  return { status: 'signed_in', signedIn: await signInFromClient(client, data.user.id, fresh.session ?? data.session) };
}

export async function continueResetWithMfa(pendingToken: string, newPassword: string, mfaCode?: string): Promise<SignedIn> {
  const pending = await verifyPendingToken(pendingToken);
  if (!pending || pending.purpose !== 'reset' || !pending.sbAccessToken || !pending.sbRefreshToken) {
    throw new AuthError('pending_token_invalid', 'no pending reset for this token');
  }
  const client = newAuthClient();
  const { data, error } = await client.auth.setSession({ access_token: pending.sbAccessToken, refresh_token: pending.sbRefreshToken });
  if (error || !data.user?.email) throw new AuthError('pending_token_invalid', error?.message ?? 'reset session expired');
  if (await hasVerifiedTotp(client)) {
    if (!mfaCode) throw new AuthError('mfa_required', 'authenticator code required');
    await passTotp(client, mfaCode);
  }
  await setPassword(client, newPassword);
  await signOutEverywhere(pending.userId);
  const { data: fresh } = await client.auth.getSession();
  if (!fresh.session) throw new AuthError('pending_token_invalid', 'reset session expired');
  return signInFromClient(client, pending.userId, fresh.session);
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

// ---- sign-in and reset links from the email (C91) -----------------------------

// Methods Supabase records for a session created by an emailed code or link.
// A password session is refused here: it must go through passwordLogin, so
// the email-code step cannot be skipped by calling Supabase directly.
// The list of such methods lives in authenticator-rules.ts (EMAIL_PROOF_METHODS).
const LINK_MAX_AGE_SECONDS = 15 * 60;

export type LinkResult = { status: 'signed_in'; signedIn: SignedIn } | { status: 'set_password'; pendingToken: string };

// Finishes what an emailed link started. Supabase has already checked the
// link and handed its session to the login page; the session is checked
// again here with Supabase before anything is trusted.
export type LinkKind = 'magiclink' | 'recovery' | 'invite' | 'email';
const SET_PASSWORD_KINDS = new Set(['recovery', 'invite']);

export async function completeEmailLink(accessToken: string, refreshToken: string, kind?: string): Promise<LinkResult> {
  const client = newAuthClient();
  // A malformed token makes supabase-js throw rather than return an error.
  const { data, error } = await client.auth
    .setSession({ access_token: accessToken, refresh_token: refreshToken })
    .catch((e: unknown) => ({ data: { session: null, user: null }, error: { message: String(e) } }));
  if (error || !data.session || !data.user) throw new AuthError('link_invalid', error?.message ?? 'link session rejected');
  const { data: checked, error: userError } = await client.auth.getUser(data.session.access_token);
  if (userError || checked.user?.id !== data.user.id) throw new AuthError('link_invalid', userError?.message ?? 'user mismatch');
  return finishLinkSession(client, data.user.id, data.session, kind);
}

// Our own link format, /login?th=<token hash>&type=<kind> (C91): verified here
// on the server, so it works whatever Supabase's Site URL setting says. Used by
// the founder console's shareable links, and by email templates that point
// straight at the login page.
export async function completeTokenHash(tokenHash: string, kind: LinkKind): Promise<LinkResult> {
  const client = newAuthClient();
  const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: kind });
  if (error || !data.session || !data.user) throw new AuthError('link_invalid', error?.message ?? 'link rejected');
  return finishLinkSession(client, data.user.id, data.session, kind);
}

async function finishLinkSession(
  client: SupabaseClient,
  userId: string,
  session: { access_token: string; refresh_token: string },
  kind?: string
): Promise<LinkResult> {
  const proof = emailProofFromAccessToken(session.access_token);
  if (!proof || Date.now() / 1000 - proof.at > LINK_MAX_AGE_SECONDS) throw new AuthError('link_invalid', 'not an email link session');
  const data = { user: { id: userId }, session };

  if (proof.method === 'recovery' || (kind && SET_PASSWORD_KINDS.has(kind))) {
    const pendingToken = await signPendingToken(
      {
        userId: data.user.id,
        purpose: 'reset',
        aal: 'aal1',
        sbAccessToken: data.session.access_token,
        sbRefreshToken: data.session.refresh_token,
      },
      EMAIL_STEP_TTL_SECONDS
    );
    return { status: 'set_password', pendingToken };
  }
  return { status: 'signed_in', signedIn: await signInFromClient(client, userId, session) };
}
