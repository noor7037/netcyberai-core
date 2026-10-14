import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { addDays, askLeave, isLeaveDate, LEAVE_BACK_DAYS, LEAVE_LIST_MAX, LEAVE_OFFICE, LEAVE_ROLES, leaveCalendar, leaveStaff, leaveWaiting, myLeave, officeAlone, recordLeave } from '@/lib/staff/leave';
import { indiaDate } from '@/lib/time/india';

// Staff leave (docs/26 slice 8b, C201).
//   GET                  a person's own requests ("My leave" on the account page)
//   GET ?view=office     the principal and school admin: requests waiting; approved leave with a day on or after
//                        ?from (unless given: as far back as the office may record leave, LEAVE_BACK_DAYS) and not
//                        after ?to (unless given: no last day, so nothing approved ahead is left out); and the
//                        staff leave can be recorded for. `calendarMore`: the list was cut at LEAVE_LIST_MAX.
//   Both say `alone`: the caller is the school's only principal or school admin, so nobody can decide their own.
//   POST { fromDate, toDate, kind, reason }           a person's own request; it waits for the office
//   POST { userId, fromDate, toDate, kind, reason }   the office records leave for someone who phoned in: approved at once
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!LEAVE_ROLES.includes(claims.role)) return ruleError(403, 'not_allowed');
    const actor = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    const office = LEAVE_OFFICE.includes(claims.role);
    const today = indiaDate();
    const url = new URL(req.url);
    const headers = { 'Cache-Control': 'no-store' };
    const alone = await officeAlone(db, actor);
    if (url.searchParams.get('view') !== 'office') return NextResponse.json({ me: claims.sub, office, alone, today, mine: await myLeave(db, actor, today) }, { headers });
    if (!office) return ruleError(403, 'not_allowed');
    const from = url.searchParams.get('from') ?? addDays(today, -LEAVE_BACK_DAYS);
    const to = url.searchParams.get('to');
    if (!isLeaveDate(from) || (to !== null && (!isLeaveDate(to) || to < from))) return ruleError(400, 'not_sent_properly');
    const calendar = await leaveCalendar(db, actor, from, to, today, LEAVE_LIST_MAX + 1);
    return NextResponse.json({ me: claims.sub, office, alone, today, from, to, waiting: await leaveWaiting(db, actor, today), calendar: calendar.slice(0, LEAVE_LIST_MAX), calendarMore: calendar.length > LEAVE_LIST_MAX, staff: await leaveStaff(db, actor) }, { headers });
  });
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || typeof b.fromDate !== 'string' || typeof b.toDate !== 'string' || typeof b.kind !== 'string' || typeof b.reason !== 'string' || b.reason.length > 2000 || (b.userId !== undefined && !isUuid(b.userId))) return ruleError(400, 'not_sent_properly');
    const actor = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    const wanted = { fromDate: b.fromDate, toDate: b.toDate, kind: b.kind, reason: b.reason };
    const made = b.userId === undefined ? await askLeave(db, actor, wanted) : await recordLeave(db, actor, { ...wanted, userId: b.userId as string });
    if (made.ok) return NextResponse.json({ leaveId: made.leaveId }, { status: 201 });
    return made.reason === 'not_allowed' ? ruleError(403, 'not_allowed') : jsonError(400, 'the leave was not recorded', { code: made.reason });
  });
}
