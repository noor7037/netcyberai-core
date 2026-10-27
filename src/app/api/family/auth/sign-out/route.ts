import { NextRequest, NextResponse } from 'next/server';
import { signOutEverywhere } from '@/lib/family/account';
import { removeChildPhone } from '@/lib/family/child-phone';
import { clearFamilyCookies, familyRun, jsonBody, requireFamily, requireParent } from '@/lib/family/request';

// Sign out on this phone; or, from the parent area, on every phone (the account's token_version moves on). A child's own
// phone that signs out is unlinked too (C342): it needs a new code from the parent to come back.
export async function POST(req: NextRequest) {
  const everywhere = (await jsonBody(req)).everywhere === true;
  if (!everywhere) {
    const g = await requireFamily(req);
    const device = g.session?.device;
    if (g.session && device) await familyRun(g.session, async (db) => (await removeChildPhone(db, g.session.accountId, device.deviceId), NextResponse.json({}))).catch(() => undefined);
    return clearFamilyCookies(NextResponse.json({ status: 'signed_out' }));
  }
  const g = await requireParent(req);
  if (g.error) return g.error;
  const res = await familyRun(g.session, async (db) => {
    await signOutEverywhere(db, g.session.accountId);
    return NextResponse.json({ status: 'signed_out_everywhere' });
  });
  return clearFamilyCookies(res);
}
