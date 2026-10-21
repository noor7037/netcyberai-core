import { signFamilyToken, verifyFamilyToken } from '@/lib/auth/jwt';

// The Family app's own session (docs/family-app/03 §3, M1-2, C248): its own claims type and cookies, never a staff
// session. Edge-safe (jose only, no database): the middleware checks the signature here; every database request then
// checks token_version live (withFamilyContext), so signing out everywhere or deleting the account ends it at once.
//
// Cookies, all httpOnly:
//   ncf_session  the family's session (30 days). The app opens in child mode: most pilot children use a parent's phone.
//   ncf_parent   parent mode, after the parent PIN (docs/34 §9.1 rule 1): 10 minutes, bound to the same session.
//   ncf_code     the email-code step: which email the code went to (10 minutes).
//   ncf_child    which child is using the app now (one tap to switch); checked against the account's own children.
//   ncf_lang     the parent's language choice, before and after sign-in.

export const FAMILY_SESSION_COOKIE = 'ncf_session';
export const FAMILY_PARENT_COOKIE = 'ncf_parent';
export const FAMILY_CODE_COOKIE = 'ncf_code';
export const FAMILY_CHILD_COOKIE = 'ncf_child';
// The language chosen before or after signing in (a preference, not a secret).
export const FAMILY_LANG_COOKIE = 'ncf_lang';

export const FAMILY_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
export const FAMILY_PARENT_TTL_SECONDS = 10 * 60;
export const FAMILY_CODE_TTL_SECONDS = 10 * 60;

export type FamilySession = { accountId: string; tokenVersion: number; sessionId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function familyCookieOptions(maxAgeSeconds: number) {
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: maxAgeSeconds };
}

export async function signFamilySession(s: FamilySession): Promise<string> {
  return signFamilyToken('family', s.accountId, { tv: s.tokenVersion, sid: s.sessionId }, FAMILY_SESSION_TTL_SECONDS);
}

export async function verifyFamilySession(token: string | undefined): Promise<FamilySession | null> {
  if (!token) return null;
  const v = await verifyFamilyToken(token, 'family');
  if (!v || !UUID.test(v.sub) || typeof v.claims.sid !== 'string' || !Number.isInteger(v.claims.tv)) return null;
  return { accountId: v.sub, tokenVersion: Number(v.claims.tv), sessionId: v.claims.sid };
}

// Parent mode: only for the session that entered the PIN.
export async function signParentMode(s: FamilySession): Promise<string> {
  return signFamilyToken('family_parent', s.accountId, { sid: s.sessionId }, FAMILY_PARENT_TTL_SECONDS);
}

export async function verifyParentMode(token: string | undefined, s: FamilySession): Promise<boolean> {
  if (!token) return false;
  const v = await verifyFamilyToken(token, 'family_parent');
  return !!v && v.sub === s.accountId && v.claims.sid === s.sessionId;
}

// The email-code step: the email travels in a signed, short-lived cookie, never in the address bar.
export async function signCodeStep(email: string): Promise<string> {
  return signFamilyToken('family_code', email, {}, FAMILY_CODE_TTL_SECONDS);
}

export async function verifyCodeStep(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const v = await verifyFamilyToken(token, 'family_code');
  return v ? v.sub : null;
}
