import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import { appSessionSecret } from './env';
import type { SessionClaims, StaffRole } from './types';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // PRD 04_SYSTEM_DESIGN_PRD.md §2.3
const PENDING_TOKEN_TTL_SECONDS = 2 * 60; // login -> mfa/select-school hop only

function secretKey(): Uint8Array {
  return new TextEncoder().encode(appSessionSecret());
}

export async function signAccessToken(claims: SessionClaims, ttlSeconds = ACCESS_TOKEN_TTL_SECONDS): Promise<string> {
  return new SignJWT({
    typ: 'access',
    role: claims.role,
    schoolId: claims.schoolId,
    membershipId: claims.membershipId,
    tv: claims.tokenVersion,
    aal: claims.aal,
    sid: claims.sessionId,
    imp: claims.impersonation ?? undefined,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secretKey());
}

export async function verifyAccessToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.typ !== 'access') return null;
    const imp = payload.imp as { impersonationId: string; actorUserId: string } | undefined;
    return {
      sub: String(payload.sub),
      role: payload.role as StaffRole,
      schoolId: (payload.schoolId as string | null) ?? null,
      membershipId: (payload.membershipId as string | null) ?? null,
      tokenVersion: Number(payload.tv),
      aal: payload.aal as 'aal1' | 'aal2',
      sessionId: String(payload.sid),
      impersonation: imp ?? null,
    };
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) return null;
    if (err instanceof joseErrors.JWSSignatureVerificationFailed) return null;
    return null;
  }
}

// Pending tokens carry ONLY a user id + a purpose + (for select-school) the
// aal already achieved. They are never accepted anywhere an access token
// is expected -- the `typ` discriminator is checked, not assumed -- and
// they carry no role/schoolId, because at this point in the flow the
// server has not yet resolved either from a real membership row.
export type PendingPurpose = 'mfa' | 'select_school' | 'reset' | 'email_step' | 'mfa_setup' | 'authenticator';
const PENDING_PURPOSES: readonly string[] = ['mfa', 'select_school', 'reset', 'email_step', 'mfa_setup', 'authenticator'];

interface PendingPayload {
  userId: string; // public.users.user_id, equal by construction to the auth.users.id that authenticated
  purpose: PendingPurpose;
  aal: 'aal1' | 'aal2';
  // Present for purpose:'mfa' and purpose:'reset' (a password reset whose
  // account also has an authenticator, C89) -- carries the just-issued, still-aal1
  // Supabase Auth session across the login -> mfa-verify hop so the
  // verify step can call auth.mfa.challenge/verify without re-prompting
  // the password. Also for 'mfa_setup' (a platform admin enrolling an
  // authenticator during sign-in) and 'authenticator' (setting one up or
  // replacing it on the account page), C95: the enrolment is confirmed with
  // the same Supabase session that started it. Never used for anything
  // DB-authorization-related.
  sbAccessToken?: string;
  sbRefreshToken?: string;
}

export async function signPendingToken(payload: PendingPayload, ttlSeconds = PENDING_TOKEN_TTL_SECONDS): Promise<string> {
  return new SignJWT({ typ: 'pending', ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secretKey());
}

export async function verifyPendingToken(token: string): Promise<PendingPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.typ !== 'pending' || !PENDING_PURPOSES.includes(String(payload.purpose))) return null;
    return {
      userId: String(payload.userId),
      purpose: payload.purpose as PendingPurpose,
      aal: payload.aal as 'aal1' | 'aal2',
      sbAccessToken: payload.sbAccessToken as string | undefined,
      sbRefreshToken: payload.sbRefreshToken as string | undefined,
    };
  } catch {
    return null;
  }
}

// "Remember this device" (C90): proof that this browser already passed the
// email-code step for this user. Bound to users.token_version, so "sign out
// on all devices", a password reset and an admin's sign-out-everywhere all
// make every remembered device ask for the email code again. Never accepted
// where an access or pending token is expected (`typ` is checked).
export async function signDeviceToken(userId: string, tokenVersion: number, ttlSeconds: number): Promise<string> {
  return new SignJWT({ typ: 'device', tv: tokenVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secretKey());
}

export async function verifyDeviceToken(token: string): Promise<{ userId: string; tokenVersion: number } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.typ !== 'device' || typeof payload.sub !== 'string') return null;
    return { userId: payload.sub, tokenVersion: Number(payload.tv) };
  } catch {
    return null;
  }
}
