import { NextRequest, NextResponse } from 'next/server';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { getLang } from '@/lib/i18n/server';
import { SUMMARY_ROLES, draftClassSummaries, summaryWeek } from '@/lib/parent-ai/doubts';
import { indiaDate } from '@/lib/time/india';

// W16-B3: the week's tutor counts per class become draft notices (src/lib/parent-ai/doubts.ts).
//   POST  draft one notice a class for the week the parents' reports were written for, in the caller's own name. Each
//         waits for the principal like every notice; nothing is sent here. The principal and the school admin only.
export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!SUMMARY_ROLES.includes(claims.role)) return ruleError(403, 'not_allowed');
    const { lang } = getLang(claims.sub);
    const made = await draftClassSummaries(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, lang, summaryWeek(indiaDate()));
    if (!made.ok) return ruleError(403, 'not_allowed');
    return NextResponse.json({ drafted: made.drafted, already: made.already }, { status: 201 });
  });
}
