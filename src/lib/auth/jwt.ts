import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import { appSessionSecret } from './env';
import type { SessionClaims, SessionRole } from './types';

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
      role: payload.role as SessionRole,
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

// "Trust this browser" (C90, F1-1 C257): proof that this browser already passed a sign-in step for this user. It
// names a trusted_devices row (`did`), which is what makes it count (src/lib/auth/devices.ts), and is bound to
// users.token_version, so "sign out on all devices", a password reset and an admin's sign-out-everywhere all end it.
// Never accepted where an access or pending token is expected (`typ` is checked).
export async function signDeviceToken(userId: string, tokenVersion: number, deviceId: string, ttlSeconds: number): Promise<string> {
  return new SignJWT({ typ: 'device', tv: tokenVersion, did: deviceId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secretKey());
}

export async function verifyDeviceToken(token: string): Promise<{ userId: string; tokenVersion: number; deviceId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.typ !== 'device' || typeof payload.sub !== 'string' || typeof payload.did !== 'string') return null;
    return { userId: payload.sub, tokenVersion: Number(payload.tv), deviceId: payload.did };
  } catch {
    return null;
  }
}

// Step-up for sensitive actions (F1-1b, C260): proof that the person passed their password and authenticator (or an
// emailed code) again in the last 15 minutes. Bound to the person and users.token_version; never accepted where any
// other token is expected (`typ` is checked). Checked by src/lib/auth/step-up.ts.
export async function signStepUpToken(userId: string, tokenVersion: number, ttlSeconds: number): Promise<string> {
  return new SignJWT({ typ: 'step_up', tv: tokenVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secretKey());
}

export async function verifyStepUpToken(token: string): Promise<{ userId: string; tokenVersion: number } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    if (payload.typ !== 'step_up' || typeof payload.sub !== 'string') return null;
    return { userId: payload.sub, tokenVersion: Number(payload.tv) };
  } catch {
    return null;
  }
}

// ---- The Family app's tokens (M1-2, C248) ------------------------------------------------------------------------
// Signed with the same key and algorithm as every token above, but never interchangeable with them: each carries its
// own `typ` and the audience 'nca-family', and is verified against both. A staff access token is refused wherever a
// family token is expected (no audience, `typ` 'access'), and verifyAccessToken refuses a family token (`typ`).
//   family         the family's session: the account, its token_version (checked live on every database request)
//                  and a session id;
//   family_parent  parent mode after the parent PIN: bound to the same account and session id, short-lived;
//   family_code    the email-code step: the email the code was sent to, until the code is entered.
export type FamilyTokenTyp = 'family' | 'family_parent' | 'family_code';
const FAMILY_AUDIENCE = 'nca-family';

export async function signFamilyToken(typ: FamilyTokenTyp, sub: string, claims: Record<string, string | number>, ttlSeconds: number): Promise<string> {
  return new SignJWT({ ...claims, typ })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setAudience(FAMILY_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secretKey());
}

export async function verifyFamilyToken(token: string, typ: FamilyTokenTyp): Promise<{ sub: string; claims: Record<string, unknown> } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { audience: FAMILY_AUDIENCE, algorithms: ['HS256'] });
    if (payload.typ !== typ || typeof payload.sub !== 'string' || !payload.sub) return null;
    return { sub: payload.sub, claims: payload as Record<string, unknown> };
  } catch {
    return null;
  }
}
