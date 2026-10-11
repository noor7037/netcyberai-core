import { NextRequest, NextResponse } from 'next/server';
import { ATTENDANCE_STATUSES, LEAVE_CODES, correctionWindowDays, officeCorrectAttendance, waitingCorrectionRequests } from '@/lib/attendance/attendance';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { indiaDate, isIsoDate } from '@/lib/time/india';

// The office's correction path (C146).
//   GET   the requests waiting for the office, and how many days back it may correct
//   POST  enter or correct one student's mark for a past day, with a reason
const OFFICE = ['principal', 'school_admin'];

export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!OFFICE.includes(claims.role)) return ruleError(403, 'not_allowed');
    const today = indiaDate();
    return NextResponse.json({ today, windowDays: await correctionWindowDays(db, claims.schoolId), requests: await waitingCorrectionRequests(db, claims.schoolId, today) });
  });
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!OFFICE.includes(claims.role)) return ruleError(403, 'not_allowed');
    const body = await readJson(req);
    const status = ATTENDANCE_STATUSES.find((s) => s === body?.status);
    const leaveCode = body?.leaveCode == null ? null : LEAVE_CODES.find((c) => c === body.leaveCode);
    if (!isUuid(body?.studentId) || !isIsoDate(body?.date) || !status || leaveCode === undefined || typeof body?.reason !== 'string' || body.reason.length > 500) return ruleError(400, 'not_sent_properly');
    const result = await officeCorrectAttendance(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { studentId: body.studentId as string, date: body.date as string, status, leaveCode, reason: body.reason, today: indiaDate() });
    if (result.ok) return NextResponse.json(result);
    if (result.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return jsonError(result.reason === 'outside_window' ? 409 : 400, 'this correction was not saved', { code: result.reason });
  });
}
