import { NextRequest, NextResponse } from 'next/server';
import { familyRun, requireFamily } from '@/lib/family/request';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';
import { isSubject } from '@/lib/family/subjects';
import { readTurns, tutorChild } from '@/lib/family/tutor';

// The shared tutor window's conversation (S2, C375): GET ?subject=<id> → { turns }, the last turns of the child using
// the app now in that subject, oldest first. The child is the one this phone chose, never one the request names: a
// sibling's conversation is never read here.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const subject = req.nextUrl.searchParams.get('subject');
  if (!isSubject(subject)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  return familyRun(g.session, async (db) => {
    const who = await tutorChild(db, g.session.accountId, chosen);
    if (!who.ok) return NextResponse.json({ error: who.error }, { status: who.status });
    const res = NextResponse.json({ turns: await readTurns(db, g.session.accountId, who.child.childId, subject) });
    res.headers.set('Cache-Control', 'no-store');
    return res;
  });
}
