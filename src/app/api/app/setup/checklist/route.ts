import { NextRequest, NextResponse } from 'next/server';
import { canWriteMasterData } from '@/lib/auth/require-app-session';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { checklistProgress, onboardingChecklist } from '@/lib/setup/checklist';

// GET: the onboarding checklist of the person's own school (docs/28 slice 10g, C244), counted from the rows that
// exist now. For the principal and the school admin, who set the school up; every other role is refused.
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!canWriteMasterData(claims.role)) return ruleError(403, 'not_allowed');
    const items = await onboardingChecklist(db, claims.schoolId);
    return NextResponse.json({ items, progress: checklistProgress(items) }, { headers: { 'Cache-Control': 'no-store' } });
  });
}
