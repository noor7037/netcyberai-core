import { NextRequest, NextResponse } from 'next/server';
import { consentState } from '@/lib/family/consent';
import { familyClaims } from '@/lib/family/db';
import { FOCUS_DEVICE_HEADER, deviceHash, deviceId, focusOn, focusSchoolLinks, focusStatus, readFocusHomework, standDown } from '@/lib/family/focus';
import { clearFamilyCookies, familyRead, familyRun, requireFamily } from '@/lib/family/request';
import { indiaDate } from '@/lib/time/india';

// The Focus Lock asks (M2b-1, C305): for the children set for this phone (the X-Focus-Device header), whether today's
// plan is done, from today's checked answers only; what is still pending, for the block screen (the plan, and what English, the quick quiz and the linked school's homework
// set for today, each only when its module is on and the child has such a task, C540); the parent PIN's
// version; and the day, India's, from the server. The family's own session (a shared phone is in child mode); the
// focus_lock module switched on for this family (off by default); the parent's study_core consent.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const hash = deviceHash(g.session.accountId, req.headers.get(FOCUS_DEVICE_HEADER));
  if (!hash) return NextResponse.json({ error: 'bad_device' }, { status: 400 });
  const accountId = g.session.accountId;
  // Step 1, the family's own transaction: the gates, the phone, and the school links of its children (C540).
  const gate = await familyRead(g.session, async (db) => {
    if (!(await focusOn(db, accountId))) {
      await standDown(db, accountId);
      return { error: NextResponse.json({ error: 'off' }, { status: 403 }) };
    }
    const device = await deviceId(db, accountId, hash);
    if (!device) return { error: NextResponse.json({ error: 'unknown_device' }, { status: 404 }) };
    if (!(await consentState(db, accountId)).study_core) return { error: NextResponse.json({ error: 'consent_required' }, { status: 403 }) };
    return { device, school: await focusSchoolLinks(db, accountId, device) };
  });
  if (!gate) return clearFamilyCookies(NextResponse.json({ error: 'not_signed_in' }, { status: 401 }));
  if ('error' in gate) return gate.error;
  // Step 2, the school's door (another connection): the homework due today of the matched children.
  const homework = await readFocusHomework(familyClaims(g.session), gate.school);
  // Step 3, the family's transaction again: the status, with every module's task for today.
  return familyRun(g.session, async (db) =>
    NextResponse.json(await focusStatus(db, accountId, gate.device, indiaDate(), homework), { headers: { 'cache-control': 'no-store' } })
  );
}
