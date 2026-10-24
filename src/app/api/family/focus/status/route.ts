import { NextRequest, NextResponse } from 'next/server';
import { consentState } from '@/lib/family/consent';
import { FOCUS_DEVICE_HEADER, deviceHash, deviceId, focusOn, focusStatus, standDown } from '@/lib/family/focus';
import { familyRun, requireFamily } from '@/lib/family/request';
import { indiaDate } from '@/lib/time/india';

// The Focus Lock asks (M2b-1, C305): for the children set for this phone (the X-Focus-Device header), whether today's
// plan is done, from today's checked answers only; what is still pending, for the block screen; the parent PIN's
// version; and the day, India's, from the server. The family's own session (a shared phone is in child mode); the
// focus_lock module switched on for this family (off by default); the parent's study_core consent.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const hash = deviceHash(g.session.accountId, req.headers.get(FOCUS_DEVICE_HEADER));
  if (!hash) return NextResponse.json({ error: 'bad_device' }, { status: 400 });
  const accountId = g.session.accountId;
  return familyRun(g.session, async (db) => {
    if (!(await focusOn(db, accountId))) {
      await standDown(db, accountId);
      return NextResponse.json({ error: 'off' }, { status: 403 });
    }
    const device = await deviceId(db, accountId, hash);
    if (!device) return NextResponse.json({ error: 'unknown_device' }, { status: 404 });
    if (!(await consentState(db, accountId)).study_core) return NextResponse.json({ error: 'consent_required' }, { status: 403 });
    return NextResponse.json(await focusStatus(db, accountId, device, indiaDate()), { headers: { 'cache-control': 'no-store' } });
  });
}
