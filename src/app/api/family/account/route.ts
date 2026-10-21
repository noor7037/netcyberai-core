import { NextRequest, NextResponse } from 'next/server';
import { deleteAccount } from '@/lib/family/account';
import { clearFamilyCookies, familyRun, jsonBody, requireParent } from '@/lib/family/request';

// Delete the family's account (DPDP erasure): every family row of it goes, in one transaction. The parent confirms by
// typing the word the screen asks for, in parent mode.
export async function DELETE(req: NextRequest) {
  if ((await jsonBody(req)).confirm !== 'DELETE') return NextResponse.json({ error: 'confirm' }, { status: 400 });
  const g = await requireParent(req);
  if (g.error) return g.error;
  const res = await familyRun(g.session, async (db) =>
    (await deleteAccount(db, g.session.accountId)) ? NextResponse.json({ status: 'deleted' }) : NextResponse.json({ error: 'not_found' }, { status: 404 })
  );
  return res.status === 200 ? clearFamilyCookies(res) : res;
}
