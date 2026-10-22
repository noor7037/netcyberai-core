import { NextRequest, NextResponse } from 'next/server';
import { activeChild, listChildren } from '@/lib/family/children';
import { consentState } from '@/lib/family/consent';
import { familyModuleOn } from '@/lib/family/flags';
import { dayPlan } from '@/lib/family/plan';
import { familyRun, requireFamily } from '@/lib/family/request';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';
import { indiaDate } from '@/lib/time/india';

// Today's plan for the child using the app (M2-2, C276): its items, which are done (from today's checked answers) and
// whether the day is complete. Needs the parent's study_core consent and the plan module switched on. M2b's Focus Lock
// asks this route whether today's plan is done.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  return familyRun(g.session, async (db) => {
    const child = activeChild(await listChildren(db, g.session.accountId), chosen);
    if (!child) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (!(await consentState(db, g.session.accountId)).study_core) return NextResponse.json({ error: 'consent_required' }, { status: 403 });
    if (!(await familyModuleOn(db, 'plan', g.session.accountId))) return NextResponse.json({ error: 'off' }, { status: 403 });
    return NextResponse.json(await dayPlan(db, g.session.accountId, child, indiaDate(), child.language));
  });
}
