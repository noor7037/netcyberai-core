import type { SupabaseClient } from '@supabase/supabase-js';
import { newAuthClient } from './supabase';
import { signPendingToken, verifyPendingToken, type PendingPurpose } from './jwt';
import { AuthError } from './errors';
import { resolveAfterCredentials } from './resolve';
import { accountEmail, passTotp, revokeAllSessions } from './account';
import { AUTHENTICATOR_SETUP_TTL_SECONDS } from './cookies';
import {
  authenticatorFriendlyName,
  emailProofFromAccessToken,
  factorIdsToRemoveAfterReplace,
  formatSetupKey,
  isPendingTotpFactor,
  staleUnverifiedTotpIds,
  svgDataUrl,
  unverifiedTotpIds,
  type FactorSummary,
} from './authenticator-rules';
import type { LoginOutcome } from './types';

// Authenticator apps (TOTP) set up by the person themselves (Decision Log
// C95). Supabase Auth enrols, stores and checks the secret; this app only
// relays the QR code and setup key to the screen of the person who proved
// who they are, and never stores, logs or audits either. Two ways in:
//
// 1. During sign-in: a platform admin without an authenticator, whose email
//    was just proven, enrols one before a session is issued (instead of the
//    old mfa_not_enrolled dead end).
// 2. On the account page: principals and school admins may add one; anyone
//    with one may replace it (enrol the new one, confirm it, then the old
//    one is removed). Both need the current password; replacing needs the
//    current authenticator's code too.

export type Enrolment = { factorId: string; qrCode: string; setupKey: string; uri: string };

const ISSUER = 'NetCyberAI';

async function factorsOf(client: SupabaseClient): Promise<FactorSummary[]> {
  const { data, error } = await client.auth.mfa.listFactors();
  if (error || !data) throw new AuthError('mfa_enroll_failed', error?.message ?? 'could not read authenticators');
  return data.all.map((f) => ({ id: f.id, factor_type: f.factor_type, status: f.status, created_at: f.created_at }));
}

function hasVerifiedTotp(factors: FactorSummary[]): boolean {
  return factors.some((f) => f.factor_type === 'totp' && f.status === 'verified');
}

async function enrolTotp(client: SupabaseClient): Promise<Enrolment> {
  // A setup the person abandoned earlier is removed first.
  for (const id of unverifiedTotpIds(await factorsOf(client))) {
    await client.auth.mfa.unenroll({ factorId: id });
  }
  const { data, error } = await client.auth.mfa.enroll({
    factorType: 'totp',
    issuer: ISSUER,
    friendlyName: authenticatorFriendlyName(new Date()),
  });
  if (error || !data || data.type !== 'totp') throw new AuthError('mfa_enroll_failed', error?.message ?? 'enrolment not started');
  // A setup started at the same moment elsewhere (double click, second tab)
  // may have slipped past the clean-up above; the newest one wins.
  for (const id of staleUnverifiedTotpIds(await factorsOf(client), data.id)) {
    await client.auth.mfa.unenroll({ factorId: id });
  }
  return { factorId: data.id, qrCode: svgDataUrl(data.totp.qr_code), setupKey: formatSetupKey(data.totp.secret), uri: data.totp.uri };
}

// Confirms a started enrolment with its first code. After this the session
// held by `client` is at aal2.
async function confirmTotp(client: SupabaseClient, factorId: unknown, code: string): Promise<string> {
  if (!isPendingTotpFactor(await factorsOf(client), factorId)) {
    throw new AuthError('pending_token_invalid', 'not an authenticator setup of this account');
  }
  const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) throw new AuthError('mfa_invalid_code', error.message);
  return factorId;
}

