import { NextRequest, NextResponse } from 'next/server';
import { FOCUS_DEVICE_HEADER, checkDeviceChildren, deviceHash, focusOn, isUuid, registerDevice, removeDevice } from '@/lib/family/focus';
import { familyRun, jsonBody, requireParent } from '@/lib/family/request';

// The phones the Focus Lock is set up on (M2b-1, C305): the parent's, in parent mode (the parent PIN).
// PUT, on the phone itself: set it up, or change the children it is set for: X-Focus-Device and { childIds }.
// DELETE, from any of the family's phones: remove one, with its notices: { deviceId }. Works even when the module is
// off, so a parent can always clean up.
export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest) {
  const body = await jsonBody(req);
  const g = await requireParent(req);
  if (g.error) return g.error;
  const hash = deviceHash(g.session.accountId, req.headers.get(FOCUS_DEVICE_HEADER));
  if (!hash) return NextResponse.json({ error: 'bad_device' }, { status: 400 });
  const accountId = g.session.accountId;
  return familyRun(g.session, async (db) => {
    if (!(await focusOn(db, accountId))) return NextResponse.json({ error: 'off' }, { status: 403 });
    const children = await checkDeviceChildren(db, accountId, body.childIds);
    if (!children) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    return NextResponse.json({ deviceId: await registerDevice(db, accountId, hash, children) });
  });
}

export async function DELETE(req: NextRequest) {
  const body = await jsonBody(req);
  const g = await requireParent(req);
  if (g.error) return g.error;
  if (!isUuid(body.deviceId)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const device = body.deviceId;
  return familyRun(g.session, async (db) =>
    (await removeDevice(db, g.session.accountId, device)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not_found' }, { status: 404 })
  );
}
