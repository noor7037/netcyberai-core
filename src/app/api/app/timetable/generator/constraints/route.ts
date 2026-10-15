import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { generatorInPlan, PLANNERS, removeLoad, setLoad, setUnavailable } from '@/lib/timetable/generator-store';
import { MAX_PERIODS } from '@/lib/timetable/plan';

// The timetable generator's constraints (docs/28 slice 10f, C229), for the office. A part of the plan.
//   PUT    { kind: 'load', classId, subjectId, periods, teacherUserId }   a class's periods a week of a subject, and its teacher
//   PUT    { kind: 'unavailable', teacherUserId, slots: [{ weekday, period | null }] }   a teacher's unavailable periods, as a set
//   DELETE { kind: 'load', classId, subjectId }                            take a subject out of a class's plan

const MAX_SLOTS = 7 * MAX_PERIODS + 7;

export async function PUT(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!(await generatorInPlan(db, claims.schoolId))) return ruleError(403, 'not_allowed'); // a part of the plan (C226)
    if (!PLANNERS.includes(claims.role)) return ruleError(403, 'not_allowed');
    const body = await readJson(req);
    const actor = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    if (body?.kind === 'load') {
      if (!isUuid(body.classId) || !isUuid(body.subjectId) || !isUuid(body.teacherUserId) || !Number.isInteger(body.periods)) return ruleError(400, 'not_sent_properly');
      const saved = await setLoad(db, actor, { classId: body.classId, subjectId: body.subjectId, teacherUserId: body.teacherUserId, periods: body.periods as number });
      if (!saved.ok) return jsonError(400, 'that class, subject, teacher or number of periods is not one this school can use', { code: saved.reason });
      return NextResponse.json({ saved: true });
    }
    if (body?.kind === 'unavailable') {
      if (!isUuid(body.teacherUserId) || !Array.isArray(body.slots) || body.slots.length > MAX_SLOTS) return ruleError(400, 'not_sent_properly');
      const slots = (body.slots as unknown[]).map((s) => (typeof s === 'object' && s !== null ? (s as Record<string, unknown>) : {})).map((s) => ({ weekday: s.weekday as number, period: s.period === null ? null : (s.period as number) }));
      const saved = await setUnavailable(db, actor, body.teacherUserId, slots);
      if (!saved.ok) return jsonError(400, 'that teacher or period is not one this school can use', { code: saved.reason });
      return NextResponse.json({ saved: true, periods: saved.periods });
    }
    return ruleError(400, 'not_sent_properly');
  });
}

export async function DELETE(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!(await generatorInPlan(db, claims.schoolId))) return ruleError(403, 'not_allowed');
    if (!PLANNERS.includes(claims.role)) return ruleError(403, 'not_allowed');
    const body = await readJson(req);
    if (body?.kind !== 'load' || !isUuid(body.classId) || !isUuid(body.subjectId)) return ruleError(400, 'not_sent_properly');
    if (!(await removeLoad(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { classId: body.classId, subjectId: body.subjectId }))) return ruleError(404, 'not_found');
    return NextResponse.json({ removed: true });
  });
}