// The Supabase session parked in a pending token, checked with Supabase
// again before it is used.
async function parkedSession(pendingToken: string | undefined, purpose: PendingPurpose) {
  const pending = pendingToken ? await verifyPendingToken(pendingToken) : null;
  if (!pending || pending.purpose !== purpose || !pending.sbAccessToken || !pending.sbRefreshToken) {
    throw new AuthError('pending_token_invalid', `no pending ${purpose} step`);
  }
  const client = newAuthClient();
  const { data, error } = await client.auth
    .setSession({ access_token: pending.sbAccessToken, refresh_token: pending.sbRefreshToken })
    .catch((e: unknown) => ({ data: { user: null }, error: { message: String(e) } }));
  if (error || data.user?.id !== pending.userId) throw new AuthError('pending_token_invalid', error?.message ?? 'session does not match');
  return { client, userId: pending.userId, sbAccessToken: pending.sbAccessToken };
}

// ---- 1. during sign-in ---------------------------------------------------------

export async function startSignInSetup(pendingToken: string | undefined): Promise<Enrolment> {
  const { client, sbAccessToken } = await parkedSession(pendingToken, 'mfa_setup');
  // Checked again here, not only when the step was offered.
  if (!emailProofFromAccessToken(sbAccessToken)) throw new AuthError('pending_token_invalid', 'email not proven in this sign-in');
  if (hasVerifiedTotp(await factorsOf(client))) throw new AuthError('mfa_already_enrolled', 'account already has an authenticator');
  return enrolTotp(client);
}

export async function finishSignInSetup(pendingToken: string | undefined, factorId: unknown, code: string): Promise<{ outcome: LoginOutcome; userId: string }> {
  const { client, userId } = await parkedSession(pendingToken, 'mfa_setup');
  await confirmTotp(client, factorId, code);
  return { outcome: await resolveAfterCredentials(userId, 'aal2'), userId };
}

// ---- 2. on the account page ------------------------------------------------------

export async function startAccountSetup(
  userId: string,
  currentPassword: string,
  mfaCode?: string
): Promise<{ enrolment: Enrolment; pendingToken: string; replacing: boolean }> {
  const email = await accountEmail(userId);
  if (!email) throw new AuthError('invalid_credentials', 'account has no email');
  const client = newAuthClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password: currentPassword });
  // The identity that proved the password must be the signed-in user.
  if (error || !data.session || data.user?.id !== userId) throw new AuthError('invalid_credentials', error?.message ?? 'current password wrong');

  const replacing = hasVerifiedTotp(await factorsOf(client));
  if (replacing) {
    if (!mfaCode) throw new AuthError('mfa_required', 'current authenticator code required');
    await passTotp(client, mfaCode);
  }
  const enrolment = await enrolTotp(client);
  // After the current authenticator's code the session is at aal2, which
  // Supabase needs to confirm a second authenticator and remove the old one.
  const { data: fresh } = await client.auth.getSession();
  const session = fresh.session ?? data.session;
  const pendingToken = await signPendingToken(
    {
      userId,
      purpose: 'authenticator',
      aal: replacing ? 'aal2' : 'aal1',
      sbAccessToken: session.access_token,
      sbRefreshToken: session.refresh_token,
    },
    AUTHENTICATOR_SETUP_TTL_SECONDS
  );
  return { enrolment, pendingToken, replacing };
}

export async function finishAccountSetup(
  userId: string,
  sessionId: string,
  pendingToken: string | undefined,
  factorId: unknown,
  code: string
): Promise<{ removedOld: number }> {
  const { client, userId: pendingUserId } = await parkedSession(pendingToken, 'authenticator');
  if (pendingUserId !== userId) throw new AuthError('pending_token_invalid', 'setup belongs to another account');
  const newFactorId = await confirmTotp(client, factorId, code);

  // Replace: the new one works, so every other authenticator goes.
  let removedOld = 0;
  for (const id of factorIdsToRemoveAfterReplace(await factorsOf(client), newFactorId)) {
    const { error } = await client.auth.mfa.unenroll({ factorId: id });
    if (error) throw new AuthError('mfa_enroll_failed', `new authenticator saved, old one not removed: ${error.message}`);
    removedOld += 1;
  }
  // Other devices are signed out after a replacement; this one stays in.
  if (removedOld > 0) await revokeAllSessions(userId, sessionId);
  return { removedOld };
}
