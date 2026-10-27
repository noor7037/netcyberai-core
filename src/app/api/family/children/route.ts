import { NextRequest, NextResponse } from 'next/server';
import { addChild, boardIsOffered, checkChild, listChildren } from '@/lib/family/children';
import { consentState } from '@/lib/family/consent';
import { familyRun, jsonBody, requireFamily, requireParent } from '@/lib/family/request';
import { FAMILY_CHILD_COOKIE, FAMILY_SESSION_TTL_SECONDS, familyCookieOptions } from '@/lib/family/session';

// The family's children (M1-2, C248). Listing is for the child switcher (first names only). Adding is the parent's:
// parent mode, and study_core granted first (nothing is processed before the parent's consent).
export async function GET(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  return familyRun(g.session, async (db) => NextResponse.json({ children: await listChildren(db, g.session.accountId) }));
}

export async function POST(req: NextRequest) {
  const checked = checkChild(await jsonBody(req), 'shape');
  if (!checked.ok) return NextResponse.json({ error: 'invalid', problems: checked.problems }, { status: 400 });
  const g = await requireParent(req);
  if (g.error) return g.error;
  return familyRun(g.session, async (db) => {
    // The board must be one the database offers (content.boards), not only well formed (S4).
    if (!(await boardIsOffered(db, checked.child.board))) return NextResponse.json({ error: 'invalid', problems: ['board'] }, { status: 400 });
    if (!(await consentState(db, g.session.accountId)).study_core) return NextResponse.json({ error: 'consent_required' }, { status: 409 });
    const child = await addChild(db, g.session.accountId, checked.child);
    if (child === 'too_many') return NextResponse.json({ error: 'too_many' }, { status: 409 });
    const res = NextResponse.json({ child }, { status: 201 });
    res.cookies.set(FAMILY_CHILD_COOKIE, child.childId, familyCookieOptions(FAMILY_SESSION_TTL_SECONDS));
    return res;
  });
}
