import { NextRequest, NextResponse } from 'next/server';
import { AUDITOR_ROLES, checkUpHistory, latestCheckUp, recordCheckUp, runCheckUp } from '@/lib/auditor';
import { loadEntitlements } from '@/lib/frameworks/entitlements';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { indiaDate } from '@/lib/time/india';

// School Health Auditor v1 (docs/26 slice 8i, C208). The principal and the school admin only.
//   GET    the latest check-up on record (null before the first) and the last check-ups, one line a day
//   POST   run a check-up now, as this person, and keep it as today's: the first of the day, or "Check again"
//          the same day. Answers with the same shape as GET. Rules only: no language model is called.
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!AUDITOR_ROLES.includes(claims.role)) return ruleError(403, 'not_allowed');
    const who = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    return NextResponse.json({ today: indiaDate(), latest: await latestCheckUp(db, who), history: await checkUpHistory(db, who) }, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!AUDITOR_ROLES.includes(claims.role)) return ruleError(403, 'not_allowed');
    const who = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    const checkUp = await runCheckUp(db, who, await loadEntitlements(db, claims.schoolId));
    const latest = await recordCheckUp(db, who, checkUp);
    return NextResponse.json({ today: indiaDate(), latest, history: await checkUpHistory(db, who) }, { status: 201 });
  });
}
