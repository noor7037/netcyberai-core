import { NextRequest, NextResponse } from 'next/server';
import { verifyMfaAndContinue } from '@/lib/auth/resolve';
import { AuthError } from '@/lib/auth/errors';
import { ACCESS_COOKIE, REFRESH_COOKIE, PENDING_COOKIE, PENDING_TTL_SECONDS, ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS, cookieOptions } from '@/lib/auth/cookies';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const pendingToken = req.cookies.get(PENDING_COOKIE)?.value;
  if (!pendingToken || !body?.code) {
    return NextResponse.json({ error: 'no pending MFA step or missing code' }, { status: 400 });
  }

  try {
    const outcome = await verifyMfaAndContinue(pendingToken, body.code);

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
    if (outcome.status === 'mfa_required') {
      // Cannot happen: verifyMfaAndContinue only re-enters resolution at aal2.
      return NextResponse.json({ error: 'unexpected mfa_required after verify' }, { status: 500 });
    }

    const res = NextResponse.json({ status: 'ok', role: outcome.claims.role, schoolId: outcome.claims.schoolId });
    res.cookies.set(ACCESS_COOKIE, outcome.accessToken, cookieOptions(ACCESS_TTL_SECONDS));
    res.cookies.set(REFRESH_COOKIE, outcome.refreshToken, cookieOptions(REFRESH_TTL_SECONDS));
    res.cookies.delete(PENDING_COOKIE);
    return res;
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.code }, { status: 401 });
    }
    throw err;
  }
}
