import { NextResponse, type NextRequest } from 'next/server';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  PENDING_COOKIE,
  DEVICE_COOKIE,
  KEEP_COOKIE,
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
  PENDING_TTL_SECONDS,
  EMAIL_STEP_TTL_SECONDS,
  AUTHENTICATOR_SETUP_TTL_SECONDS,
  cookieOptions,
  sessionCookieOptions,
} from './cookies';
import { trustDevice, type DeviceProof } from './devices';
import { AuthError } from './errors';
import { verifyPendingToken } from './jwt';
import { markSessionNotPersistent } from './refresh';
import type { LoginOutcome } from './types';
import { TOURS_COOKIE } from '@/lib/contracts/tours';
import { LANG_COOKIE } from '@/lib/i18n';

// "Keep me signed in" (F1-1, C257): the tick box on the first screen (`keepSignedIn` in the body, on unless false),
// or, on a later step, what the first screen said (KEEP_COOKIE).
export function keepSignedIn(req: NextRequest, body: unknown): boolean {
  const said = (body as { keepSignedIn?: unknown } | null)?.keepSignedIn;
  if (typeof said === 'boolean') return said;
  return req.cookies.get(KEEP_COOKIE)?.value !== '0';
}

// One place that turns a sign-in outcome into the HTTP answer and cookies, shared by every way in (password, email
// code, link, password reset, authenticator, choosing a school; C89/C90) so the paths cannot drift apart. Without
// "Keep me signed in" the session is marked so on the server (it ends after 12 hours without use) and its cookies
// end when the browser closes; a step still to come remembers the choice in KEEP_COOKIE.
export async function signInResponse(outcome: LoginOutcome, persistent: boolean): Promise<NextResponse> {
  const res = outcomeResponse(outcome, persistent);
  if (outcome.status === 'ok') {
    if (!persistent) await markSessionNotPersistent(outcome.claims.sessionId);
    res.cookies.delete(KEEP_COOKIE);
  } else if (res.ok) {
    if (persistent) res.cookies.delete(KEEP_COOKIE);
    else res.cookies.set(KEEP_COOKIE, '0', cookieOptions(EMAIL_STEP_TTL_SECONDS));
  }
  return res;
}

function outcomeResponse(outcome: LoginOutcome, persistent: boolean): NextResponse {
  if (outcome.status === 'email_step') {
    const res = NextResponse.json({ status: 'email_step', maskedEmail: outcome.maskedEmail, setupNext: outcome.setupNext });
    res.cookies.set(PENDING_COOKIE, outcome.pendingToken, cookieOptions(EMAIL_STEP_TTL_SECONDS));
    return res;
  }
  if (outcome.status === 'mfa_required') {
    const res = NextResponse.json({ status: 'mfa_required' });
    res.cookies.set(PENDING_COOKIE, outcome.pendingToken, cookieOptions(PENDING_TTL_SECONDS));
    return res;
  }
  if (outcome.status === 'mfa_setup') {
    // A platform admin enrols an authenticator on this screen (C95).
    const res = NextResponse.json({ status: 'mfa_setup' });
    res.cookies.set(PENDING_COOKIE, outcome.pendingToken, cookieOptions(AUTHENTICATOR_SETUP_TTL_SECONDS));
    return res;
  }
  if (outcome.status === 'no_memberships') {
    return NextResponse.json({ status: 'no_memberships', error: 'no_memberships' }, { status: 403 });
  }
  if (outcome.status === 'select_school') {
    const res = NextResponse.json({
      status: 'select_school',
      memberships: outcome.memberships.map((m) => ({ membershipId: m.membershipId, schoolId: m.schoolId, schoolName: m.schoolName, role: m.role })),
    });
    res.cookies.set(PENDING_COOKIE, outcome.pendingToken, cookieOptions(PENDING_TTL_SECONDS));
    return res;
  }
  const res = NextResponse.json({ status: 'ok', role: outcome.claims.role, schoolId: outcome.claims.schoolId });
  res.cookies.set(ACCESS_COOKIE, outcome.accessToken, sessionCookieOptions(ACCESS_TTL_SECONDS, persistent));
  res.cookies.set(REFRESH_COOKIE, outcome.refreshToken, sessionCookieOptions(REFRESH_TTL_SECONDS, persistent));
  res.cookies.delete(PENDING_COOKIE);
  // A new sign-in asks the account for its language again (C134): a choice
  // made on another device, or by whoever used this browser before, never
  // carries over through an old cookie.
  res.cookies.delete(LANG_COOKIE);
  res.cookies.delete(TOURS_COOKIE); // the same for the tours they have seen (C138)
  return res;
}

// What a finished sign-in step proved, for "Trust this browser": the authenticator when the session it led to (or the
// school choice still to come) is at aal2, otherwise the emailed code. Null while a step is still to come that the
// person has not passed (the authenticator after an emailed code is trusted at that step instead).
export async function proofOf(outcome: LoginOutcome): Promise<DeviceProof | null> {
  if (outcome.status === 'ok') return outcome.claims.aal === 'aal2' ? 'authenticator' : 'email';
  if (outcome.status === 'select_school') {
    const pending = await verifyPendingToken(outcome.pendingToken);
    return pending ? (pending.aal === 'aal2' ? 'authenticator' : 'email') : null;
  }
  return null;
}

// "Trust this browser for 30 days" (C90, F1-1 C257), once a step was passed with the box ticked. Never after a sign-in
// that only got through because this browser was already trusted: that would lengthen the trust without passing the
// step again.
export async function rememberDevice(res: NextResponse, req: NextRequest, userId: string, proof: DeviceProof | null): Promise<NextResponse> {
  if (!res.ok || !proof) return res;
  const { token, ttlSeconds } = await trustDevice(userId, proof, req.headers.get('user-agent'), req.cookies.get(DEVICE_COOKIE)?.value);
  res.cookies.set(DEVICE_COOKIE, token, cookieOptions(ttlSeconds));
  return res;
}

const STATUS: Partial<Record<AuthError['code'], number>> = {
  account_disabled: 403,
  rate_limited: 429,
  password_invalid: 400,
  password_rejected: 400,
  mfa_required: 409,
  email_send_failed: 502,
  email_limit: 429,
  setup_required: 503,
  mfa_already_enrolled: 409,
  mfa_enroll_failed: 502,
  admin_reset_needs_founder: 403,
};

export function authErrorResponse(err: AuthError): NextResponse {
  const body: { error: string; retryAfter?: number } = { error: err.code };
  if (err.retryAfter) body.retryAfter = err.retryAfter;
  return NextResponse.json(body, { status: STATUS[err.code] ?? 401 });
}

// Authenticator setup responses (C95) carry, or sit next to ones that carry,
// a QR code and setup key: nothing on those routes may be cached, errors
// included.
export function noStore(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
