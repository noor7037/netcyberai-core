import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { redeemLinkCode } from '@/lib/family/child-phone';
import { withFamilyGate } from '@/lib/family/db';
import { jsonBody } from '@/lib/family/request';
import { FAMILY_CHILD_COOKIE, FAMILY_PARENT_COOKIE, familyCookieOptions, setFamilySessionCookie } from '@/lib/family/session';
import { clientAddress } from '@/lib/family/sign-in';

// A child's own phone enters the parent's code (M2b-2, C342; docs/34 §9.4). Body: { code }. A right code links the phone
// to that one child and opens its session, kept signed in, in child mode; any parent mode on the phone is closed. A wrong,
// used or old code says only "wrong"; too many tries from one network (or in all) say "too_many".
export async function POST(req: NextRequest) {
  const body = await jsonBody(req);
  const r = await withFamilyGate((db) => redeemLinkCode(db, body.code, clientAddress(req.headers) ?? ''));
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: r.reason === 'too_many' ? 429 : 400 });
  const res = NextResponse.json({ status: 'linked' });
  await setFamilySessionCookie(res, { accountId: r.accountId, tokenVersion: r.tokenVersion, sessionId: randomUUID(), keep: true, device: { deviceId: r.deviceId, childId: r.childId } });
  res.cookies.set(FAMILY_CHILD_COOKIE, r.childId, familyCookieOptions(180 * 24 * 60 * 60));
  res.cookies.set(FAMILY_PARENT_COOKIE, '', familyCookieOptions(0));
  return res;
}
