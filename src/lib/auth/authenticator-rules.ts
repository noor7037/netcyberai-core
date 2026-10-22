import type { StaffRole } from './types';

// The rules of authenticator apps (TOTP), kept free of I/O so they are
// unit-tested (Decision Log C95). The Supabase calls live in
// authenticator.ts; this file only decides.
//
// Policy (C93, C95): a platform admin (super_admin) must have one; principals
// and school admins may add one; anyone who has one is asked for its code at
// every sign-in. Nobody is ever handed a QR code or secret by someone else:
// enrolment happens on the person's own screen, after they have proven who
// they are.

// Sign-in methods Supabase records on a session created by an emailed code
// or link (the amr claim). A password alone is not email proof.
export const EMAIL_PROOF_METHODS: ReadonlySet<string> = new Set(['otp', 'magiclink', 'recovery', 'invite', 'email/signup']);

export type AmrEntry = { method?: string; timestamp?: number };

export function emailProofFromAmr(amr: unknown): { method: string; at: number } | null {
  if (!Array.isArray(amr)) return null;
  const hit = (amr as AmrEntry[]).find((a) => a && typeof a.method === 'string' && EMAIL_PROOF_METHODS.has(a.method));
  return hit?.method && typeof hit.timestamp === 'number' ? { method: hit.method, at: hit.timestamp } : null;
}

// The amr claim of a Supabase access token, read without verifying the
// signature: callers only use it on a token Supabase has just issued or
// re-validated in the same request.
export function emailProofFromAccessToken(accessToken: string): { method: string; at: number } | null {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'));
    return emailProofFromAmr(payload?.amr);
  } catch {
    return null;
  }
}

export const AUTHENTICATOR_REQUIRED_ROLES: readonly StaffRole[] = ['super_admin'];
export const AUTHENTICATOR_OPTIONAL_ROLES: readonly StaffRole[] = ['principal', 'school_admin'];

export function authenticatorRequired(role: string): boolean {
  return (AUTHENTICATOR_REQUIRED_ROLES as readonly string[]).includes(role);
}

// Who may set up or replace their own authenticator on the account page.
export function canManageOwnAuthenticator(role: string): boolean {
  return authenticatorRequired(role) || (AUTHENTICATOR_OPTIONAL_ROLES as readonly string[]).includes(role);
}

// Founder tools may remove anyone's authenticator except the caller's own:
// removing your own would let a stolen password and email skip the
// authenticator by enrolling a new one.
export function canRemoveAuthenticatorOf(actorUserId: string, targetUserId: string): boolean {
  return actorUserId !== targetUserId;
}

export type AuthenticatorStep = 'none' | 'verify' | 'setup' | 'not_enrolled';

// What sign-in asks for after the password or email step, before a session
// is issued. `verify` asks for the code; `setup` enrols one on this screen;
// `not_enrolled` is the dead end for a platform admin who did not prove both
// the password and the email in this sign-in (an emailed code or link alone,
// a password reset, or the email-code step switched off): enrolment needs
// both, so neither a stolen password nor a stolen mailbox alone can plant an
// authenticator (C95).
export function authenticatorStepAtSignIn(input: {
  role: string;
  aal: 'aal1' | 'aal2';
  hasVerifiedAuthenticator: boolean;
  emailProven: boolean;
  passwordProven: boolean;
}): AuthenticatorStep {
  if (input.aal === 'aal2') return 'none';
  if (input.hasVerifiedAuthenticator) return 'verify';
  if (!authenticatorRequired(input.role)) return 'none';
  return input.emailProven && input.passwordProven ? 'setup' : 'not_enrolled';
}

// A password reset by email alone (recovery code or link, invite). Refused
// for a platform admin with no authenticator: otherwise the mailbox alone
// would set the password and then pass "password + email" to enrol an
// authenticator (C95 security review). Their password is reset by another
// platform admin (founder tools) instead.
export function emailAloneMaySetPassword(role: string, hasVerifiedAuthenticator: boolean): boolean {
  return hasVerifiedAuthenticator || !authenticatorRequired(role);
}

