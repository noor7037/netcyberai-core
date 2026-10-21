import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { jsonBody } from '@/lib/family/request';
import { FAMILY_CODE_COOKIE, FAMILY_SESSION_COOKIE, FAMILY_SESSION_TTL_SECONDS, familyCookieOptions, signFamilySession, verifyCodeStep } from '@/lib/family/session';
import { normalizeCode, signInWithCode } from '@/lib/family/sign-in';

// Step 2 of signing in (M1-2, C248): the code for the email of step 1. A right code opens the family's session (and
// makes the account on first sign-in); the app then opens in child mode, after the parent's first-time steps.
export async function POST(req: NextRequest) {
  const email = await verifyCodeStep(req.cookies.get(FAMILY_CODE_COOKIE)?.value);
  if (!email) return NextResponse.json({ error: 'start_again' }, { status: 400 });
  const code = normalizeCode((await jsonBody(req)).code);
  if (!code) return NextResponse.json({ error: 'wrong' }, { status: 400 });
  const result = await signInWithCode(email, code);
  if (result.status !== 'ok') return NextResponse.json({ error: result.status }, { status: result.status === 'wrong' ? 400 : 410 });
  const res = NextResponse.json({ status: 'signed_in' });
  res.cookies.set(FAMILY_SESSION_COOKIE, await signFamilySession({ accountId: result.accountId, tokenVersion: result.tokenVersion, sessionId: randomUUID() }), familyCookieOptions(FAMILY_SESSION_TTL_SECONDS));
  res.cookies.set(FAMILY_CODE_COOKIE, '', familyCookieOptions(0));
  return res;
}
