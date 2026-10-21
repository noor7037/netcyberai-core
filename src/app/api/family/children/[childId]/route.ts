import { NextRequest, NextResponse } from 'next/server';
import { checkChild, removeChild, updateChild } from '@/lib/family/children';
import { familyRun, jsonBody, requireParent } from '@/lib/family/request';

// Change or remove a child: the parent's, in parent mode. Removing a child removes its answers and progress.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest, { params }: { params: { childId: string } }) {
  if (!UUID.test(params.childId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const checked = checkChild(await jsonBody(req));
  if (!checked.ok) return NextResponse.json({ error: 'invalid', problems: checked.problems }, { status: 400 });
  const g = await requireParent(req);
  if (g.error) return g.error;
  return familyRun(g.session, async (db) => {
    const child = await updateChild(db, g.session.accountId, params.childId, checked.child);
    return child ? NextResponse.json({ child }) : NextResponse.json({ error: 'not_found' }, { status: 404 });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { childId: string } }) {
  if (!UUID.test(params.childId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const g = await requireParent(req);
  if (g.error) return g.error;
  return familyRun(g.session, async (db) =>
    (await removeChild(db, g.session.accountId, params.childId)) ? NextResponse.json({ status: 'removed' }) : NextResponse.json({ error: 'not_found' }, { status: 404 })
  );
}
