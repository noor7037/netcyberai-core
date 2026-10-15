import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { schoolWeek } from '@/lib/timetable/generator-store';
import { MAX_PERIODS } from '@/lib/timetable/plan';
import { clearEntry, entriesForClass, entriesForTeacher, periodsPerDay, putEntry, teacherWorkload, timetableChoices } from '@/lib/timetable/timetable';

// The timetable (docs/20 5c, C145).
//   GET ?classId=  one class's week (RLS: a teacher, only their own classes')
//   GET ?mine=1    the signed-in teacher's own week
//   GET ?workload=1 periods a week per teacher, from the published timetable (C231): the office, every teacher; a
//                  teacher, their own line; nobody else
//   GET            what the office chooses from (classes, subjects, teachers)
//   PUT            fill one period (office); a teacher clash answers 409 and names the other entry; a teacher Setup
//                  does not assign to that class and subject answers 409 'not_assigned' (C231)
//   DELETE         clear one period (office)

// Who fills the timetable: the office and the academic coordinator (C146).
const OFFICE = ['principal', 'school_admin', 'academic_coordinator'];
const slotOf = (body: Record<string, unknown> | null) => {
  const weekday = Number(body?.weekday);
  const period = Number(body?.period);
  if (!isUuid(body?.classId) || !Number.isInteger(weekday) || weekday < 1 || weekday > 7 || !Number.isInteger(period) || period < 1 || period > MAX_PERIODS) return null;
  return { classId: body!.classId as string, weekday, period };
};

export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const { searchParams } = req.nextUrl;
    if (searchParams.get('workload')) {
      const mine = claims.role === 'teacher';
      if (!mine && !OFFICE.includes(claims.role)) return ruleError(403, 'not_allowed');
      const week = await schoolWeek(db, claims.schoolId);
      return NextResponse.json({ ...week, teachers: await teacherWorkload(db, claims.schoolId, { ...week, teacherUserId: mine ? claims.sub : undefined }) }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const periods = await periodsPerDay(db, claims.schoolId);
    if (searchParams.get('mine')) return NextResponse.json({ periods, entries: await entriesForTeacher(db, claims.schoolId, claims.sub) });
    const classId = searchParams.get('classId');
    if (classId !== null) {
      if (!isUuid(classId)) return ruleError(400, 'not_sent_properly');
      return NextResponse.json({ periods, entries: await entriesForClass(db, claims.schoolId, classId) });
    }
    const choices = await timetableChoices(db, claims.schoolId);
    // A teacher's email is the office's to see (it is what the CSV uses).
    return NextResponse.json({ periods, classes: choices.classes, subjects: choices.subjects, teachers: choices.teachers.map((t) => (OFFICE.includes(claims.role) ? t : { user_id: t.user_id, name: t.name })) });
  });
}

export async function PUT(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!OFFICE.includes(claims.role)) return ruleError(403, 'not_allowed');
    const body = await readJson(req);
    const at = slotOf(body);
    if (!at || !isUuid(body?.subjectId) || !isUuid(body?.teacherUserId)) return ruleError(400, 'not_sent_properly');
    const result = await putEntry(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { ...at, subjectId: body!.subjectId as string, teacherUserId: body!.teacherUserId as string });
    if (result.ok) return NextResponse.json({ entry: result.entry });
    if (result.reason === 'teacher_clash') return jsonError(409, 'this teacher is already teaching another class at that time', { code: 'teacher_clash', clash: result.clash });
    if (result.reason === 'not_assigned') return jsonError(409, 'Setup gives this subject in this class to other teachers', { code: 'not_assigned' });
    return jsonError(400, 'that class, subject, teacher or period is not one of this school’s', { code: result.reason });
  });
}

export async function DELETE(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!OFFICE.includes(claims.role)) return ruleError(403, 'not_allowed');
    const at = slotOf(await readJson(req));
    if (!at) return ruleError(400, 'not_sent_properly');
    return NextResponse.json({ cleared: await clearEntry(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, at) });
  });
}
