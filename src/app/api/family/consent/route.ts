import { NextRequest, NextResponse } from 'next/server';
import { M1_PURPOSES, consentState, isFamilyPurpose, recordParentTap } from '@/lib/family/consent';
import { accountSummary } from '@/lib/family/account';
import { familyRun, jsonBody, requireFamily, requireParent } from '@/lib/family/request';

// The parent's tap on a consent (M1-2, C248). Body: { purpose, granted, tap: true }. `tap` must be the literal true the
// screen sends from the parent's own button: nothing records consent on its own. The very first study_core grant
// comes before the PIN exists (sign-up); every later change, and every withdrawal, needs parent mode.
export async function POST(req: NextRequest) {
  const body = await jsonBody(req);
  if (body.tap !== true || !isFamilyPurpose(body.purpose) || !M1_PURPOSES.includes(body.purpose) || typeof body.granted !== 'boolean') {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const purpose = body.purpose;
  const granted = body.granted;
  const g = await requireFamily(req);
  if (g.error) return g.error;
  return familyRun(g.session, async (db) => {
    const account = await accountSummary(db, g.session.accountId);
    const firstGrant = !account?.hasPin && granted && purpose === 'study_core';
    if (!firstGrant) {
      const p = await requireParent(req);
      if (p.error) return p.error;
    }
    await recordParentTap(db, g.session.accountId, purpose, granted);
    return NextResponse.json({ consents: await consentState(db, g.session.accountId) });
  });
}
