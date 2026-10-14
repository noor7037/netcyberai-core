import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { assignCover, coversBetween, PROXY_AHEAD_DAYS, PROXY_ARRANGERS, PROXY_ROLES, proxyDay } from '@/lib/proxy/proxy';
import { addDays, isLeaveDate, LEAVE_OFFICE } from '@/lib/staff/leave-rules';
import { indiaDate } from '@/lib/time/india';

// Proxy Auto (docs/26 slice 8c, C202).
//   GET ?date=   the principal, the school admin and the academic coordinator: one date (today unless given) with
//                the teachers away, every period to cover, the free teachers for each in the order of the rule,
//                and the covers nothing needs any more. `mayRecordLeave`: this person records leave on Staff.
//   GET          a teacher: the covers they hold from today on. Nobody else's, and nothing about anyone's leave.
//   POST { date, period, classId, substituteUserId }   one person's tap: that teacher covers that period.
//                Nothing is assigned any other way, and no message is sent.
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!PROXY_ROLES.includes(claims.role)) return ruleError(403, 'not_allowed');
    const today = indiaDate();
    const days = { today, tomorrow: addDays(today, 1), last: addDays(today, PROXY_AHEAD_DAYS) };
    const headers = { 'Cache-Control': 'no-store' };
    if (!PROXY_ARRANGERS.includes(claims.role)) {
      return NextResponse.json({ arranger: false, ...days, mine: await coversBetween(db, claims.schoolId, claims.sub, today, days.last) }, { headers });
    }
    const date = new URL(req.url).searchParams.get('date') ?? today;
    if (!isLeaveDate(date)) return ruleError(400, 'not_sent_properly');
    const day = await proxyDay(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, date, today);
    return NextResponse.json({ arranger: true, ...days, mayRecordLeave: LEAVE_OFFICE.includes(claims.role), day }, { headers });
  });
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || typeof b.date !== 'string' || typeof b.period !== 'number' || !isUuid(b.classId) || !isUuid(b.substituteUserId)) return ruleError(400, 'not_sent_properly');
    const made = await assignCover(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { date: b.date, period: b.period, classId: b.classId as string, substituteUserId: b.substituteUserId as string });
    if (made.ok) return NextResponse.json({ substitutionId: made.substitutionId }, { status: 201 });
    if (made.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return jsonError(made.reason === 'date' ? 400 : 409, 'the cover was not assigned', { code: made.reason });
  });
}
