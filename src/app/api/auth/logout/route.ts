import { NextRequest, NextResponse } from 'next/server';
import { withBackendConnection } from '@/lib/auth/db';
import { clearSessionCookies } from '@/lib/auth/cookies';
import { verifyAccessToken } from '@/lib/auth/jwt';
import { accessCookieOf, sessionOf, surfaceForRole, surfaceOfRequest, SURFACES } from '@/lib/auth/surfaces';
import { STEP_UP_COOKIE } from '@/lib/auth/step-up';
import { TOURS_COOKIE } from '@/lib/contracts/tours';
import { LANG_COOKIE } from '@/lib/i18n';

export async function POST(req: NextRequest) {
  // C556: this area's own session only (strict), so signing out of one area never ends another person's session.
  const asked = surfaceOfRequest(req.nextUrl, req.headers);
  const get = (name: string) => req.cookies.get(name)?.value;
  let session = asked ? await sessionOf(get, asked) : null;
  if (!asked) for (const s of SURFACES) session ??= await sessionOf(get, s);
  if (session) {
    await withBackendConnection((client) =>
      client.query(`update sessions set revoked_at = now() where session_id = $1`, [session.sessionId])
    );
  }
  const res = NextResponse.json({ status: 'ok' });
  // C556: only this area signs out (the page's own, else the session's); another area open in this browser stays.
  const surface = asked ?? (session ? surfaceForRole(session.role) : 'app');
  clearSessionCookies(res.cookies, surface);
  // A session from before C556 that belongs to this area may still sit in the School app's cookies.
  if (surface !== 'app') {
    const old = get(accessCookieOf('app'));
    const oldClaims = old ? await verifyAccessToken(old) : null;
    if (oldClaims && surfaceForRole(oldClaims.role) === surface) clearSessionCookies(res.cookies, 'app');
  }
  // A step-up proof never outlives the sign-in that earned it (F1-1b).
  res.cookies.delete(STEP_UP_COOKIE);
  // The language belongs to the person who is leaving (C134), once no other area is signed in here.
  const othersLeft = SURFACES.some((s) => s !== surface && req.cookies.get(accessCookieOf(s))?.value);
  if (!othersLeft) {
    res.cookies.delete(LANG_COOKIE);
    res.cookies.delete(TOURS_COOKIE);
  }
  return res;
}
