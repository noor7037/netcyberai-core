import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { PTM_ROLES, createPtm, listPtms } from '@/lib/ptm/ptm';

// Parent-teacher meetings (docs/25 slice 7k, C193).
//   GET   the meetings this person may see (a teacher: those of their own classes), and for the office the classes to choose from
//   POST  { title, heldOn, startsAt, endsAt, slotMinutes, classIds }  the office makes a meeting; nothing is sent yet
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!PTM_ROLES.includes(claims.role)) return ruleError(403, 'not_allowed');
    const mayManage = claims.role === 'principal' || claims.role === 'school_admin';
    const classes = mayManage ? (await db.query(`select c.class_id, c.name, u.display_name as teacher from classes c left join users u on u.user_id = c.class_teacher_id where c.school_id = $1 order by c.name`, [claims.schoolId])).rows : [];
    return NextResponse.json({ meetings: await listPtms(db, claims.schoolId), classes, mayManage }, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    const ok = b && typeof b.title === 'string' && b.title.length <= 200 && typeof b.heldOn === 'string' && typeof b.startsAt === 'string' && typeof b.endsAt === 'string' && typeof b.slotMinutes === 'number' && Array.isArray(b.classIds) && b.classIds.length <= 200 && b.classIds.every(isUuid);
    if (!b || !ok) return ruleError(400, 'not_sent_properly');
    const made = await createPtm(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { title: b.title as string, heldOn: b.heldOn as string, startsAt: b.startsAt as string, endsAt: b.endsAt as string, slotMinutes: b.slotMinutes as number, classIds: b.classIds as string[] });
    if (made.ok) return NextResponse.json({ ptmId: made.ptmId, teachers: made.teachers, slots: made.slots }, { status: 201 });
    return made.reason === 'not_allowed' ? ruleError(403, 'not_allowed') : jsonError(400, 'the meeting was not made', { code: made.reason, classes: made.classes ?? [] });
  });
}
