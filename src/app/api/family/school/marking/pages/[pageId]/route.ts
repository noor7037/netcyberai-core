import { NextRequest, NextResponse } from 'next/server';
import { activeChild, listChildren } from '@/lib/family/children';
import { familyRead, requireFamily } from '@/lib/family/request';
import { activeLinks, PictureUnavailableError, schoolPagePicture } from '@/lib/family/school';
import { FAMILY_CHILD_COOKIE, FAMILY_PARENT_COOKIE, verifyParentMode } from '@/lib/family/session';

// A page picture of a child's checked answer sheet (C351), for the Family app. In the family's own session: the page
// is looked for under each of the family's school links, for that link's matched children only, and its row is read as
// the guardian, so the school's row rules decide (the child's own approved script of a publication in force, while the
// school lets families see the checked sheets). In the child's own view (no parent mode), only the child using the app
// now, and only while the school lets children see their results. Anything else is the same 404.
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE = { 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
const NOT_FOUND = () => NextResponse.json({ error: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store', ...PRIVATE } });

export async function GET(req: NextRequest, { params }: { params: { pageId: string } }) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  if (!UUID.test(params.pageId)) return NOT_FOUND();
  const parent = await verifyParentMode(req.cookies.get(FAMILY_PARENT_COOKIE)?.value, g.session);
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  const read = await familyRead(g.session, async (db) => ({
    links: await activeLinks(db, g.session.accountId),
    child: parent ? null : activeChild(await listChildren(db, g.session.accountId), chosen),
  }));
  if (!read) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  if (!parent && !read.child) return NOT_FOUND();
  let bytes: Uint8Array | null;
  try {
    bytes = await schoolPagePicture({ accountId: g.session.accountId, tokenVersion: g.session.tokenVersion }, read.links, params.pageId, { childId: parent ? null : read.child!.childId });
  } catch (e) {
    if (e instanceof PictureUnavailableError) return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60', ...PRIVATE } });
    throw e;
  }
  if (!bytes) return NOT_FOUND();
  return new NextResponse(Buffer.from(bytes), { status: 200, headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=300', ...PRIVATE } });
}
