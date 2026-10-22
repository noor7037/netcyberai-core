import { NextRequest, NextResponse } from 'next/server';
import { activeChild, listChildren } from '@/lib/family/children';
import { familyRun, requireFamily, requireParent } from '@/lib/family/request';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';
import { answerKey, loadWorksheet, screenItems } from '@/lib/family/worksheet';

// A worksheet (M2-4, C278): GET ?key=<topic or chapter key> is the practice set for the child using the app, items
// sealed like any practice item (answered through POST /api/family/check). GET ?key=…&view=key is the answer key: it
// needs parent mode (the parent PIN), so a child-mode request never gets an answer from here.
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key') ?? '';
  const wantKey = req.nextUrl.searchParams.get('view') === 'key';
  const g = wantKey ? await requireParent(req) : await requireFamily(req);
  if (g.error) return g.error;
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  return familyRun(g.session, async (db) => {
    const child = activeChild(await listChildren(db, g.session.accountId), chosen);
    if (!child) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const w = await loadWorksheet(db, { accountId: g.session.accountId, child }, key);
    if (w.state === 'not_found') return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (w.state === 'off') return NextResponse.json({ error: 'not_switched_on' }, { status: 403 });
    if (w.state === 'not_open') return NextResponse.json({ error: 'not_open' }, { status: 403 });
    if (w.state === 'none') return NextResponse.json({ state: 'none' });
    if (wantKey) return NextResponse.json({ state: 'ok', key: answerKey(w) });
    return NextResponse.json(screenItems(w, { accountId: g.session.accountId, childId: child.childId }));
  });
}
