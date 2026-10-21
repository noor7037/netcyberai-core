import { NextRequest, NextResponse } from 'next/server';
import { continueResetWithMfa, normalizeCode, passwordProblem, resetPasswordWithCode, resolveIdentifier } from '@/lib/auth/account';
import { AuthError } from '@/lib/auth/errors';
import { PENDING_COOKIE, PENDING_TTL_SECONDS, cookieOptions } from '@/lib/auth/cookies';
import { authErrorResponse, keepSignedIn, proofOf, rememberDevice, signInResponse } from '@/lib/auth/outcome-response';

// Sets a new password with an emailed recovery code: forgotten passwords,
// and first-time staff who never set one (C89). Accounts with an
// authenticator answer `mfa_required` once, then finish with the
// authenticator code (the verified recovery step waits in the pending
// cookie). Success signs the person in here and out everywhere else (C90).
// `continue` also finishes a reset started from the email's link (C91),
// where the authenticator code is needed only if the account has one.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const newPassword = body?.newPassword;
  if (passwordProblem(newPassword)) {
    return NextResponse.json({ error: 'password_invalid', detail: passwordProblem(newPassword) }, { status: 400 });
  }
  const mfaCode = normalizeCode(body?.mfaCode) ?? undefined;
  const remember = body?.rememberDevice === true;
  const pending = req.cookies.get(PENDING_COOKIE)?.value;

  try {
    if (body?.continue === true) {
      if (!pending) return NextResponse.json({ error: 'pending_token_invalid' }, { status: 400 });
      const { outcome, userId } = await continueResetWithMfa(pending, newPassword, mfaCode);
      const res = await signInResponse(outcome, keepSignedIn(req, body));
      return remember ? rememberDevice(res, req, userId, await proofOf(outcome)) : res;
    }

    const email = await resolveIdentifier(body?.identifier ?? body?.email, { forEmail: true });
    const code = normalizeCode(body?.code);
    if (!email || !code) return NextResponse.json({ error: 'code_invalid' }, { status: 400 });
    const result = await resetPasswordWithCode(email, code, newPassword, mfaCode);
    if (result.status === 'mfa_required') {
      const res = NextResponse.json({ status: 'mfa_required' });
      res.cookies.set(PENDING_COOKIE, result.pendingToken, cookieOptions(PENDING_TTL_SECONDS));
      return res;
    }
    const res = await signInResponse(result.signedIn.outcome, keepSignedIn(req, body));
    return remember ? rememberDevice(res, req, result.signedIn.userId, await proofOf(result.signedIn.outcome)) : res;
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }
}
