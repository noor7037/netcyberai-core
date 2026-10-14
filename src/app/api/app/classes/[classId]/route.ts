import { NextRequest, NextResponse } from 'next/server';
import { setClassTeacher } from '@/lib/classes/class-teacher';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';

// PATCH { classTeacherId: <user id> | null }: set or clear the class teacher of one class (C210). The principal
// and the school admin; the teacher must be an active teacher of this school. Audited.
export async function PATCH(req: NextRequest, { params }: { params: { classId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    const teacherId = b?.classTeacherId;
    if (!b || !isUuid(params.classId) || !('classTeacherId' in b) || (teacherId !== null && !isUuid(teacherId))) return ruleError(400, 'not_sent_properly');
    const done = await setClassTeacher(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.classId, teacherId as string | null);
    if (done.ok) return NextResponse.json({ class: done.class, changed: done.changed });
    if (done.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    if (done.reason === 'not_found') return ruleError(404, 'not_found');
    return jsonError(400, 'only an active teacher of this school can be a class teacher', { code: done.reason });
  });
}
