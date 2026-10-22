import { NextRequest, NextResponse } from 'next/server';
import { activeChild, listChildren } from '@/lib/family/children';
import { openLadder, sealLadder, step, viewOf } from '@/lib/family/homework';
import { familyRun, jsonBody, requireFamily } from '@/lib/family/request';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';

// One step of the homework helper's ladder (M2-6, C280): POST { token, action: 'hint' | 'attempt' | 'stuck', answer? }.
// The next hint is earned by an attempt; "I'm stuck" opens the worked steps after every hint or two tries; the final
// answer is never sent, only whether the child's own answer matches it. The child's answer is not kept. Each step
// answers with a new token.
export async function POST(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const body = await jsonBody(req);
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  return familyRun(g.session, async (db) => {
    const child = activeChild(await listChildren(db, g.session.accountId), chosen);
    const ladder = child ? openLadder(body.token, { accountId: g.session.accountId, childId: child.childId }) : null;
    if (!ladder) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const r = step(ladder, body.action, body.answer);
    if (!r.ok) return NextResponse.json({ error: r.reason }, { status: r.reason === 'not_yet' ? 409 : 400 });
    return NextResponse.json({ token: sealLadder(r.ladder), view: viewOf(r.ladder), result: r.result ?? null });
  });
}
