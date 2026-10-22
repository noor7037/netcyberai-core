import { NextRequest, NextResponse } from 'next/server';
import { stepUp } from '@/lib/auth/account';
import { cookieOptions } from '@/lib/auth/cookies';
import { AuthError } from '@/lib/auth/errors';
import { authErrorResponse, noStore } from '@/lib/auth/outcome-response';
import { requireSession } from '@/lib/auth/require-session';
import { signStepUpToken } from '@/lib/auth/jwt';
import { STEP_UP_COOKIE, STEP_UP_TTL_SECONDS } from '@/lib/auth/step-up';

// Step-up (F1-1b, C260). Body {password, code}: the password and the authenticator's code give 15 minutes for
// sensitive actions. An account without an authenticator sends {password} first (an emailed code is sent), then
// {password, code}. A support session (viewing as someone) cannot step up.
export async function POST(req: NextRequest) {
  const claims = await requireSession(req);
  if (!claims) return noStore(NextResponse.json({ error: 'session_expired' }, { status: 401 }));
  if (claims.impersonation) return noStore(NextResponse.json({ error: 'forbidden' }, { status: 403 }));
  const body = await req.json().catch(() => null);
  const password = typeof body?.password === 'string' ? body.password : '';
  const code = typeof body?.code === 'string' && /^\d{6}$/.test(body.code.replace(/\s+/g, '')) ? body.code.replace(/\s+/g, '') : undefined;
  if (!password) return noStore(NextResponse.json({ error: 'invalid_credentials' }, { status: 400 }));
  try {
    const result = await stepUp(claims.sub, password, code);
    if (result === 'email_sent') return noStore(NextResponse.json({ status: 'email_sent' }));
    const res = noStore(NextResponse.json({ status: 'ok' }));
    res.cookies.set(STEP_UP_COOKIE, await signStepUpToken(claims.sub, claims.tokenVersion, STEP_UP_TTL_SECONDS), cookieOptions(STEP_UP_TTL_SECONDS));
    return res;
  } catch (err) {
    if (err instanceof AuthError) return noStore(authErrorResponse(err));
    throw err;
  }
}
