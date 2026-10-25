import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/auth/jwt';
import { canAccessControl, canAccessApp, canAccessFamily } from '@/lib/auth/guards';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/auth/cookies';
import type { SessionRole } from '@/lib/auth/types';
import { REQUEST_ID_HEADER, requestIdFrom } from '@/lib/observability/request-id';
import { FAMILY_SESSION_COOKIE, verifyFamilySession } from '@/lib/family/session';

// Edge-runtime gate: verifies the signed access-token JWT (jose is
// WebCrypto-based, no Node APIs, so this runs at the edge) and checks
// role/schoolId claims -- cheap, no DB. It does NOT re-check
// token_version or membership.is_active against the live database;
// that happens inside withTenantContext on the Node side, the moment a
// request actually touches tenant data (see db.ts's comment for why:
// pg needs a real TCP connection, which the edge runtime can't hold).
// A request whose access token is merely expired is retried once
// through /api/auth/refresh (a real Node route, real DB check) before
// this falls back to redirecting to /login.
type GateClaims = { role: SessionRole; schoolId: string | null };

// Every request through here also gets a request id (C111): passed to the
// route as x-request-id and returned in the response.
export async function middleware(req: NextRequest) {
  const requestId = requestIdFrom(req.headers);
  const res = await gate(req, requestId);
  res.headers.set(REQUEST_ID_HEADER, requestId);
  return res;
}

function next(req: NextRequest, requestId: string): NextResponse {
  const headers = new Headers(req.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  return NextResponse.next({ request: { headers } });
}

// The Family app's pages that need no session (M1-2, C248): signing in, and the page the Android shell shows offline.
const FAMILY_OPEN = new Set(['/family/sign-in', '/family/link', '/family/offline', '/family/about-ai']);

// The Family app (/family, M1-2, C248) has its own session and cookie; a staff cookie is never read here.
async function familyGate(req: NextRequest, requestId: string): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  const session = await verifyFamilySession(req.cookies.get(FAMILY_SESSION_COOKIE)?.value);
  if (FAMILY_OPEN.has(pathname)) {
    return session && (pathname === '/family/sign-in' || pathname === '/family/link') ? NextResponse.redirect(new URL('/family', req.url)) : next(req, requestId);
  }
  return session ? next(req, requestId) : NextResponse.redirect(new URL('/family/sign-in', req.url));
}

async function gate(req: NextRequest, requestId: string): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  if (pathname === '/family' || pathname.startsWith('/family/')) return familyGate(req, requestId);
  const isControl = pathname.startsWith('/control');
  const isApp = pathname.startsWith('/app');
  // The school parent home (C230-D, at /parent since C248): a parent's school session only.
  const isFamily = pathname === '/parent' || pathname.startsWith('/parent/');
  if (!isControl && !isApp && !isFamily) return next(req, requestId);

  const accessToken = req.cookies.get(ACCESS_COOKIE)?.value;
  let claims: GateClaims | null = accessToken ? await verifyAccessToken(accessToken) : null;
  let refreshedSetCookie: string | null = null;

  if (!claims && req.cookies.get(REFRESH_COOKIE)?.value) {
    const refreshRes = await fetch(new URL('/api/auth/refresh', req.url), {
      method: 'POST',
      headers: { cookie: req.headers.get('cookie') ?? '' },
    });
    if (refreshRes.ok) {
      const body = (await refreshRes.json()) as { role: SessionRole; schoolId: string | null };
      refreshedSetCookie = refreshRes.headers.get('set-cookie');
      claims = { role: body.role, schoolId: body.schoolId };
    }
  }

  if (!claims) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const allowed = isControl ? canAccessControl(claims) : isApp ? canAccessApp(claims) : canAccessFamily(claims);
  if (!allowed) {
    // A parent who opens a staff address is taken to the parent home; staff who open the parent home, to their own.
    if (claims.role === 'parent') return NextResponse.redirect(new URL('/parent', req.url));
    if (isFamily) return NextResponse.redirect(new URL(claims.role === 'super_admin' ? '/control' : '/app', req.url));
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const res = next(req, requestId);
  if (refreshedSetCookie) {
    res.headers.append('set-cookie', refreshedSetCookie);
  }
  return res;
}

export const config = {
  // The gated shells, plus API routes and sign-in for request ids. Public
  // marketing pages are not matched: they stay static and untouched.
  matcher: ['/control/:path*', '/app/:path*', '/family/:path*', '/parent/:path*', '/api/:path*', '/login'],
};
