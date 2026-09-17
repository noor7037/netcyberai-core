import { NextRequest, NextResponse } from 'next/server';
import { login } from '@/lib/auth/resolve';
import { AuthError } from '@/lib/auth/errors';
import { ACCESS_COOKIE, REFRESH_COOKIE, PENDING_COOKIE, ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS, PENDING_TTL_SECONDS, cookieOptions } from '@/lib/auth/cookies';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return NextResponse.json({ error: 'email and password are required' }, { status: 400 });
  }

  try {
    const outcome = await login(body.email, body.password);

    if (outcome.status === 'mfa_required') {
      const res = NextResponse.json({ status: 'mfa_required' });
      res.cookies.set(PENDING_COOKIE, outcome.pendingToken, cookieOptions(PENDING_TTL_SECONDS));
      return res;
    }
    if (outcome.status === 'no_memberships') {
      return NextResponse.json({ status: 'no_memberships', error: 'This account has no active school memberships.' }, { status: 403 });
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
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.code }, { status: err.code === 'account_disabled' ? 403 : 401 });
    }
    throw err;
  }
}
