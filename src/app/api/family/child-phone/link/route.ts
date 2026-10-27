import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { CHILD_LINK_COOKIE, CHILD_LINK_COOKIE_PATH, LINK_CODE_MINUTES, childPhonesOffered, claimChildLink, startChildLink } from '@/lib/family/child-phone';
import { withFamilyGate } from '@/lib/family/db';
import { jsonBody } from '@/lib/family/request';
import { FAMILY_CHILD_COOKIE, FAMILY_PARENT_COOKIE, familyCookieOptions, setFamilySessionCookie } from '@/lib/family/session';
import { clientAddress } from '@/lib/family/sign-in';

// A child's own phone links itself (M2b-2; reversed by C230-AF, C346; docs/34 §9.4). No session yet. Body:
//   { action: 'start' }  a six-digit code to show, for ten minutes; the phone's claim goes in its own cookie, sent only
//                        here. Only while children's own phones are open to anyone (the Focus Lock's switch).
//   { action: 'check' }  with that cookie: "waiting" until the parent has typed the code in the parent area; then the
//                        phone is linked to that one child and its session opens, kept signed in, in child mode (any
//                        parent mode on the phone is closed). A claim that is used, old or unknown is "gone".
const claimCookie = (value: string, maxAge: number) => ({ name: CHILD_LINK_COOKIE, value, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' as const, path: CHILD_LINK_COOKIE_PATH, maxAge });

export async function POST(req: NextRequest) {
  const body = await jsonBody(req);
  if (body.action === 'start') {
    const r = await withFamilyGate(async (db) => ((await childPhonesOffered(db)) ? startChildLink(db, clientAddress(req.headers) ?? '') : ({ ok: false, reason: 'off' } as const)));
    if (!r.ok) return NextResponse.json({ error: r.reason }, { status: r.reason === 'off' ? 403 : 429 });
    const res = NextResponse.json({ code: r.code, expiresAt: r.expiresAt });
    res.cookies.set(claimCookie(r.claim, (LINK_CODE_MINUTES + 10) * 60));
    return res;
  }
  if (body.action === 'check') {
    const r = await withFamilyGate((db) => claimChildLink(db, req.cookies.get(CHILD_LINK_COOKIE)?.value));
    if (r.status === 'waiting') return NextResponse.json({ status: 'waiting' });
    if (r.status === 'gone') {
      const gone = NextResponse.json({ error: 'gone' }, { status: 410 });
      gone.cookies.set(claimCookie('', 0));
      return gone;
    }
    const res = NextResponse.json({ status: 'linked' });
    await setFamilySessionCookie(res, { accountId: r.accountId, tokenVersion: r.tokenVersion, sessionId: randomUUID(), keep: true, device: { deviceId: r.deviceId, childId: r.childId } });
    res.cookies.set(FAMILY_CHILD_COOKIE, r.childId, familyCookieOptions(180 * 24 * 60 * 60));
    res.cookies.set(FAMILY_PARENT_COOKIE, '', familyCookieOptions(0));
    res.cookies.set(claimCookie('', 0));
    return res;
  }
  return NextResponse.json({ error: 'bad_request' }, { status: 400 });
}
