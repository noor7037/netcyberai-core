import { familyClaims } from '@/lib/family/db';
import { NextRequest, NextResponse } from 'next/server';
import { familyRead, jsonBody, requireParent } from '@/lib/family/request';
import { activeLinks, requestSchoolCertificate } from '@/lib/family/school';

// The parent asks for a certificate for their child (W21-M7). Body: { linkId, studentId, kind, reason }. As the link's
// guardian: the school's parent rules decide whose child it may be. 400 bad words, 409 the same request is already
// open, 404 anything not theirs.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : null);

export async function POST(req: NextRequest) {
  const g = await requireParent(req);
  if (g.error) return g.error;
  const body = await jsonBody(req);
  const linkId = uuid(body.linkId);
  const studentId = uuid(body.studentId);
  if (!linkId || !studentId) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const links = await familyRead(g.session, (db) => activeLinks(db, g.session.accountId));
  if (!links) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  if (!links.some((l) => l.linkId === linkId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const r = await requestSchoolCertificate(familyClaims(g.session), linkId, { studentId, kind: body.kind, reason: body.reason });
  if (r.ok) return NextResponse.json({ ok: true, requestId: r.requestId }, { status: 201 });
  const status = r.reason === 'not_found' || r.reason === 'not_allowed' ? 404 : r.reason === 'duplicate' ? 409 : 400;
  return NextResponse.json({ error: r.reason }, { status });
}
