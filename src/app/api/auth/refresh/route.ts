import { NextRequest, NextResponse } from 'next/server';
import { refreshSession } from '@/lib/auth/refresh';
import { clearSessionCookies, setSessionCookies } from '@/lib/auth/cookies';
import { refreshCookieFor, surfaceForRole, surfaceOfRequest, SURFACES, type Surface } from '@/lib/auth/surfaces';

// Renews the session of the area that asked (C556): its own refresh cookie (or, for a session from before C556, the
// School app's), and the new pair goes under the cookies of the area the session belongs to.
export async function POST(req: NextRequest) {
  const get = (name: string) => req.cookies.get(name)?.value;
  const asked = surfaceOfRequest(req.nextUrl, req.headers);
  let found: { token: string; from: Surface } | null = null;
  if (asked) found = await refreshCookieFor(get, asked);
  else {
    // An area that cannot be told: the first area with a refresh cookie, School app first.
    for (const s of SURFACES) if (!found) found = await refreshCookieFor(get, s);
  }
  if (!found) {
    return NextResponse.json({ error: 'no refresh token' }, { status: 401 });
  }

  const result = await refreshSession(found.token);
  if (!result.ok) {
    const res = NextResponse.json({ error: result.reason }, { status: 401 });
    clearSessionCookies(res.cookies, found.from);
    return res;
  }

  const res = NextResponse.json({ status: 'ok', role: result.claims.role, schoolId: result.claims.schoolId });
  // "Keep me signed in" (F1-1): a session kept stays in cookies that outlive the browser; one not kept stays session-only.
  const home = surfaceForRole(result.claims.role);
  // A session from before C556 moves out of the School app's cookies into its own area's.
  if (found.from !== home) clearSessionCookies(res.cookies, found.from);
  setSessionCookies(res.cookies, result.claims.role, result.accessToken, result.refreshToken, result.persistent);
  return res;
}
