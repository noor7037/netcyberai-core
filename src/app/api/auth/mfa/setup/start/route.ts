import { NextRequest, NextResponse } from 'next/server';
import { startSignInSetup } from '@/lib/auth/authenticator';
import { AuthError } from '@/lib/auth/errors';
import { PENDING_COOKIE } from '@/lib/auth/cookies';
import { authErrorResponse, noStore } from '@/lib/auth/outcome-response';

// Sign-in, platform admin without an authenticator, email already proven
// (C95): starts enrolment and returns the QR code and setup key to this
// screen only. Never logged, never stored by this app, never cached.
export async function POST(req: NextRequest) {
  try {
    const enrolment = await startSignInSetup(req.cookies.get(PENDING_COOKIE)?.value);
    return noStore(NextResponse.json({ status: 'enrolling', ...enrolment }));
  } catch (err) {
    if (err instanceof AuthError) return noStore(authErrorResponse(err));
    throw err;
  }
}
