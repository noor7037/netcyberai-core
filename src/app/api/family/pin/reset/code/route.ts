import { NextRequest, NextResponse } from 'next/server';
import { accountSummary } from '@/lib/family/account';
import { clearFamilyCookies, familyRead, jsonBody, requireFamily } from '@/lib/family/request';
import { clientAddress, requestCode } from '@/lib/family/sign-in';
import { isLang } from '@/lib/i18n';

// Forgot the PIN: a code goes to the parent's own email (the account's), never to an address typed here.
export async function POST(req: NextRequest) {
  const body = await jsonBody(req);
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const account = await familyRead(g.session, (db) => accountSummary(db, g.session.accountId));
  if (!account) return clearFamilyCookies(NextResponse.json({ error: 'not_signed_in' }, { status: 401 }));
  const result = await requestCode({ email: account.email, purpose: 'pin_reset', ip: clientAddress(req.headers), lang: isLang(body.lang) ? body.lang : account.uiLanguage });
  if (result.status === 'rate_limited') return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  if (result.status === 'email_unavailable') return NextResponse.json({ error: 'email_unavailable' }, { status: 503 });
  return NextResponse.json({ status: 'sent' });
}
