import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession, canWriteAttendance } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import {
  ATTENDANCE_STATUSES,
  LEAVE_CODES,
  AttendanceNotFoundError,
  CorrectionNoteRequiredError,
  PeriodLockedError,
  correctAttendance,
} from '@/lib/attendance/attendance';
import { indiaDate } from '@/lib/time/india';

type Params = { attendanceId: string };

// PATCH: the one correction path. 04_SYSTEM_DESIGN_PRD.md Sec3.2 --
// free within 10 minutes of marking, a mandatory note after that,
// never at all once the date has rolled over in India (period lock, C144).
export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!canWriteAttendance(guard.claims.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const status = body?.status;
  const note = typeof body?.note === 'string' ? body.note : null;
  if (!ATTENDANCE_STATUSES.includes(status)) {
    return NextResponse.json({ error: `status must be one of ${ATTENDANCE_STATUSES.join(', ')}` }, { status: 400 });
  }

  try {
    const updated = await withTenantContext(guard.claims, (client) =>
      correctAttendance(client, {
        schoolId: guard.claims.schoolId,
        attendanceId: params.attendanceId,
        newStatus: status,
        leaveCode: status === 'leave' ? LEAVE_CODES.find((c) => c === body?.leaveCode) ?? null : null,
        today: indiaDate(),
        note,
        actorUserId: guard.claims.sub,
        actorRole: guard.claims.role,
      })
    );
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof AttendanceNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof PeriodLockedError) return NextResponse.json({ error: err.message }, { status: 409 });
    if (err instanceof CorrectionNoteRequiredError) {
      return NextResponse.json({ error: err.message, noteRequired: true }, { status: 422 });
    }
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
