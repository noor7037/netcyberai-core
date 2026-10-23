import { NextRequest, NextResponse } from 'next/server';
import { familyRun, jsonBody, requireParent } from '@/lib/family/request';
import { unlinkSchool } from '@/lib/family/school';

// Disconnect a school (C230-AA): the school's part leaves the app at once; the children's own learning stays.
export async function POST(req: NextRequest) {
  const g = await requireParent(req);
  if (g.error) return g.error;
  const body = await jsonBody(req);
  if (typeof body.linkId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.linkId)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const linkId = body.linkId;
  return familyRun(g.session, async (db) =>
    (await unlinkSchool(db, g.session.accountId, linkId)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not_found' }, { status: 404 })
  );
}
