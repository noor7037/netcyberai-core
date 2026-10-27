import { signFamilyToken, verifyFamilyToken } from '@/lib/auth/jwt';

// The Family app's own session (docs/family-app/03 §3, M1-2, C248): its own claims type and cookies, never a staff
// session. Edge-safe (jose only, no database): the middleware checks the signature here; every database request then
// checks token_version live (withFamilyContext), so signing out everywhere or deleting the account ends it at once.
//
// Cookies, all httpOnly:
//   ncf_session  the family's session. The app opens in child mode: most pilot children use a parent's phone.
//                "Keep me signed in" (F1-1, C257; on by default, always in the Android app): it renews itself while
//                used and ends after 180 days without use; switched off, the cookie ends when the browser closes and the
//                session after 12 hours without use. Sign-out, a PIN change and "sign out everywhere" end it at once.
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

export const FAMILY_SESSION_TTL_SECONDS = 180 * 24 * 60 * 60;
export const FAMILY_SESSION_SHORT_TTL_SECONDS = 12 * 60 * 60;
// A session is renewed (a new token, the same session) at most this often while it is used: daily when kept, hourly
// when not (its token lasts 12 hours).
export function familyRenewAfterSeconds(keep: boolean | undefined): number {
  return keep === false ? 60 * 60 : 24 * 60 * 60;
}
export const FAMILY_PARENT_TTL_SECONDS = 10 * 60;
export const FAMILY_CODE_TTL_SECONDS = 10 * 60;

// `keep`: "Keep me signed in" (absent on tokens from before F1-1: kept). `issuedAt`: when this token was signed (seconds).
// `device`: a child's own phone (M2b-2, C342; docs/34 §9.4), linked by the parent's one-time code: the session reaches that
// one child only (the database's own rules, src/lib/auth/db.ts), never parent mode, and ends when the parent removes it.
export type FamilySession = { accountId: string; tokenVersion: number; sessionId: string; keep?: boolean; issuedAt?: number; device?: { deviceId: string; childId: string } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function familyCookieOptions(maxAgeSeconds: number) {
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: maxAgeSeconds };
}

export async function signFamilySession(s: FamilySession): Promise<string> {
  const keep = s.keep !== false;
  const claims: Record<string, string | number> = { tv: s.tokenVersion, sid: s.sessionId, kp: keep ? 1 : 0 };
  if (s.device) Object.assign(claims, { dv: s.device.deviceId, ch: s.device.childId });
  return signFamilyToken('family', s.accountId, claims, keep ? FAMILY_SESSION_TTL_SECONDS : FAMILY_SESSION_SHORT_TTL_SECONDS);
}

// The session cookie: kept, it lasts as long as its token; not kept, it has no max-age and ends with the browser.
export async function setFamilySessionCookie(res: { cookies: { set: (name: string, value: string, options: object) => unknown } }, s: FamilySession): Promise<void> {
  const keep = s.keep !== false;
  const options = familyCookieOptions(keep ? FAMILY_SESSION_TTL_SECONDS : FAMILY_SESSION_SHORT_TTL_SECONDS);
  const { maxAge, ...sessionOnly } = options;
  res.cookies.set(FAMILY_SESSION_COOKIE, await signFamilySession(s), keep ? { ...sessionOnly, maxAge } : sessionOnly);
}

// The installed Android app (M1-8) reports itself in its user agent; it always keeps the family signed in.
export function isFamilyShell(userAgent: string | null | undefined): boolean {
  return /NetCyberAIFamily\/\d+/.test(userAgent ?? '');
}

export async function verifyFamilySession(token: string | undefined): Promise<FamilySession | null> {
  if (!token) return null;
  const v = await verifyFamilyToken(token, 'family');
  if (!v || !UUID.test(v.sub) || typeof v.claims.sid !== 'string' || !Number.isInteger(v.claims.tv)) return null;
  // A child's phone carries both its device and its child; a token with only one of them is no session.
  const dv = v.claims.dv;
  const ch = v.claims.ch;
  if ((dv === undefined) !== (ch === undefined)) return null;
  if (dv !== undefined && (typeof dv !== 'string' || typeof ch !== 'string' || !UUID.test(dv) || !UUID.test(ch))) return null;
  return {
    accountId: v.sub,
    tokenVersion: Number(v.claims.tv),
    sessionId: v.claims.sid,
    keep: v.claims.kp !== 0,
    issuedAt: Number(v.claims.iat) || undefined,
    ...(typeof dv === 'string' && typeof ch === 'string' ? { device: { deviceId: dv, childId: ch } } : {}),
  };
}

// Parent mode: only for the session that entered the PIN, and never on a child's own phone (the parent's things are on
// the parent's phone, C342).
export async function signParentMode(s: FamilySession): Promise<string> {
  if (s.device) throw new Error('no parent mode on a child’s phone');
  return signFamilyToken('family_parent', s.accountId, { sid: s.sessionId }, FAMILY_PARENT_TTL_SECONDS);
}

export async function verifyParentMode(token: string | undefined, s: FamilySession): Promise<boolean> {
  if (!token || s.device) return false;
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
