import { familyClaims } from '@/lib/family/db';
import { NextRequest, NextResponse } from 'next/server';
import { familyRead, jsonBody, requireParent } from '@/lib/family/request';
import { activeLinks, schoolFeesFor, schoolFeesPay } from '@/lib/family/school';

// A matched child's school fees (W20-A, H1), in the parent area, read as the guardian.
//   GET  ?childId=  the dues (with their concession) and total, the receipts, and the school's UPI set-up for paying
//   POST { childId } "Pay by UPI": the family's payment link at the school (made when there is none), its upi://pay
//        link and QR. Nothing is paid or credited here.
// Only for a family child the parent matched to a school student; anything else is not found.
export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : null);
const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(req: NextRequest) {
  const g = await requireParent(req);
  if (g.error) return g.error;
  const childId = uuid(req.nextUrl.searchParams.get('childId'));
  if (!childId) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const links = await familyRead(g.session, (db) => activeLinks(db, g.session.accountId));
  if (!links) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  const fees = await schoolFeesFor(familyClaims(g.session), links, childId);
  if (!fees) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ fees }, { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const g = await requireParent(req);
  if (g.error) return g.error;
  const childId = uuid((await jsonBody(req)).childId);
  if (!childId) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const links = await familyRead(g.session, (db) => activeLinks(db, g.session.accountId));
  if (!links) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  const pay = await schoolFeesPay(familyClaims(g.session), links, childId);
  if (!pay) return NextResponse.json({ error: 'not_offered' }, { status: 409 });
  return NextResponse.json({ pay }, { headers: NO_STORE });
}
