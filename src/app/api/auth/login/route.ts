import { NextRequest, NextResponse } from 'next/server';
import { passwordLogin } from '@/lib/auth/account';
import { AuthError } from '@/lib/auth/errors';
import { DEVICE_COOKIE } from '@/lib/auth/cookies';
import { outcomeResponse, authErrorResponse } from '@/lib/auth/outcome-response';

// Password sign-in with an email or mobile number. Unless this browser is a
// remembered device, the answer is `email_step`: a code was emailed and
// must be entered at /api/auth/email-step (C90).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const identifier = body?.identifier ?? body?.email;
  if (typeof identifier !== 'string' || !identifier || typeof body?.password !== 'string' || !body.password) {
    return NextResponse.json({ error: 'email or mobile number, and password, are required' }, { status: 400 });
  }

  try {
    return outcomeResponse(await passwordLogin(identifier, body.password, req.cookies.get(DEVICE_COOKIE)?.value));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }
}
