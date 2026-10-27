import { NextRequest, NextResponse } from 'next/server';
import { approveChildLink, removeChildPhone } from '@/lib/family/child-phone';
import { familyModuleOn } from '@/lib/family/flags';
import { familyRun, jsonBody, requireParent } from '@/lib/family/request';

// A child's own phone (M2b-2; reversed by C230-AF, C346), the parent's side, in parent mode on the parent's phone. Body:
//   { action: 'link', childId, code }  the code the child's phone shows, for one of the family's children: that phone
//                                      then opens the app for that child. Only while Control has the family's Focus
//                                      Lock switched on; at most ten tries an hour.
//   { action: 'remove', deviceId }     the phone's session ends at its next request (always, switch or not)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS = { wrong: 400, not_found: 404, too_many: 429 } as const;

export async function POST(req: NextRequest) {
  const g = await requireParent(req);
  if (g.error) return g.error;
  const body = await jsonBody(req);
  const accountId = g.session.accountId;
  if (body.action === 'link' && typeof body.childId === 'string' && UUID.test(body.childId)) {
    const childId = body.childId;
    return familyRun(g.session, async (db) => {
      if (!(await familyModuleOn(db, 'focus_lock', accountId))) return NextResponse.json({ error: 'off' }, { status: 403 });
      const r = await approveChildLink(db, childId, body.code);
      return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.reason }, { status: STATUS[r.reason] });
    });
  }
  if (body.action === 'remove' && typeof body.deviceId === 'string' && UUID.test(body.deviceId)) {
    const deviceId = body.deviceId;
    return familyRun(g.session, async (db) => ((await removeChildPhone(db, accountId, deviceId)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not_found' }, { status: 404 })));
  }
  return NextResponse.json({ error: 'bad_request' }, { status: 400 });
}
