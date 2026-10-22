import { NextRequest, NextResponse } from 'next/server';
import { accountSummary, signOutEverywhere } from '@/lib/family/account';
import { pinProblem, setPin } from '@/lib/family/pin';
import { familyRun, jsonBody, requireFamily } from '@/lib/family/request';
import { FAMILY_PARENT_COOKIE, FAMILY_PARENT_TTL_SECONDS, familyCookieOptions, setFamilySessionCookie, signParentMode } from '@/lib/family/session';
import { normalizeCode, redeemPinResetCode } from '@/lib/family/sign-in';

// A new PIN with the code from the parent's email. Every other phone signed in to the family is signed out (F1-1,
// C257: a PIN change ends the other sessions); this one gets a new token and stays.
export async function POST(req: NextRequest) {
  const body = await jsonBody(req);
  const code = normalizeCode(body.code);
  const problem = pinProblem(body.pin);
  if (!code) return NextResponse.json({ error: 'wrong' }, { status: 400 });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const g = await requireFamily(req);
  if (g.error) return g.error;
  return familyRun(g.session, async (db) => {
    const account = await accountSummary(db, g.session.accountId);
    if (!account) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
    const r = await redeemPinResetCode(db, account.email, code);
    if (r !== 'ok') return NextResponse.json({ error: r }, { status: r === 'wrong' ? 400 : 410 });
    await setPin(db, g.session.accountId, String(body.pin));
    await signOutEverywhere(db, g.session.accountId);
    const { rows } = await db.query(`select token_version from family.accounts where account_id = $1`, [g.session.accountId]);
    const res = NextResponse.json({ status: 'set' });
    await setFamilySessionCookie(res, { ...g.session, tokenVersion: Number(rows[0].token_version) });
    res.cookies.set(FAMILY_PARENT_COOKIE, await signParentMode(g.session), familyCookieOptions(FAMILY_PARENT_TTL_SECONDS));
    return res;
  });
}
