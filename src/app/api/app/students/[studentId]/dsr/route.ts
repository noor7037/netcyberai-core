import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession, canWriteMasterData } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
import { DSR_REQUEST_TYPES, createDsrRequest, listDsrRequests, type DsrRequestType } from '@/lib/consent/dsr';
import { ruleError } from '@/lib/frameworks/route';

// Task 3: staff-initiated only (Decision Log C13 -- no parent portal).
// A parent asks by phone or in person; staff logs it against the real
// student record here.
export async function GET(req: NextRequest, { params }: { params: { studentId: string } }) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;

  try {
    const requests = await withTenantContext(guard.claims, (client) => listDsrRequests(client, guard.claims.schoolId, params.studentId));
    return NextResponse.json({ requests });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}

export async function POST(req: NextRequest, { params }: { params: { studentId: string } }) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!canWriteMasterData(guard.claims.role)) {
    return ruleError(403, 'not_allowed');
  }

  const body = await req.json().catch(() => null);
  const requestType = body?.requestType;
  const requestedByDescription = body?.requestedByDescription;
  if (!(DSR_REQUEST_TYPES as readonly string[]).includes(requestType)) {
    return ruleError(400, 'choose_one', { field: 'request_type' });
  }
  if (typeof requestedByDescription !== 'string' || requestedByDescription.trim().length === 0) {
    return ruleError(400, 'required', { field: 'who_asked' });
  }
  const notes = typeof body?.notes === 'string' ? body.notes.slice(0, 2000) : null;

  try {
    const row = await withTenantContext(guard.claims, async (client) => {
      const created = await createDsrRequest(client, {
        schoolId: guard.claims.schoolId,
        studentId: params.studentId,
        requestType: requestType as DsrRequestType,
        requestedByDescription: requestedByDescription.trim(),
        notes,
        loggedBy: guard.claims.sub,
      });
      await writeAuditLog(client, {
        schoolId: guard.claims.schoolId,
        actorUserId: guard.claims.sub,
        actorRole: guard.claims.role,
        eventAction: 'dsr.logged',
        targetType: 'data_subject_requests',
        targetId: created.request_id,
        afterState: { studentId: params.studentId, requestType },
      });
      return created;
    });
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
