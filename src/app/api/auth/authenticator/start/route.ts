import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/require-session';
import { startAccountSetup } from '@/lib/auth/authenticator';
import { canManageOwnAuthenticator, normalizeTotpCode } from '@/lib/auth/authenticator-rules';
import { AuthError } from '@/lib/auth/errors';
import { AUTHENTICATOR_COOKIE, AUTHENTICATOR_SETUP_TTL_SECONDS, cookieOptions } from '@/lib/auth/cookies';
import { authErrorResponse, noStore } from '@/lib/auth/outcome-response';

// Account page, "Set up authenticator app" / "Replace authenticator" (C95).
// Needs the current password, and the current authenticator's code when
// replacing. Returns the new QR code and setup key to this screen only;
// never logged, stored by this app, or cached.
export async function POST(req: NextRequest) {
  const claims = await requireSession(req);
  if (!claims) return noStore(NextResponse.json({ error: 'session_expired' }, { status: 401 }));
  if (claims.impersonation || !canManageOwnAuthenticator(claims.role)) {
    return noStore(NextResponse.json({ error: 'forbidden' }, { status: 403 }));
  }
  const body = await req.json().catch(() => null);
  if (typeof body?.currentPassword !== 'string' || !body.currentPassword) {
    return noStore(NextResponse.json({ error: 'invalid_credentials' }, { status: 400 }));
  }
  try {
    const { enrolment, pendingToken, replacing } = await startAccountSetup(
      claims.sub,
      body.currentPassword,
      normalizeTotpCode(body?.mfaCode) ?? undefined
    );
    const res = noStore(NextResponse.json({ status: 'enrolling', replacing, ...enrolment }));
    res.cookies.set(AUTHENTICATOR_COOKIE, pendingToken, cookieOptions(AUTHENTICATOR_SETUP_TTL_SECONDS));
    return res;
  } catch (err) {
    if (err instanceof AuthError) return noStore(authErrorResponse(err));
    throw err;
  }
}
