import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession, canWriteAttendance } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { ATTENDANCE_STATUSES, LEAVE_CODES, getAttendanceRoster, submitAttendance, type AttendanceEntry } from '@/lib/attendance/attendance';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { indiaDate, isIsoDate } from '@/lib/time/india';

// GET: roster + today's (or any requested date's) marks combined --
// the teacher screen needs both to render present-all/tap-absent
// against actual current state, not just the class list. "Today" is the
// day in India (C144).
export async function GET(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;

  const { searchParams } = req.nextUrl;
  const classId = searchParams.get('classId');
  const today = indiaDate();
  const asked = searchParams.get('date');
  const date = isIsoDate(asked) ? asked : today;
  if (!isUuid(classId)) {
    return NextResponse.json({ error: 'classId is required' }, { status: 400 });
  }

  try {
    const roster = await withTenantContext(guard.claims, (client) =>
      getAttendanceRoster(client, { schoolId: guard.claims.schoolId, classId, date, today })
    );
    return NextResponse.json({ date, today, roster });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}

// POST: daily marking, today (India) only. A student already marked for
// today is skipped here (alreadyMarked, with `differences` where the saved
// mark is not the one sent) -- correcting an existing mark goes through
// PATCH /api/app/attendance/[attendanceId], the one path that carries the
// edit-window/audit-note rules.
//
// A phone that was offline sends `operationId` (applied once however often
// it arrives) and `forDate` (the day the marks were made for): a submission
// for a day that is over saves nothing and answers 409 `day_passed`.
export async function POST(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!canWriteAttendance(guard.claims.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const classId = isUuid(body?.classId) ? (body.classId as string) : null;
  const entries = Array.isArray(body?.entries) ? (body.entries as unknown[]) : null;
  const today = indiaDate();

  if (!classId || !entries || entries.length > 500) {
    return NextResponse.json({ error: 'classId and entries are required' }, { status: 400 });
  }
  if (body.operationId != null && !isUuid(body.operationId)) return NextResponse.json({ error: 'operationId must be an id' }, { status: 400 });
  if (body.forDate != null && !isIsoDate(body.forDate)) return NextResponse.json({ error: 'forDate must be a date' }, { status: 400 });
  const clean: AttendanceEntry[] = [];
  for (const raw of entries) {
    const e = raw as { studentId?: unknown; status?: unknown; leaveCode?: unknown };
    const status = ATTENDANCE_STATUSES.find((s) => s === e?.status);
    const leaveCode = e?.leaveCode == null ? null : LEAVE_CODES.find((c) => c === e.leaveCode);
    if (!isUuid(e?.studentId) || !status || leaveCode === undefined) {
      return NextResponse.json(
        { error: `each entry needs studentId and status (one of ${ATTENDANCE_STATUSES.join(', ')})` },
        { status: 400 }
      );
    }
    clean.push({ studentId: e.studentId as string, status, leaveCode: status === 'leave' ? leaveCode : null });
  }

  try {
    const result = await withTenantContext(guard.claims, (client) =>
      submitAttendance(client, {
        schoolId: guard.claims.schoolId,
        classId,
        forDate: (body.forDate as string | undefined) ?? today,
        today,
        markedBy: guard.claims.sub,
        entries: clean,
        operationId: (body.operationId as string | undefined) ?? null,
        secondsToMark: typeof body.secondsToMark === 'number' ? body.secondsToMark : null,
      })
    );
    if (result.outcome === 'not_yours') return NextResponse.json({ error: 'this change was not made by you', code: 'not_yours' }, { status: 409 });
    if (result.outcome === 'day_passed') return NextResponse.json({ error: 'that day is over', code: 'day_passed', ...result }, { status: 409 });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
