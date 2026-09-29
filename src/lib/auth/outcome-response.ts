import { NextResponse } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE, PENDING_COOKIE, ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS, PENDING_TTL_SECONDS, cookieOptions } from './cookies';
import { AuthError } from './errors';
import type { LoginOutcome } from './types';

// One place that turns a sign-in outcome into the HTTP answer and cookies,
// shared by password login and email-code login (C89) so the two paths
// cannot drift apart.
export function outcomeResponse(outcome: LoginOutcome): NextResponse {
  if (outcome.status === 'mfa_required') {
    const res = NextResponse.json({ status: 'mfa_required' });
    res.cookies.set(PENDING_COOKIE, outcome.pendingToken, cookieOptions(PENDING_TTL_SECONDS));
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
  return res;
}

const STATUS: Partial<Record<AuthError['code'], number>> = {
  account_disabled: 403,
  rate_limited: 429,
  password_invalid: 400,
  password_rejected: 400,
  mfa_required: 409,
};

export function authErrorResponse(err: AuthError): NextResponse {
  return NextResponse.json({ error: err.code }, { status: STATUS[err.code] ?? 401 });
}
