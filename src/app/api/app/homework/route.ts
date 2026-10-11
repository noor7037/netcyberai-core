import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { createHomework, listAssignments, parseHomeworkText } from '@/lib/homework/homework';
import { indiaDate } from '@/lib/time/india';

// Homework (docs/20 5e, C150).
//   GET   the assignments the caller may see, and what they may set homework for
//   POST  set one homework and copy it to the sections named
const STAFF = ['principal', 'school_admin', 'academic_coordinator', 'teacher'];

export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!STAFF.includes(claims.role)) return ruleError(403, 'not_allowed');
    const today = indiaDate();
    // A teacher sets homework for their own classes; the office for any.
    const classes = (await db.query(`select class_id, name from classes where school_id = $1 and ($2::text <> 'teacher' or class_id = any (public.teacher_own_class_ids())) order by name`, [claims.schoolId, claims.role])).rows;
    const subjects = (await db.query(`select subject_id, name from subjects where school_id = $1 order by name`, [claims.schoolId])).rows;
    return NextResponse.json({ today, assignments: await listAssignments(db, claims.schoolId, today), classes, subjects });
  });
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!STAFF.includes(claims.role)) return ruleError(403, 'not_allowed');
    const body = await readJson(req);
    const text = parseHomeworkText(body, indiaDate());
    if (!text.ok) return jsonError(400, 'the homework needs a title and a due date from today', { code: text.reason });
    const classIds = Array.isArray(body?.classIds) ? (body.classIds as unknown[]) : [];
    if (!isUuid(body?.subjectId) || classIds.length > 50 || !classIds.every(isUuid)) return ruleError(400, 'not_sent_properly');
    const result = await createHomework(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { ...text.value, subjectId: body.subjectId as string, classIds: classIds as string[] });
    if (result.ok) return NextResponse.json({ homeworkId: result.homeworkId, targetIds: result.targetIds }, { status: 201 });
    if (result.reason === 'not_allowed' || result.reason === 'not_your_class') return jsonError(403, 'homework can be set only for a class that is yours', { code: result.reason });
    return jsonError(400, 'the homework was not set', { code: result.reason });
  });
}
