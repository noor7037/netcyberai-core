import { NextRequest, NextResponse } from 'next/server';
import { loginWithEmailCode, normalizeCode, resolveIdentifier } from '@/lib/auth/account';
import { AuthError } from '@/lib/auth/errors';
import { DEVICE_COOKIE } from '@/lib/auth/cookies';
import { authErrorResponse, keepSignedIn, proofOf, rememberDevice, signInResponse } from '@/lib/auth/outcome-response';

// Signs in with an emailed code. The outcome goes through the same
// resolution as password login: super_admin still needs the authenticator
// step, people with several schools still choose one (C89, C90).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const code = normalizeCode(body?.code);
  const email = await resolveIdentifier(body?.identifier ?? body?.email, { forEmail: true });
  if (!email || !code) {
    return NextResponse.json({ error: 'code_invalid' }, { status: 400 });
  }
  try {
    const { outcome, userId, viaTrustedDevice } = await loginWithEmailCode(email, code, req.cookies.get(DEVICE_COOKIE)?.value);
    const res = await signInResponse(outcome, keepSignedIn(req, body));
    return body?.rememberDevice === true && !viaTrustedDevice ? rememberDevice(res, req, userId, await proofOf(outcome)) : res;
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }
}
