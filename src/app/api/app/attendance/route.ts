import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession, canWriteAttendance } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { ATTENDANCE_STATUSES, getAttendanceRoster, markAttendance, type AttendanceStatus } from '@/lib/attendance/attendance';

// GET: roster + today's (or any requested date's) marks combined --
// the teacher screen needs both to render present-all/tap-absent
// against actual current state, not just the class list.
export async function GET(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;

  const { searchParams } = req.nextUrl;
  const classId = searchParams.get('classId');
  const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  if (!classId) {
    return NextResponse.json({ error: 'classId is required' }, { status: 400 });
  }

  try {
    const roster = await withTenantContext(guard.claims, (client) =>
      getAttendanceRoster(client, { schoolId: guard.claims.schoolId, classId, date })
    );
    return NextResponse.json({ date, roster });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}

// POST: daily marking, today only. A student already marked for today
// is skipped here (alreadyMarked) -- correcting an existing mark goes
// through PATCH /api/app/attendance/[attendanceId], the one path that
// carries the edit-window/audit-note rules.
export async function POST(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!canWriteAttendance(guard.claims.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const classId = typeof body?.classId === 'string' ? body.classId : null;
  const entries = Array.isArray(body?.entries) ? body.entries : null;
  const today = new Date().toISOString().slice(0, 10);

  if (!classId || !entries) {
    return NextResponse.json({ error: 'classId and entries are required' }, { status: 400 });
  }
  for (const e of entries) {
    if (typeof e?.studentId !== 'string' || !ATTENDANCE_STATUSES.includes(e?.status)) {
      return NextResponse.json(
        { error: `each entry needs studentId and status (one of ${ATTENDANCE_STATUSES.join(', ')})` },
        { status: 400 }
      );
    }
  }

  try {
    const result = await withTenantContext(guard.claims, (client) =>
      markAttendance(client, {
        schoolId: guard.claims.schoolId,
        classId,
        date: today,
        markedBy: guard.claims.sub,
        entries: entries as { studentId: string; status: AttendanceStatus }[],
      })
    );
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
