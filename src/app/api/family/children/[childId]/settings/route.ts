import { NextRequest, NextResponse } from 'next/server';
import { checkParentSettingsPatch, saveChildSettings } from '@/lib/family/child-settings';
import { familyRun, jsonBody, requireParent } from '@/lib/family/request';

// v21: the parent's settings for one child (today only `autoPlay`, a fresh tutor answer read aloud by itself). The
// parent's, in parent mode (the PIN); kept in the child's settings object (family.child_settings.settings), so the
// child's screens read it with the rest. A child the account does not have is not found.
export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest, { params }: { params: { childId: string } }) {
  if (!UUID.test(params.childId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const patch = checkParentSettingsPatch(await jsonBody(req));
  if (!patch) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const g = await requireParent(req);
  if (g.error) return g.error;
  return familyRun(g.session, async (db) => {
    const saved = await saveChildSettings(db, g.session.accountId, params.childId, patch);
    if (saved === 'not_found') return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ autoPlay: saved.autoPlay });
  });
}
