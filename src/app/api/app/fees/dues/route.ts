import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { defaultDueDay, duesFor, periodKeysIn, raiseDues, type SessionDates } from '@/lib/fees/dues';
import { FINANCE } from '@/lib/fees/structures';
import { isIsoDate } from '@/lib/time/india';

// Dues (docs/23 6b, C159).
//   GET  ?classId=&sessionId=&month=YYYY-MM  the lines raised for that class and month, and the students with their RTE tag
//   POST raise the month's dues for a class. Safe to send twice.
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!FINANCE.includes(claims.role)) return ruleError(403, 'not_allowed');
    const q = req.nextUrl.searchParams;
    const classId = q.get('classId');
    const sessionId = q.get('sessionId');
    const month = q.get('month') ?? '';
    if (!isUuid(classId) || !isUuid(sessionId) || !MONTH.test(month)) return ruleError(400, 'not_sent_properly');
    const session = (await db.query(`select label, start_date::text as start_date, end_date::text as end_date from academic_sessions where school_id = $1 and session_id = $2`, [claims.schoolId, sessionId])).rows[0] as SessionDates | undefined;
    if (!session) return jsonError(404, 'not found', { code: 'unknown_session' });
    const students = (await db.query(`select student_id, name, rte_admission from students where school_id = $1 and class_id = $2 and status = 'active' order by name`, [claims.schoolId, classId])).rows;
    return NextResponse.json({ dueDay: await defaultDueDay(db, claims.schoolId), lines: await duesFor(db, claims.schoolId, classId, periodKeysIn(month, session)), students });
  });
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const body = await readJson(req);
    if (!isUuid(body?.classId) || !isUuid(body?.sessionId) || typeof body?.month !== 'string' || !MONTH.test(body.month) || !isIsoDate(body?.dueDate)) return ruleError(400, 'not_sent_properly');
    const result = await raiseDues(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { classId: body.classId as string, sessionId: body.sessionId as string, month: body.month, dueDate: body.dueDate as string });
    if (result.ok) return NextResponse.json(result, { status: result.raised > 0 ? 201 : 200 });
    if (result.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return jsonError(400, 'the dues were not raised', { code: result.reason });
  });
}
