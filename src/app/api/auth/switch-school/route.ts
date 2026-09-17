import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/require-session';
import { switchSchool } from '@/lib/auth/resolve';
import { AuthError } from '@/lib/auth/errors';
import { ACCESS_COOKIE, REFRESH_COOKIE, ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS, cookieOptions } from '@/lib/auth/cookies';

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (!session) {
    return NextResponse.json({ error: 'not authenticated' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body?.membershipId) {
    return NextResponse.json({ error: 'membershipId is required' }, { status: 400 });
  }

  try {
    const outcome = await switchSchool(session, body.membershipId);
    if (outcome.status !== 'ok') {
      return NextResponse.json({ error: 'unexpected outcome after switch' }, { status: 500 });
    }
    const res = NextResponse.json({ status: 'ok', role: outcome.claims.role, schoolId: outcome.claims.schoolId });
    res.cookies.set(ACCESS_COOKIE, outcome.accessToken, cookieOptions(ACCESS_TTL_SECONDS));
    res.cookies.set(REFRESH_COOKIE, outcome.refreshToken, cookieOptions(REFRESH_TTL_SECONDS));
    return res;
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.code }, { status: 403 });
    }
    throw err;
  }
}
