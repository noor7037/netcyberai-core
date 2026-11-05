import { NextRequest, NextResponse } from 'next/server';
import { canWriteMasterData } from '@/lib/auth/require-app-session';
import { appRoute, jsonError, ruleError } from '@/lib/frameworks/route';
import { promote, readPromotion } from '@/lib/setup/promotion';

// Promotion to the next academic session (W21-M2). src/lib/setup/promotion.ts does the work.
//   GET   the dry run: the principal and the school admin (the database says the same)
//   POST  promote, in one transaction: the principal only (the database holds the same rule)
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!canWriteMasterData(claims.role)) return ruleError(403, 'not_allowed');
    return NextResponse.json({ promotion: await readPromotion(db, claims.schoolId) }, { headers: { 'Cache-Control': 'no-store' } });
  });
}

const REFUSED = {
  no_session: [409, 'the school has no current session'],
  no_next_session: [409, 'add the next session first'],
  already_promoted: [409, 'this session has already been promoted'],
  students_undecided: [409, 'some students still need a decision'],
} as const;

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (claims.role !== 'principal') return ruleError(403, 'not_allowed');
    const done = await promote(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role });
    if (!done.ok) {
      const [status, error] = REFUSED[done.reason];
      return jsonError(status, error, { code: `promotion_${done.reason}`, undecided: done.undecided ?? 0 });
    }
    return NextResponse.json({ runId: done.runId, counts: done.counts, classesMade: done.classesMade });
  });
}
