import { NextRequest, NextResponse } from 'next/server';
import { loadScreen, runCheck } from '@/lib/early-warning/early-warning';
import { FLAG_ROLES } from '@/lib/early-warning/rules';
import { appRoute, jsonError, ruleError } from '@/lib/frameworks/route';

// Early Warning v1 (docs/26 slice 8j, C209). Staff only: nothing here writes a message for anyone.
//   GET   the flags this person may read (the office and the coordinator: the school's; a teacher: their own
//         classes', which the database decides), with their reasons, evidence, rule version and what was done;
//         the count a class; and, for the people who run the check, when it was last run, for how many students
//         attendance could be used then, and the settings in force.
//   POST  "Check now": one person's tap, by the principal, the school admin or the academic coordinator.
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!FLAG_ROLES.includes(claims.role)) return ruleError(403, 'not_allowed');
    const screen = await loadScreen(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role });
    return NextResponse.json(screen, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const done = await runCheck(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role });
    // An account made at another school: said in plain words, and nothing is written.
    if (!done.ok) return done.reason === 'elsewhere' ? jsonError(409, 'the check was not run', { code: 'elsewhere' }) : ruleError(403, 'not_allowed');
    return NextResponse.json({ students: done.students, attendanceUsed: done.attendanceUsed, opened: done.opened, changed: done.changed, kept: done.kept, closed: done.closed, open: done.open });
  });
}
