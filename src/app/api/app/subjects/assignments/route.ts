import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/academics/syllabus';
import { assign, ASSIGNERS, assignmentChoices, listAssignments, myRequests, unassign, waitingRequests, type Assignment } from '@/lib/academics/teacher-subjects';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';

// Who teaches which subject to which class (teacher_subjects), kept by the office on the Staff screen (docs/28 slice
// 10g, C231). This table is what the teacher_scope_* RLS policies read, so it decides what each teacher can mark: an
// office-only write (the principal and the school admin; row level security says the same), audited both ways with
// ids only. src/lib/academics/teacher-subjects.ts does the work.
//   GET     the office: every teacher's subjects and classes, the proposals waiting, and what to choose from;
//           a teacher: their own subjects and classes, their own proposals, and the classes and subjects
//   POST    { teacherUserId, subjectId, classId }  give a teacher a subject in a class (the office)
//   DELETE  { teacherUserId, subjectId, classId }  take it away (the office)

function parseAssignment(body: Record<string, unknown> | null): Assignment | null {
  if (!isUuid(body?.teacherUserId) || !isUuid(body?.subjectId) || !isUuid(body?.classId)) return null;
  return { teacherUserId: body!.teacherUserId as string, subjectId: body!.subjectId as string, classId: body!.classId as string };
}

export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const choices = await assignmentChoices(db, claims.schoolId);
    if (ASSIGNERS.includes(claims.role)) {
      return NextResponse.json(
        { ...choices, assignments: await listAssignments(db, claims.schoolId), requests: await waitingRequests(db, claims.schoolId), mayAssign: true },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }
    if (claims.role === 'teacher') {
      return NextResponse.json(
        { classes: choices.classes, subjects: choices.subjects, assignments: await listAssignments(db, claims.schoolId, claims.sub), requests: await myRequests(db, claims.schoolId, claims.sub), mayAssign: false },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }
    return ruleError(403, 'not_allowed');
  });
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!ASSIGNERS.includes(claims.role)) return ruleError(403, 'not_allowed');
    const a = parseAssignment(await readJson(req));
    if (!a) return ruleError(400, 'not_sent_properly');
    const done = await assign(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, a);
    if (!done.ok) return jsonError(400, 'that teacher, class or subject is not one of this school’s', { code: done.reason });
    return NextResponse.json({ assignment: a, created: done.created }, { status: done.created ? 201 : 200 });
  });
}

export async function DELETE(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!ASSIGNERS.includes(claims.role)) return ruleError(403, 'not_allowed');
    const a = parseAssignment(await readJson(req));
    if (!a) return ruleError(400, 'not_sent_properly');
    // Zero rows is a real outcome (nothing to remove), reported as 404, never as success (Pre-F Stage 2e rule).
    if (!(await unassign(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, a))) return ruleError(404, 'not_found');
    return NextResponse.json({ removed: a });
  });
}
