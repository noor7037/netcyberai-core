import { NextRequest, NextResponse } from 'next/server';
import { canWriteMasterData } from '@/lib/auth/require-app-session';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { listSetupSubjects } from '@/lib/setup/subjects';

// GET: every subject of the person's own school for the Setup screen (docs/28 slice 10g, C244): the ones in use and
// the retired ones, each with what still refers to it (timetable periods, exam papers, homework, who teaches it).
// The principal and the school admin. Adding a subject is POST /api/app/subjects; renaming, retiring and bringing one
// back is PATCH /api/app/setup/subjects/[subjectId].
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!canWriteMasterData(claims.role)) return ruleError(403, 'not_allowed');
    return NextResponse.json({ subjects: await listSetupSubjects(db, claims.schoolId) }, { headers: { 'Cache-Control': 'no-store' } });
  });
}
