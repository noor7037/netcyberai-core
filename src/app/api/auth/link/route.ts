import { NextRequest, NextResponse } from 'next/server';
import { completeEmailLink, completeTokenHash, type LinkKind } from '@/lib/auth/account';
import { AuthError } from '@/lib/auth/errors';
import { PENDING_COOKIE, EMAIL_STEP_TTL_SECONDS, cookieOptions } from '@/lib/auth/cookies';
import { authErrorResponse, outcomeResponse } from '@/lib/auth/outcome-response';

// The login page posts the session an emailed link produced (C91). A sign-in
// link signs in (same authenticator and school steps as always); a
// password-reset link answers `set_password`, and the new password then goes
// to /api/auth/password/reset with {continue: true}.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const accessToken = body?.accessToken;
  const refreshToken = body?.refreshToken;
  const tokenHash = body?.tokenHash;
  const kind = ['magiclink', 'recovery', 'invite', 'email'].includes(body?.type) ? (body.type as LinkKind) : undefined;
  const byHash = typeof tokenHash === 'string' && /^[A-Za-z0-9_-]{16,200}$/.test(tokenHash) && kind;
  const bySession = typeof accessToken === 'string' && typeof refreshToken === 'string' && accessToken && refreshToken;
  if (!byHash && !bySession) return NextResponse.json({ error: 'link_invalid' }, { status: 400 });
  try {
    const result = byHash ? await completeTokenHash(tokenHash, kind!) : await completeEmailLink(accessToken, refreshToken, kind);
    if (result.status === 'set_password') {
      const res = NextResponse.json({ status: 'set_password' });
      res.cookies.set(PENDING_COOKIE, result.pendingToken, cookieOptions(EMAIL_STEP_TTL_SECONDS));
      return res;
    }
    return outcomeResponse(result.signedIn.outcome);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }
}
