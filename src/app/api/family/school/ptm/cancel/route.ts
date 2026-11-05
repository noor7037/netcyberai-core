import { familyClaims } from '@/lib/family/db';
import { NextRequest, NextResponse } from 'next/server';
import { familyRead, jsonBody, requireParent } from '@/lib/family/request';
import { activeLinks, cancelSchoolPtm } from '@/lib/family/school';

// The parent cancels their own booking before the meeting (W20-E, H5): the time is free again and the teacher is told by
// email. Body: { linkId, bookingId }. As the link's guardian: only their own booking, not yet marked, still to come.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : null);

export async function POST(req: NextRequest) {
  const g = await requireParent(req);
  if (g.error) return g.error;
  const body = await jsonBody(req);
  const linkId = uuid(body.linkId);
  const bookingId = uuid(body.bookingId);
  if (!linkId || !bookingId) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const links = await familyRead(g.session, (db) => activeLinks(db, g.session.accountId));
  if (!links) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  if (!links.some((l) => l.linkId === linkId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const r = await cancelSchoolPtm(familyClaims(g.session), linkId, bookingId);
  if (r.ok) return NextResponse.json({ ok: true });
  return NextResponse.json({ error: r.reason }, { status: 404 });
}
