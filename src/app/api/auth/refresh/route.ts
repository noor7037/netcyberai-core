import { NextRequest, NextResponse } from 'next/server';
import { refreshSession } from '@/lib/auth/refresh';
import { ACCESS_COOKIE, REFRESH_COOKIE, ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS, sessionCookieOptions } from '@/lib/auth/cookies';

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    return NextResponse.json({ error: 'no refresh token' }, { status: 401 });
  }

  const result = await refreshSession(refreshToken);
  if (!result.ok) {
    const res = NextResponse.json({ error: result.reason }, { status: 401 });
    res.cookies.delete(ACCESS_COOKIE);
    res.cookies.delete(REFRESH_COOKIE);
    return res;
  }

  const res = NextResponse.json({ status: 'ok', role: result.claims.role, schoolId: result.claims.schoolId });
  // "Keep me signed in" (F1-1): a session kept stays in cookies that outlive the browser; one not kept stays session-only.
  res.cookies.set(ACCESS_COOKIE, result.accessToken, sessionCookieOptions(ACCESS_TTL_SECONDS, result.persistent));
  res.cookies.set(REFRESH_COOKIE, result.refreshToken, sessionCookieOptions(REFRESH_TTL_SECONDS, result.persistent));
  return res;
}
