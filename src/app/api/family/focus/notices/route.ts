import { NextRequest, NextResponse } from 'next/server';
import { isUuid, markNoticeSeen } from '@/lib/family/focus';
import { familyRun, jsonBody, requireParent } from '@/lib/family/request';

// The parent has seen a Focus Lock notice (M2b-1, C305): { noticeId }, in parent mode. It leaves the parent area, and a
// new one of its kind for that phone can come again.
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await jsonBody(req);
  const g = await requireParent(req);
  if (g.error) return g.error;
  if (!isUuid(body.noticeId)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const notice = body.noticeId;
  return familyRun(g.session, async (db) =>
    (await markNoticeSeen(db, g.session.accountId, notice)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not_found' }, { status: 404 })
  );
}
