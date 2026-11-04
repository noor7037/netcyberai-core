import { NextRequest, NextResponse } from 'next/server';
import { activeChild, listChildren } from '@/lib/family/children';
import { checkSettingsPatch, loadChildSettings, saveChildSettings } from '@/lib/family/child-settings';
import { familyRun, jsonBody, requireFamily } from '@/lib/family/request';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';

// W19-C: the active child's own settings (read aloud, the tutor's face, motion, hands-free, voice speed). The child's
// own screen, so the family session is enough (no parent PIN); the child is the one this phone has chosen, never one
// the phone names. GET reads them; PATCH changes known keys only.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  return familyRun(g.session, async (db) => {
    const child = activeChild(await listChildren(db, g.session.accountId), chosen);
    if (!child) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ settings: await loadChildSettings(db, g.session.accountId, child.childId) });
  });
}

export async function PATCH(req: NextRequest) {
  const patch = checkSettingsPatch(await jsonBody(req));
  if (!patch) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  return familyRun(g.session, async (db) => {
    const child = activeChild(await listChildren(db, g.session.accountId), chosen);
    if (!child) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const saved = await saveChildSettings(db, g.session.accountId, child.childId, patch);
    if (saved === 'not_found') return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ settings: saved });
  });
}
