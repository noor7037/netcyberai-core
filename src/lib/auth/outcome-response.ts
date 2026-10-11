import { NextResponse } from 'next/server';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  PENDING_COOKIE,
  DEVICE_COOKIE,
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
  PENDING_TTL_SECONDS,
  EMAIL_STEP_TTL_SECONDS,
  DEVICE_TTL_SECONDS,
  AUTHENTICATOR_SETUP_TTL_SECONDS,
  cookieOptions,
} from './cookies';
import { AuthError } from './errors';
import { signDeviceToken } from './jwt';
import { fetchLiveUser } from './resolve';
import type { LoginOutcome } from './types';
import { TOURS_COOKIE } from '@/lib/contracts/tours';
import { LANG_COOKIE } from '@/lib/i18n';

// One place that turns a sign-in outcome into the HTTP answer and cookies,
// shared by every way in (password, email code, password reset; C89/C90) so
// the paths cannot drift apart.
export function outcomeResponse(outcome: LoginOutcome): NextResponse {
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
  res.cookies.set(ACCESS_COOKIE, outcome.accessToken, cookieOptions(ACCESS_TTL_SECONDS));
  res.cookies.set(REFRESH_COOKIE, outcome.refreshToken, cookieOptions(REFRESH_TTL_SECONDS));
  res.cookies.delete(PENDING_COOKIE);
  // A new sign-in asks the account for its language again (C134): a choice
  // made on another device, or by whoever used this browser before, never
  // carries over through an old cookie.
  res.cookies.delete(LANG_COOKIE);
  res.cookies.delete(TOURS_COOKIE); // the same for the tours they have seen (C138)
  return res;
}

// "Remember this device" (C90), set once the email has been proven.
export async function rememberDevice(res: NextResponse, userId: string): Promise<NextResponse> {
  const live = await fetchLiveUser(userId);
  res.cookies.set(DEVICE_COOKIE, await signDeviceToken(userId, Number(live.token_version), DEVICE_TTL_SECONDS), cookieOptions(DEVICE_TTL_SECONDS));
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