// What follows a correct password (C96, F1-1 C257). An account with a
// confirmed authenticator goes straight to its code, never to an emailed
// code: two different 6-digit codes one screen apart got typed into the wrong
// box in production. Without an authenticator the emailed code is the second
// step. A trusted browser ("Trust this browser for 30 days") skips what it
// proved: one trusted after the authenticator skips the authenticator (and so
// the whole second step), for every role including a platform admin; one
// trusted after an emailed code skips the emailed code only, and never for a
// platform admin, who needs that email proof to enrol an authenticator (C95).
export type AfterPassword = 'authenticator' | 'email_code' | 'none';
export type DeviceProofKind = 'authenticator' | 'email' | null;
export function stepAfterPassword(input: {
  role: string;
  hasVerifiedAuthenticator: boolean;
  // What this browser proved when it was trusted; null when it is not trusted (src/lib/auth/devices.ts).
  deviceProof: DeviceProofKind;
  emailStepEnabled: boolean;
  // False for a username account (C230-D): its hidden address receives no mail, so it has no emailed step.
  emailReachable?: boolean;
}): AfterPassword {
  if (input.hasVerifiedAuthenticator) return input.deviceProof === 'authenticator' ? 'none' : 'authenticator';
  if (!input.emailStepEnabled) return 'none';
  if (input.emailReachable === false && !authenticatorRequired(input.role)) return 'none';
  if (authenticatorRequired(input.role)) return 'email_code';
  return input.deviceProof ? 'none' : 'email_code';
}

export type FactorSummary = { id: string; factor_type: string; status: string; created_at?: string };

// Enrolments started but never confirmed (the person closed the page): they
// are removed before a new one starts, so they never pile up.
export function unverifiedTotpIds(factors: readonly FactorSummary[]): string[] {
  return factors.filter((f) => f.factor_type === 'totp' && f.status !== 'verified').map((f) => f.id);
}

// Two setups started at the same moment (a double click, two tabs) each
// clean up before enrolling, so both could survive. After enrolling, every
// unconfirmed one older than (or as old as) the new one goes too, which
// leaves at most one: the newest.
export function staleUnverifiedTotpIds(factors: readonly FactorSummary[], newFactorId: string): string[] {
  const created = factors.find((f) => f.id === newFactorId)?.created_at;
  if (!created) return [];
  return factors
    .filter((f) => f.factor_type === 'totp' && f.status !== 'verified' && f.id !== newFactorId && !!f.created_at && f.created_at <= created)
    .map((f) => f.id);
}

// The authenticator sign-in asks for. Normally there is one; if a
// replacement's clean-up failed there are two, and the newest is the one the
// person just set up (the old one may be on a lost phone).
export function newestVerifiedTotp<T extends FactorSummary>(factors: readonly T[]): T | undefined {
  return factors
    .filter((f) => f.factor_type === 'totp' && f.status === 'verified')
    .reduce<T | undefined>((best, f) => (!best || (f.created_at ?? '') > (best.created_at ?? '') ? f : best), undefined);
}

// "Replace authenticator": after the new one is confirmed, every other
// authenticator of the account is removed.
export function factorIdsToRemoveAfterReplace(factors: readonly FactorSummary[], newFactorId: string): string[] {
  return factors.filter((f) => f.factor_type === 'totp' && f.id !== newFactorId).map((f) => f.id);
}

// The factor being confirmed must be one of the account's own, still
// unconfirmed, authenticator enrolments.
export function isPendingTotpFactor(factors: readonly FactorSummary[], factorId: unknown): factorId is string {
  return typeof factorId === 'string' && factors.some((f) => f.id === factorId && f.factor_type === 'totp' && f.status !== 'verified');
}

// Supabase requires a distinct name per enrolment of the same account; the
// time to the second keeps it distinct and tells the person which one it is.
export function authenticatorFriendlyName(at: Date): string {
  return `NetCyberAI ${at.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

// Supabase returns the QR code as `data:image/svg+xml;utf-8,<svg ...>` with
// the SVG unescaped. A `#` in it (a colour such as fill="#000000") starts a
// URL fragment and cuts the image short, so it is re-encoded (C95).
const RAW_SVG_PREFIX = 'data:image/svg+xml;utf-8,';
export function svgDataUrl(qrCode: string): string {
  const svg = qrCode.startsWith(RAW_SVG_PREFIX) ? qrCode.slice(RAW_SVG_PREFIX.length) : qrCode;
  return svg.trimStart().startsWith('<') ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : qrCode;
}

// The setup key shown for typing into an authenticator app by hand, in
// groups of four so it can be read out and checked.
export function formatSetupKey(secret: string): string {
  return (secret.replace(/\s+/g, '').toUpperCase().match(/.{1,4}/g) ?? []).join(' ');
}

export function normalizeTotpCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.replace(/\s+/g, '');
  return /^\d{6}$/.test(code) ? code : null;
}
