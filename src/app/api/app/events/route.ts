import { NextRequest, NextResponse } from 'next/server';
import { EVENT_ROLES, createEvent, listEvents } from '@/lib/events/events';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';

// School events (docs/25 slice 7l, C194).
//   GET   the events this person may see (a teacher: their own classes' and the whole school's), and for the office the classes to choose from
//   POST  { title, heldOn, startsAt | null, details, classIds }  the office makes an event ([] = every class); nothing is sent yet
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!EVENT_ROLES.includes(claims.role)) return ruleError(403, 'not_allowed');
    const mayManage = claims.role === 'principal' || claims.role === 'school_admin';
    const classes = mayManage ? (await db.query(`select class_id, name from classes where school_id = $1 order by name`, [claims.schoolId])).rows : [];
    return NextResponse.json({ events: await listEvents(db, claims.schoolId), classes, mayManage }, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    const ok = b && typeof b.title === 'string' && b.title.length <= 200 && typeof b.heldOn === 'string' && (b.startsAt === null || typeof b.startsAt === 'string') && typeof b.details === 'string' && b.details.length <= 600 && Array.isArray(b.classIds) && b.classIds.length <= 200 && b.classIds.every(isUuid);
    if (!b || !ok) return ruleError(400, 'not_sent_properly');
    const made = await createEvent(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { title: b.title as string, heldOn: b.heldOn as string, startsAt: (b.startsAt as string | null) || null, details: b.details as string, classIds: b.classIds as string[] });
    if (made.ok) return NextResponse.json({ eventId: made.eventId }, { status: 201 });
    return made.reason === 'not_allowed' ? ruleError(403, 'not_allowed') : jsonError(400, 'the event was not made', { code: made.reason });
  });
}
