import { familyClaims } from '@/lib/family/db';
import { NextRequest, NextResponse } from 'next/server';
import { familyRead, jsonBody, requireParent } from '@/lib/family/request';
import { activeLinks, schoolFeesClaim } from '@/lib/family/school';

// "I have paid" (W20-A, H1): POST { childId, utr }. The parent paid the school's UPI ID from their own UPI app and gives
// the 12-digit UTR. It is recorded as the school's own claim (the payer's page does the same, C174): the school finds the
// money in its own bank before anything is credited or a receipt is made. There is no screenshot or file field.
export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const g = await requireParent(req);
  if (g.error) return g.error;
  const body = await jsonBody(req);
  const childId = typeof body.childId === 'string' && UUID.test(body.childId) ? body.childId : null;
  const utr = typeof body.utr === 'string' && body.utr.length <= 40 ? body.utr : null;
  if (!childId || utr === null) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const links = await familyRead(g.session, (db) => activeLinks(db, g.session.accountId));
  if (!links) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  const result = await schoolFeesClaim(familyClaims(g.session), links, childId, utr);
  if (result === 'recorded') return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json({ error: result }, { status: result === 'not_found' ? 404 : result === 'utr' ? 400 : 409 });
}
