import { NextRequest, NextResponse } from 'next/server';
import { jsonBody } from '@/lib/family/request';
import { FAMILY_CODE_COOKIE, FAMILY_CODE_TTL_SECONDS, familyCookieOptions, signCodeStep } from '@/lib/family/session';
import { clientAddress, normalizeFamilyEmail, requestCode } from '@/lib/family/sign-in';
import { isLang } from '@/lib/i18n';

// Step 1 of signing in (M1-2, C248): send a one-time code to this email. The answer is the same whether or not an
// account exists. The email rides to step 2 in a signed, short-lived cookie.
export async function POST(req: NextRequest) {
  const body = await jsonBody(req);
  const email = normalizeFamilyEmail(body.email);
  if (!email) return NextResponse.json({ error: 'email' }, { status: 400 });
  const lang = isLang(body.lang) ? body.lang : 'en';
  const result = await requestCode({ email, purpose: 'sign_in', ip: clientAddress(req.headers), lang });
  if (result.status === 'rate_limited') return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  if (result.status === 'email_unavailable') return NextResponse.json({ error: 'email_unavailable' }, { status: 503 });
  const res = NextResponse.json({ status: 'sent' });
  res.cookies.set(FAMILY_CODE_COOKIE, await signCodeStep(email), familyCookieOptions(FAMILY_CODE_TTL_SECONDS));
  return res;
}
