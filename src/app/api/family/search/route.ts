import { NextRequest, NextResponse } from 'next/server';
import { familyRun, requireFamily } from '@/lib/family/request';
import { searchStudy } from '@/lib/family/search';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';
import { tutorChild } from '@/lib/family/tutor';

// The search in Study (W22-S1): GET ?q= answers the subjects, chapters and topics of the child's own board and class that
// match, each with where it opens. The child is the one this phone chose, never one the request names; nothing is stored.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const q = req.nextUrl.searchParams.get('q') ?? '';
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  return familyRun(g.session, async (db) => {
    const who = await tutorChild(db, g.session.accountId, chosen);
    if (!who.ok) return NextResponse.json({ error: who.error }, { status: who.status });
    const hits = await searchStudy(db, who.child, who.child.language, q);
    return NextResponse.json({ hits }, { headers: { 'Cache-Control': 'no-store' } });
  });
}
