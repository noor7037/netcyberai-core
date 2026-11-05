import { familyClaims } from '@/lib/family/db';
import { NextRequest, NextResponse } from 'next/server';
import { familyRead, requireParent } from '@/lib/family/request';
import { activeLinks, schoolCertificatesFor } from '@/lib/family/school';

// The certificate requests of a school child, for the parent area (W21-M7). GET ?linkId&studentId. In parent mode, for
// one of the account's own open links; read as that link's guardian, so the school's parent rules decide (the
// guardian's own child, the events of those requests). Words only: no names, no amounts.
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const g = await requireParent(req);
  if (g.error) return g.error;
  const linkId = req.nextUrl.searchParams.get('linkId') ?? '';
  const studentId = req.nextUrl.searchParams.get('studentId') ?? '';
  if (!UUID.test(linkId) || !UUID.test(studentId)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const links = await familyRead(g.session, (db) => activeLinks(db, g.session.accountId));
  if (!links) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  if (!links.some((l) => l.linkId === linkId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const requests = await schoolCertificatesFor(familyClaims(g.session), linkId, studentId);
  if (!requests) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ requests }, { headers: { 'Cache-Control': 'no-store' } });
}
