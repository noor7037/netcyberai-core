import { NextRequest, NextResponse } from 'next/server';
import { appRoute, jsonError, ruleError } from '@/lib/frameworks/route';
import { undoPromotion, UNDO_HOURS } from '@/lib/setup/promotion';

// POST: undo the last promotion (W21-M2), within 24 hours of it, by the principal only. Every event is reversed by a
// new event of an undo run; nothing is rewritten. After 24 hours the promotion is final.
export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (claims.role !== 'principal') return ruleError(403, 'not_allowed');
    const done = await undoPromotion(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role });
    if (!done.ok) {
      if (done.reason === 'nothing_to_undo') return jsonError(404, 'there is no promotion to undo', { code: 'promotion_nothing_to_undo' });
      return jsonError(409, `a promotion can be undone only within ${UNDO_HOURS} hours`, { code: 'promotion_undo_too_late' });
    }
    return NextResponse.json({ runId: done.runId, restored: done.restored, classesRemoved: done.classesRemoved });
  });
}
