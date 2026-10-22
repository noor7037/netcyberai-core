import { NextRequest, NextResponse } from 'next/server';
import { verifyPendingToken } from '@/lib/auth/jwt';
import { selectSchool } from '@/lib/auth/resolve';
import { AuthError } from '@/lib/auth/errors';
import { PENDING_COOKIE } from '@/lib/auth/cookies';
import { keepSignedIn, signInResponse } from '@/lib/auth/outcome-response';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const pendingToken = req.cookies.get(PENDING_COOKIE)?.value;
  if (!pendingToken || !body?.membershipId) {
    return NextResponse.json({ error: 'no pending selection step or missing membershipId' }, { status: 400 });
  }

  const pending = await verifyPendingToken(pendingToken);
  if (!pending || pending.purpose !== 'select_school') {
    return NextResponse.json({ error: 'pending_token_invalid' }, { status: 401 });
  }

  try {
    // membershipId is the only client-supplied value here, and it is
    // re-validated inside selectSchool against pending.userId (never
    // trusted as-is) -- see fetchOwnedActiveMembership.
    const outcome = await selectSchool(pending.userId, pending.aal, body.membershipId);
    if (outcome.status !== 'ok') {
      return NextResponse.json({ error: 'unexpected outcome after selection' }, { status: 500 });
    }
    return await signInResponse(outcome, keepSignedIn(req, body));
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.code }, { status: 403 });
    }
    throw err;
  }
}
