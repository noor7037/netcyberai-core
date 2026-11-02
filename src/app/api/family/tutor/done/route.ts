import { NextRequest, NextResponse } from 'next/server';
import { endSession } from '@/lib/family/quiz';
import { familyRun, jsonBody, requireFamily } from '@/lib/family/request';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';
import { tutorChild } from '@/lib/family/tutor';

// "Done for now" on the Study feed, or the end of a call (W16-B1): the child's own chat is marked as a session that ended, so
// its quick quiz is made within minutes instead of after ten quiet minutes. The child is the one this phone chose; a chat
// that is not theirs, or has no turn yet, changes nothing (the answer is the same).
//   POST { chatId } → { ok: true }
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const body = await jsonBody(req);
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  return familyRun(g.session, async (db) => {
    const who = await tutorChild(db, g.session.accountId, chosen);
    if (!who.ok) return NextResponse.json({ error: who.error }, { status: who.status });
    await endSession(db, { accountId: g.session.accountId, childId: who.child.childId }, body.chatId);
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  });
}
