import { NextRequest, NextResponse } from 'next/server';
import { setDrawAllowed } from '@/lib/family/draw-done';
import { familyRun, jsonBody, requireParent } from '@/lib/family/request';

// The parent's "Allow all drawing activities" for one child (C514): parent mode only (the parent PIN; never a child's
// own phone). Body: { childId, allowed }. Off (the default) keeps the templates that need a parent locked.
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const body = await jsonBody(req);
  if (typeof body.childId !== 'string' || !UUID.test(body.childId) || typeof body.allowed !== 'boolean') return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const childId = body.childId;
  const allowed = body.allowed;
  const g = await requireParent(req);
  if (g.error) return g.error;
  return familyRun(g.session, async (db) => {
    const out = await setDrawAllowed(db, g.session.accountId, childId, allowed);
    if (out === 'not_found') return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (out === 'not_ready') return NextResponse.json({ error: 'not_ready' }, { status: 503 });
    return NextResponse.json({ allowed });
  });
}
