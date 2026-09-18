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
    return {
      sub: String(payload.sub),
      role: payload.role as StaffRole,
      schoolId: (payload.schoolId as string | null) ?? null,
      membershipId: (payload.membershipId as string | null) ?? null,
      tokenVersion: Number(payload.tv),
      aal: payload.aal as 'aal1' | 'aal2',
      sessionId: String(payload.sid),
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
interface PendingPayload {
  userId: string; // public.users.user_id, equal by construction to the auth.users.id that authenticated
  purpose: 'mfa' | 'select_school';
  aal: 'aal1' | 'aal2';
  // Only present for purpose:'mfa' -- carries the just-issued, still-aal1
  // Supabase Auth session across the login -> mfa-verify hop so the
  // verify step can call auth.mfa.challenge/verify without re-prompting
  // the password. Never used for anything DB-authorization-related.
  sbAccessToken?: string;
  sbRefreshToken?: string;
}

export async function signPendingToken(payload: PendingPayload): Promise<string> {
  return new SignJWT({ typ: 'pending', ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${PENDING_TOKEN_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifyPendingToken(token: string): Promise<PendingPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.typ !== 'pending') return null;
    return {
      userId: String(payload.userId),
      purpose: payload.purpose as 'mfa' | 'select_school',
      aal: payload.aal as 'aal1' | 'aal2',
      sbAccessToken: payload.sbAccessToken as string | undefined,
      sbRefreshToken: payload.sbRefreshToken as string | undefined,
    };
  } catch {
    return null;
  }
}
