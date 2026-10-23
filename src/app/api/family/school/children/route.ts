import { NextRequest, NextResponse } from 'next/server';
import { familyRun, jsonBody, requireParent } from '@/lib/family/request';
import { linkedSchool, setChildLinks } from '@/lib/family/school';

// Which family child is which school child (C230-AA): the parent chooses for each school child, or leaves it unlinked.
// Body: { linkId, pairs: [{ studentId, childId | null }] }. The school's children are read first, as the guardian, so a
// student id the school did not show this guardian is refused.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const g = await requireParent(req);
  if (g.error) return g.error;
  const body = await jsonBody(req);
  const linkId = typeof body.linkId === 'string' && UUID.test(body.linkId) ? body.linkId : null;
  const raw = Array.isArray(body.pairs) ? body.pairs : null;
  if (!linkId || !raw || raw.length > 20) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const pairs: { studentId: string; childId: string | null }[] = [];
  for (const p of raw) {
    const x = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
    if (typeof x.studentId !== 'string' || !UUID.test(x.studentId)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    if (x.childId !== null && (typeof x.childId !== 'string' || !UUID.test(x.childId))) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    pairs.push({ studentId: x.studentId, childId: (x.childId as string | null) ?? null });
  }
  const school = await linkedSchool({ accountId: g.session.accountId, tokenVersion: g.session.tokenVersion }, linkId);
  if (!school) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return familyRun(g.session, async (db) => {
    const r = await setChildLinks(db, g.session.accountId, linkId, school.children.map((c) => c.studentId), pairs);
    if (!r.ok) return NextResponse.json({ error: r.reason }, { status: r.reason === 'not_found' ? 404 : 400 });
    return NextResponse.json({ ok: true });
  });
}
