import { NextRequest, NextResponse } from 'next/server';
import { checkPin } from '@/lib/family/pin';
import { familyRun, jsonBody, requireFamily } from '@/lib/family/request';
import { FAMILY_PARENT_COOKIE, FAMILY_PARENT_TTL_SECONDS, familyCookieOptions, signParentMode } from '@/lib/family/session';

// Open the parent area with the PIN. A wrong PIN says only that it is wrong; after 5 the waits grow (1, 5, 15, 60
// minutes). Parent mode lasts 10 minutes and ends sooner with "Back to child mode".
export async function POST(req: NextRequest) {
  const pin = (await jsonBody(req)).pin;
  if (typeof pin !== 'string' || !/^[0-9]{6}$/.test(pin)) return NextResponse.json({ error: 'wrong' }, { status: 400 });
  const g = await requireFamily(req);
  if (g.error) return g.error;
  return familyRun(g.session, async (db) => {
    const r = await checkPin(db, g.session.accountId, pin);
    if (r.status === 'no_pin') return NextResponse.json({ error: 'no_pin' }, { status: 409 });
    if (r.status === 'wait') return NextResponse.json({ error: 'wait', minutes: r.minutes }, { status: 429 });
    if (r.status === 'wrong') return NextResponse.json({ error: 'wrong' }, { status: 400 });
    const res = NextResponse.json({ status: 'parent_mode' });
    res.cookies.set(FAMILY_PARENT_COOKIE, await signParentMode(g.session), familyCookieOptions(FAMILY_PARENT_TTL_SECONDS));
    return res;
  });
}
