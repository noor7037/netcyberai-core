import { NextRequest, NextResponse } from 'next/server';
import { familyClaims } from '@/lib/family/db';
import { requireParent } from '@/lib/family/request';
import { openSchoolCertificate } from '@/lib/family/school';

// The certificate's PDF by a signed link (W21-M7): GET ?t=<ticket>. The ticket was made for this account, expires in ten
// minutes and works once. 404 for a ticket that is not ours, 410 for one that is expired, used or no longer ready, 503
// when the file cannot be read now (the link is then not spent).
export const dynamic = 'force-dynamic';

const PRIVATE = { 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' };

export async function GET(req: NextRequest) {
  const g = await requireParent(req);
  if (g.error) return g.error;
  const got = await openSchoolCertificate(familyClaims(g.session), req.nextUrl.searchParams.get('t'));
  if (got === 'bad') return NextResponse.json({ error: 'not_found' }, { status: 404, headers: PRIVATE });
  if (got === 'gone') return NextResponse.json({ error: 'gone' }, { status: 410, headers: PRIVATE });
  if (got === 'unavailable') return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: { ...PRIVATE, 'Retry-After': '60' } });
  return new NextResponse(Buffer.from(got.bytes), {
    status: 200,
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${got.fileName}"`, 'Content-Security-Policy': "default-src 'none'; sandbox", ...PRIVATE },
  });
}
