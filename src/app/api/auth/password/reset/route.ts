import { NextRequest, NextResponse } from 'next/server';
import { continueResetWithMfa, normalizeCode, normalizeEmail, passwordProblem, resetPasswordWithCode } from '@/lib/auth/account';
import { AuthError } from '@/lib/auth/errors';
import { PENDING_COOKIE, PENDING_TTL_SECONDS, cookieOptions } from '@/lib/auth/cookies';
import { authErrorResponse } from '@/lib/auth/outcome-response';

// Sets a new password with an emailed recovery code: forgotten passwords,
// and first-time staff who never set one (C89). Accounts with an
// authenticator answer `mfa_required` once, then finish with the
// authenticator code (the verified recovery step waits in the pending cookie).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const newPassword = body?.newPassword;
  if (passwordProblem(newPassword)) {
    return NextResponse.json({ error: 'password_invalid', detail: passwordProblem(newPassword) }, { status: 400 });
  }
  const mfaCode = normalizeCode(body?.mfaCode) ?? undefined;
  const pending = req.cookies.get(PENDING_COOKIE)?.value;

  try {
    if (body?.continue === true) {
      if (!pending || !mfaCode) return NextResponse.json({ error: 'pending_token_invalid' }, { status: 400 });
      const done = await continueResetWithMfa(pending, newPassword, mfaCode);
      const res = NextResponse.json(done);
      res.cookies.delete(PENDING_COOKIE);
      return res;
    }

    const email = normalizeEmail(body?.email);
    const code = normalizeCode(body?.code);
    if (!email || !code) return NextResponse.json({ error: 'code_invalid' }, { status: 400 });
    const outcome = await resetPasswordWithCode(email, code, newPassword, mfaCode);
    if (outcome.status === 'mfa_required') {
      const res = NextResponse.json({ status: 'mfa_required' });
      res.cookies.set(PENDING_COOKIE, outcome.pendingToken, cookieOptions(PENDING_TTL_SECONDS));
      return res;
    }
    return NextResponse.json(outcome);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }
}
