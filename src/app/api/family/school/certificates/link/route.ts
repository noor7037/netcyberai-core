import { familyClaims } from '@/lib/family/db';
import { NextRequest, NextResponse } from 'next/server';
import { familyRead, jsonBody, requireParent } from '@/lib/family/request';
import { activeLinks, schoolCertificateLink } from '@/lib/family/school';

// A signed link to the PDF of a ready certificate (W21-M7). Body: { linkId, requestId }. The link expires in ten
// minutes and opens the file once (../file). 404 for anything that is not the guardian's own child's ready request.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : null);

export async function POST(req: NextRequest) {
  const g = await requireParent(req);
  if (g.error) return g.error;
  const body = await jsonBody(req);
  const linkId = uuid(body.linkId);
  const requestId = uuid(body.requestId);
  if (!linkId || !requestId) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const links = await familyRead(g.session, (db) => activeLinks(db, g.session.accountId));
  if (!links) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  if (!links.some((l) => l.linkId === linkId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const link = await schoolCertificateLink(familyClaims(g.session), linkId, requestId);
  if (!link) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(link, { headers: { 'Cache-Control': 'no-store' } });
}
