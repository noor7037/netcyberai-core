import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/require-session';
import { signOutEverywhere } from '@/lib/auth/account';
import { ACCESS_COOKIE, REFRESH_COOKIE, DEVICE_COOKIE } from '@/lib/auth/cookies';
import { TOURS_COOKIE } from '@/lib/contracts/tours';
import { LANG_COOKIE } from '@/lib/i18n';

// "Sign out on all devices" (C90): every session and remembered device of
// the signed-in user, this one included.
export async function POST(req: NextRequest) {
  const claims = await requireSession(req);
  if (!claims) return NextResponse.json({ error: 'session_expired' }, { status: 401 });
  if (claims.impersonation) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const signedOut = await signOutEverywhere(claims.sub);
  const res = NextResponse.json({ status: 'ok', signedOut });
  res.cookies.delete(ACCESS_COOKIE);
  res.cookies.delete(REFRESH_COOKIE);
  res.cookies.delete(DEVICE_COOKIE);
  res.cookies.delete(LANG_COOKIE);
  res.cookies.delete(TOURS_COOKIE);
  return res;
}
