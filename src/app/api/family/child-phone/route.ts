import { NextRequest, NextResponse } from 'next/server';
import { issueLinkCode, removeChildPhone } from '@/lib/family/child-phone';
import { familyRun, jsonBody, requireParent } from '@/lib/family/request';

// A child's own phone (M2b-2, C342), the parent's side, in parent mode on the parent's phone. Body:
//   { action: 'code', childId }     a one-time code for that child: six digits, ten minutes, used once (at most 5 an hour)
//   { action: 'remove', deviceId }  the phone's session ends at its next request
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const g = await requireParent(req);
  if (g.error) return g.error;
  const body = await jsonBody(req);
  const accountId = g.session.accountId;
  if (body.action === 'code' && typeof body.childId === 'string' && UUID.test(body.childId)) {
    const childId = body.childId;
    return familyRun(g.session, async (db) => {
      const r = await issueLinkCode(db, accountId, childId);
      return r.ok ? NextResponse.json({ code: r.code, expiresAt: r.expiresAt }) : NextResponse.json({ error: r.reason }, { status: r.reason === 'not_found' ? 404 : 429 });
    });
  }
  if (body.action === 'remove' && typeof body.deviceId === 'string' && UUID.test(body.deviceId)) {
    const deviceId = body.deviceId;
    return familyRun(g.session, async (db) => ((await removeChildPhone(db, accountId, deviceId)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not_found' }, { status: 404 })));
  }
  return NextResponse.json({ error: 'bad_request' }, { status: 400 });
}
