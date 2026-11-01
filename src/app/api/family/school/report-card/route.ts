import { NextRequest, NextResponse } from 'next/server';
import { familyClaims } from '@/lib/family/db';
import { activeChild, listChildren } from '@/lib/family/children';
import { familyRead, requireFamily } from '@/lib/family/request';
import { activeLinks, ReportCardUnavailableError, schoolReportCardFor } from '@/lib/family/school';
import { FAMILY_CHILD_COOKIE, FAMILY_PARENT_COOKIE, verifyParentMode } from '@/lib/family/session';

// "Get report card" (W14-F): a child's report card of one published exam, the PDF the school made when it published the
// class, for the Family app. GET ?child=<family child id>&exam=<exam id>. In the family's own session: the child must
// be this account's own and matched to a school student under one of its links, and the card is read as that link's
// guardian, so the school's row rules decide (guardian_report_cards(): the guardian's own consented child, a publication
// in force). In the child's own view (no parent mode), only the child using the app now, and only while the school
// lets children see their results. Anything else is the same 404.
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE = { 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
const NOT_FOUND = () => NextResponse.json({ error: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store', ...PRIVATE } });

export async function GET(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const childId = req.nextUrl.searchParams.get('child') ?? '';
  const examId = req.nextUrl.searchParams.get('exam') ?? '';
  if (!UUID.test(childId) || !UUID.test(examId)) return NOT_FOUND();
  const parent = await verifyParentMode(req.cookies.get(FAMILY_PARENT_COOKIE)?.value, g.session);
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  const read = await familyRead(g.session, async (db) => ({
    links: await activeLinks(db, g.session.accountId),
    child: parent ? null : activeChild(await listChildren(db, g.session.accountId), chosen),
  }));
  if (!read) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  if (!parent && read.child?.childId !== childId) return NOT_FOUND();
  let file: { bytes: Uint8Array; fileName: string } | null;
  try {
    file = await schoolReportCardFor(familyClaims(g.session), read.links, childId, examId, { childView: !parent });
  } catch (e) {
    if (e instanceof ReportCardUnavailableError) return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60', ...PRIVATE } });
    throw e;
  }
  if (!file) return NOT_FOUND();
  return new NextResponse(Buffer.from(file.bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${file.fileName}"`,
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, no-store',
      ...PRIVATE,
    },
  });
}
