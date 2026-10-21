import { NextRequest, NextResponse } from 'next/server';
import { signOutEverywhere } from '@/lib/family/account';
import { clearFamilyCookies, familyRun, jsonBody, requireParent } from '@/lib/family/request';

// Sign out on this phone; or, from the parent area, on every phone (the account's token_version moves on).
export async function POST(req: NextRequest) {
  const everywhere = (await jsonBody(req)).everywhere === true;
  if (!everywhere) return clearFamilyCookies(NextResponse.json({ status: 'signed_out' }));
  const g = await requireParent(req);
  if (g.error) return g.error;
  const res = await familyRun(g.session, async (db) => {
    await signOutEverywhere(db, g.session.accountId);
    return NextResponse.json({ status: 'signed_out_everywhere' });
  });
  return clearFamilyCookies(res);
}
