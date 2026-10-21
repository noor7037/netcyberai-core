import { NextRequest, NextResponse } from 'next/server';
import { listChildren } from '@/lib/family/children';
import { familyRun, jsonBody, requireFamily } from '@/lib/family/request';
import { FAMILY_CHILD_COOKIE, FAMILY_SESSION_TTL_SECONDS, familyCookieOptions } from '@/lib/family/session';

// The child switcher: one tap, no PIN (many families share one phone). Only a child of this account can be chosen.
export async function POST(req: NextRequest) {
  const childId = (await jsonBody(req)).childId;
  const g = await requireFamily(req);
  if (g.error) return g.error;
  return familyRun(g.session, async (db) => {
    const children = await listChildren(db, g.session.accountId);
    if (!children.some((c) => c.childId === childId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const res = NextResponse.json({ childId });
    res.cookies.set(FAMILY_CHILD_COOKIE, String(childId), familyCookieOptions(FAMILY_SESSION_TTL_SECONDS));
    return res;
  });
}
