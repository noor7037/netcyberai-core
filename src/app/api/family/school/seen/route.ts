import { NextRequest, NextResponse } from 'next/server';
import { familyRun, jsonBody, requireParent } from '@/lib/family/request';
import { markSchoolSeen } from '@/lib/family/school';

// The parent has looked at a connected school's part (C338): what was new is now seen. Body: { linkId }.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const g = await requireParent(req);
  if (g.error) return g.error;
  const body = await jsonBody(req);
  if (typeof body.linkId !== 'string' || !UUID.test(body.linkId)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const linkId = body.linkId;
  return familyRun(g.session, async (db) => ((await markSchoolSeen(db, g.session.accountId, linkId)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not_found' }, { status: 404 })));
}
