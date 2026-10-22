import { NextRequest, NextResponse } from 'next/server';
import { activeChild, listChildren } from '@/lib/family/children';
import { openItem } from '@/lib/family/items';
import { recordAnswer } from '@/lib/family/learning';
import { dayLabel } from '@/lib/family/plan';
import { indiaDate } from '@/lib/time/india';
import { familyRun, jsonBody, requireFamily } from '@/lib/family/request';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';

// A check or practice item (M1-5, C251): POST { token, hint: true } gives the hint first; POST { token, choice } checks
// the answer on the server (the phone never holds the key), records it (progress moves only on checked answers, M1-6),
// and says why, or what that wrong option shows.
export async function POST(req: NextRequest) {
  const body = await jsonBody(req);
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  return familyRun(g.session, async (db) => {
    const child = activeChild(await listChildren(db, g.session.accountId), chosen);
    const item = child ? openItem(body.token, { accountId: g.session.accountId, childId: child.childId }) : null;
    if (!item) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (body.hint === true) return NextResponse.json({ hint: item.h });
    const choice = Number(body.choice);
    if (!Number.isInteger(choice) || choice < 0 || choice >= item.w.length) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    // Recorded as checked: the only way progress moves (M1-6).
    const { correct, revisitOn } = await recordAnswer(db, { accountId: g.session.accountId, childId: child!.childId, item, choice, hintUsed: body.hintUsed === true, day: indiaDate() });
    // A wrong answer also says when the topic comes back (M2-2), so the child knows it is not the end of it.
    const revisitDay = revisitOn ? dayLabel(revisitOn, child!.language) : null;
    return NextResponse.json({ correct, explanation: correct ? item.y : item.w[choice] || item.y, answer: correct ? choice : null, revisitOn, revisitDay });
  });
}
