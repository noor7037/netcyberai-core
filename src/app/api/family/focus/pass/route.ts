import { NextRequest, NextResponse } from 'next/server';
import { FOCUS_DEVICE_HEADER, deviceHash, deviceId, focusOn, signFocusPass } from '@/lib/family/focus';
import { familyRun, requireParent } from '@/lib/family/request';

// The Focus app's pass (C538): asked by the parent area, in parent mode, for the phone it runs on (X-Focus-Device,
// the Focus app's own id, read from it on the phone), once that phone is set up (PUT devices). The Family app hands the
// pass to the Focus app on the phone, which trades it for its own session (POST redeem). Five minutes.
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const g = await requireParent(req);
  if (g.error) return g.error;
  const hash = deviceHash(g.session.accountId, req.headers.get(FOCUS_DEVICE_HEADER));
  if (!hash) return NextResponse.json({ error: 'bad_device' }, { status: 400 });
  const { accountId, tokenVersion } = g.session;
  return familyRun(g.session, async (db) => {
    if (!(await focusOn(db, accountId))) return NextResponse.json({ error: 'off' }, { status: 403 });
    if (!(await deviceId(db, accountId, hash))) return NextResponse.json({ error: 'unknown_device' }, { status: 404 });
    return NextResponse.json({ pass: await signFocusPass(accountId, tokenVersion, hash) }, { headers: { 'cache-control': 'no-store' } });
  });
}
