import { familyClaims } from '@/lib/family/db';
import { NextRequest, NextResponse } from 'next/server';
import { familyRead, jsonBody, requireParent } from '@/lib/family/request';
import { activeLinks, bookSchoolPtm, ptmNotifyFor } from '@/lib/family/school';

// The parent books a time with a teacher of their child (W20-E, H5). Body: { linkId, studentId, slotId }. As the link's
// guardian: the school's parent rules and the unique slot decide. taken (someone else has it), already_booked (this
// guardian has a time with that teacher), not_open (the meeting is over), not_found (anything not theirs to book).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : null);

export async function POST(req: NextRequest) {
  const g = await requireParent(req);
  if (g.error) return g.error;
  const body = await jsonBody(req);
  const linkId = uuid(body.linkId);
  const studentId = uuid(body.studentId);
  const slotId = uuid(body.slotId);
  if (!linkId || !studentId || !slotId) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const read = await familyRead(g.session, async (db) => ({ links: await activeLinks(db, g.session.accountId), notify: await ptmNotifyFor(db, g.session.accountId) }));
  if (!read) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  if (!read.links.some((l) => l.linkId === linkId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const r = await bookSchoolPtm(familyClaims(g.session), linkId, { studentId, slotId }, read.notify);
  if (r.ok) return NextResponse.json({ ok: true, bookingId: r.bookingId, heldOn: r.heldOn, time: r.time, teacher: r.teacher, emailed: read.notify.email !== null });
  return NextResponse.json({ error: r.reason }, { status: r.reason === 'not_found' ? 404 : 409 });
}
