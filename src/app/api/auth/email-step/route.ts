import { NextRequest, NextResponse } from 'next/server';
import { completeEmailStep, normalizeCode, resendEmailStep } from '@/lib/auth/account';
import { AuthError } from '@/lib/auth/errors';
import { PENDING_COOKIE } from '@/lib/auth/cookies';
import { authErrorResponse, keepSignedIn, proofOf, rememberDevice, signInResponse } from '@/lib/auth/outcome-response';

// Second step of password sign-in (C90): the code emailed to the account.
// Body {code, rememberDevice} to finish, or {resend: true} for a new code.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const pending = req.cookies.get(PENDING_COOKIE)?.value;
  try {
    if (body?.resend === true) {
      await resendEmailStep(pending, `${req.nextUrl.origin}/login`);
      return NextResponse.json({ status: 'sent' });
    }
    const code = normalizeCode(body?.code);
    if (!code) return NextResponse.json({ error: 'code_invalid' }, { status: 400 });
    const { outcome, userId } = await completeEmailStep(pending, code);
    const res = await signInResponse(outcome, keepSignedIn(req, body));
    return body?.rememberDevice === true ? rememberDevice(res, req, userId, await proofOf(outcome)) : res;
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }
}
