import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/academics/syllabus';
import { ASSIGNERS, decideRequest, proposeAssignment } from '@/lib/academics/teacher-subjects';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';

// A teacher's proposal of a subject they teach in a class (docs/28 slice 10g, C231). Nothing is assigned until the
// office confirms it; only a confirmed proposal is written to teacher_subjects. Row level security says the same: a
// teacher makes a proposal only for themselves, and only the principal, the school admin or the academic coordinator
// (ASSIGNERS, C230-C) decides one, never the teacher who made it. (The proposals are read with the assignments:
// GET /api/app/subjects/assignments.)
//   POST  { classId, subjectId }                         a teacher proposes, for themselves
//   PUT   { requestId, decision: 'confirm' | 'decline' } those three decide, once

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (claims.role !== 'teacher') return ruleError(403, 'not_allowed');
    const body = await readJson(req);
    if (!isUuid(body?.classId) || !isUuid(body?.subjectId)) return ruleError(400, 'not_sent_properly');
    const made = await proposeAssignment(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { classId: body!.classId as string, subjectId: body!.subjectId as string });
    if (made.ok) return NextResponse.json(made, { status: 201 });
    if (made.reason === 'already_assigned' || made.reason === 'already_requested') return jsonError(409, 'this is already assigned to you, or already waiting for the office', { code: made.reason });
    return jsonError(400, 'that class or subject is not one of this school’s', { code: made.reason });
  });
}

export async function PUT(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!ASSIGNERS.includes(claims.role)) return ruleError(403, 'not_allowed');
    const body = await readJson(req);
    if (!isUuid(body?.requestId) || (body!.decision !== 'confirm' && body!.decision !== 'decline')) return ruleError(400, 'not_sent_properly');
    const done = await decideRequest(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, body!.requestId as string, body!.decision);
    if (done.ok) return NextResponse.json(done);
    if (done.reason === 'not_found') return ruleError(404, 'not_found');
    return jsonError(409, 'this teacher is no longer an active teacher of the school: decline the proposal', { code: done.reason });
  });
}
