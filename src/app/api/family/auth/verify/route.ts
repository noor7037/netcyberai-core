import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { jsonBody } from '@/lib/family/request';
import { FAMILY_CODE_COOKIE, familyCookieOptions, isFamilyShell, setFamilySessionCookie, verifyCodeStep } from '@/lib/family/session';
import { normalizeCode, signInWithCode } from '@/lib/family/sign-in';

// Step 2 of signing in (M1-2, C248): the code for the email of step 1. A right code opens the family's session (and
// makes the account on first sign-in); the app then opens in child mode, after the parent's first-time steps.
// Body {code, keepSignedIn}: "Keep me signed in" is on unless false, and always on in the Android app (F1-1, C257).
export async function POST(req: NextRequest) {
  const email = await verifyCodeStep(req.cookies.get(FAMILY_CODE_COOKIE)?.value);
  if (!email) return NextResponse.json({ error: 'start_again' }, { status: 400 });
  const body = await jsonBody(req);
  const code = normalizeCode(body.code);
  if (!code) return NextResponse.json({ error: 'wrong' }, { status: 400 });
  const result = await signInWithCode(email, code);
  if (result.status !== 'ok') return NextResponse.json({ error: result.status }, { status: result.status === 'wrong' ? 400 : 410 });
  const res = NextResponse.json({ status: 'signed_in' });
  const keep = isFamilyShell(req.headers.get('user-agent')) || body.keepSignedIn !== false;
  await setFamilySessionCookie(res, { accountId: result.accountId, tokenVersion: result.tokenVersion, sessionId: randomUUID(), keep });
  res.cookies.set(FAMILY_CODE_COOKIE, '', familyCookieOptions(0));
  return res;
}
