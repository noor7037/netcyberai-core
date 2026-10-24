import { NextRequest, NextResponse } from 'next/server';
import { FOCUS_DEVICE_HEADER, HEARTBEAT_MAX_BYTES, deviceHash, focusOn, parseHeartbeat, recordHeartbeat, standDown } from '@/lib/family/focus';
import { familyRun, requireFamily } from '@/lib/family/request';

// The lock's health (M2b-1, C305), about every 30 minutes while the lock is on: exactly three flags, "the lock is on",
// "its permissions are granted" and "the clock was changed", and nothing else. A body with any other field, a missing
// flag, a value that is not true or false, or anything in the address is refused: the server never learns an app name
// or a time of use. The phone is the X-Focus-Device header, kept only as its keyed hash.
export const dynamic = 'force-dynamic';

const refused = () => NextResponse.json({ error: 'bad_heartbeat' }, { status: 400 });

export async function POST(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const hash = deviceHash(g.session.accountId, req.headers.get(FOCUS_DEVICE_HEADER));
  if (!hash) return NextResponse.json({ error: 'bad_device' }, { status: 400 });
  if (req.nextUrl.search) return refused();
  if (Number(req.headers.get('content-length') ?? 0) > HEARTBEAT_MAX_BYTES) return refused();
  const hb = parseHeartbeat(await req.text().catch(() => ''));
  if (!hb) return refused();
  const accountId = g.session.accountId;
  return familyRun(g.session, async (db) => {
    if (!(await focusOn(db, accountId))) {
      await standDown(db, accountId);
      return NextResponse.json({ error: 'off' }, { status: 403 });
    }
    const r = await recordHeartbeat(db, accountId, hash, hb);
    if (r === 'unknown_device') return NextResponse.json({ error: 'unknown_device' }, { status: 404 });
    if (r === 'too_soon') return NextResponse.json({ error: 'too_soon' }, { status: 429 });
    return NextResponse.json({ ok: true });
  });
}
