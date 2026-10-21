import { NextRequest, NextResponse } from 'next/server';
import { passwordLogin } from '@/lib/auth/account';
import { AuthError } from '@/lib/auth/errors';
import { DEVICE_COOKIE } from '@/lib/auth/cookies';
import { authErrorResponse, keepSignedIn, signInResponse } from '@/lib/auth/outcome-response';

// Password sign-in with an email or mobile number (C96). An account with an
// authenticator answers `mfa_required` (its code, at /api/auth/mfa/verify)
// and no email is sent. Otherwise `email_step`: a code was emailed, to be
// entered at /api/auth/email-step, unless this is a remembered device of an
// account that is not a platform admin.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const identifier = body?.identifier ?? body?.email;
  if (typeof identifier !== 'string' || !identifier || typeof body?.password !== 'string' || !body.password) {
    return NextResponse.json({ error: 'email or mobile number, and password, are required' }, { status: 400 });
  }

  try {
    return await signInResponse(
      await passwordLogin(identifier, body.password, req.cookies.get(DEVICE_COOKIE)?.value, `${req.nextUrl.origin}/login`),
      keepSignedIn(req, body)
    );
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }
}
