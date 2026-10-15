import { NextRequest, NextResponse } from 'next/server';
import { canWriteMasterData } from '@/lib/auth/require-app-session';
import { addStandardClasses } from '@/lib/classes/standard-classes';
import { appRoute, ruleError } from '@/lib/frameworks/route';

// POST: add every standard class (LKG, UKG, 1 to 12; sections A, B, C) the school does not have yet, for the current
// session (C235-A). The principal and the school admin, as for adding one class. Classes already there are left as
// they are; a second press makes nothing. One audit row with the counts.
export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!canWriteMasterData(claims.role)) return ruleError(403, 'not_allowed');
    const done = await addStandardClasses(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role });
    if (!done.ok) return ruleError(403, 'not_allowed');
    return NextResponse.json(
      { created: done.created, createdCount: done.created.length, alreadyThere: done.alreadyThere, sessionId: done.sessionId },
      { status: done.created.length > 0 ? 201 : 200 }
    );
  });
}
