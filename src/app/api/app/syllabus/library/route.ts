import { NextRequest, NextResponse } from 'next/server';
import { canWriteSyllabus } from '@/lib/auth/require-app-session';
import { copyFromLibrary, libraryPlan } from '@/lib/academics/syllabus-library';
import { isRlsViolation } from '@/lib/db/pg-errors';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';

// "Use the NetCyberAI syllabus" (W14-I): the school's class and subject pairs with whether the library has them
// (GET), and the copy of the library's units into the ones with no syllabus yet (POST: every pair, or the one named
// by classId and subjectId). The same roles as the syllabus map; row level security limits a teacher to their classes.

export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!canWriteSyllabus(claims.role)) return ruleError(403, 'not_allowed');
    return NextResponse.json(await libraryPlan(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }));
  });
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!canWriteSyllabus(claims.role)) return ruleError(403, 'not_allowed');
    const body = await readJson(req);
    const named = body?.classId != null || body?.subjectId != null;
    if (named && (!isUuid(body?.classId) || !isUuid(body?.subjectId))) return ruleError(400, 'not_sent_properly');
    const only = named ? { classId: body!.classId as string, subjectId: body!.subjectId as string } : null;
    try {
      await db.query('savepoint copy_library');
      const result = await copyFromLibrary(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, only);
      if (!result.ok) return result.reason === 'no_board' ? jsonError(409, 'the school’s board is not recorded yet', { code: 'no_board' }) : ruleError(403, 'not_allowed');
      return NextResponse.json(result.run, { status: 201 });
    } catch (err) {
      if (!isRlsViolation(err)) throw err;
      await db.query('rollback to savepoint copy_library');
      return ruleError(403, 'not_allowed');
    }
  });
}
