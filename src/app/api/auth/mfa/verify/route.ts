import { NextRequest, NextResponse } from 'next/server';
import { verifyMfaAndContinue } from '@/lib/auth/resolve';
import { AuthError } from '@/lib/auth/errors';
import { verifyPendingToken } from '@/lib/auth/jwt';
import { PENDING_COOKIE } from '@/lib/auth/cookies';
import { keepSignedIn, rememberDevice, signInResponse } from '@/lib/auth/outcome-response';

// The authenticator's code at sign-in. Body {code, rememberDevice, keepSignedIn}: with rememberDevice, this browser is
// trusted for 30 days after passing the authenticator, and skips it and the emailed code (F1-1, C257).

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const pendingToken = req.cookies.get(PENDING_COOKIE)?.value;
  if (!pendingToken || !body?.code) {
    return NextResponse.json({ error: 'no pending MFA step or missing code' }, { status: 400 });
  }

  try {
    const pending = await verifyPendingToken(pendingToken);
    const outcome = await verifyMfaAndContinue(pendingToken, body.code);
    const persistent = keepSignedIn(req, body);
    const trust = (res: NextResponse) => (body?.rememberDevice === true && pending ? rememberDevice(res, req, pending.userId, 'authenticator') : res);

    if (outcome.status === 'no_memberships') {
      return NextResponse.json({ status: 'no_memberships', error: 'This account has no active school memberships.' }, { status: 403 });
    }
    if (outcome.status === 'select_school') return trust(await signInResponse(outcome, persistent));
    if (outcome.status === 'mfa_required' || outcome.status === 'email_step' || outcome.status === 'mfa_setup') {
      // Cannot happen: verifyMfaAndContinue only re-enters resolution at aal2.
      return NextResponse.json({ error: 'unexpected mfa_required after verify' }, { status: 500 });
    }

    return trust(await signInResponse(outcome, persistent));
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.code }, { status: 401 });
    }
    throw err;
  }
}
