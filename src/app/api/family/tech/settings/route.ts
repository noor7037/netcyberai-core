import { NextRequest, NextResponse } from 'next/server';
import { listChildren } from '@/lib/family/children';
import { readFamilySwitches, switchOn } from '@/lib/family/flags';
import { familyRun, jsonBody, requireParent } from '@/lib/family/request';
import { cleanSettings, saveTechSettings } from '@/lib/family/tech/settings';

// The parent's Tech & AI Lab choices for one child (C557), in parent mode only (the English course's settings route):
// POST { childId, courseClass: -2..12 | null, strandsOff: [topic area ids] }. At least one topic area stays on.
export async function POST(req: NextRequest) {
  const body = await jsonBody(req);
  const childId = typeof body.childId === 'string' ? body.childId : '';
  if (!/^[0-9a-f-]{36}$/.test(childId)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const settings = cleanSettings({ courseClass: body.courseClass, strandsOff: body.strandsOff });
  if (!settings || settings.strandsOff.length >= 15) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const g = await requireParent(req);
  if (g.error) return g.error;
  const session = g.session;
  return familyRun(session, async (db) => {
    const child = (await listChildren(db, session.accountId)).find((c) => c.childId === childId);
    if (!child) return NextResponse.json({ error: 'no_child' }, { status: 404 });
    if (!switchOn(await readFamilySwitches(db, session.accountId), 'tech_lab')) return NextResponse.json({ error: 'off' }, { status: 403 });
    await saveTechSettings(db, session.accountId, child.childId, settings);
    return NextResponse.json({ ok: true, settings });
  });
}
