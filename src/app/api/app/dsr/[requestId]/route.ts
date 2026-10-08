import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession, canWriteMasterData } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
import { DSR_REQUEST_STATUSES, updateDsrStatus, type DsrRequestStatus } from '@/lib/consent/dsr';
import { ruleError } from '@/lib/frameworks/route';

// Ordinary status progression for access/correction requests, and for
// rejecting/reopening a deletion request -- never for completing a
// deletion request itself, which must go through /authorize then
// /execute (Task 3's explicit, separately-confirmed gate).
export async function PATCH(req: NextRequest, { params }: { params: { requestId: string } }) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!canWriteMasterData(guard.claims.role)) {
    return ruleError(403, 'not_allowed');
  }

  const body = await req.json().catch(() => null);
  const status = body?.status;
  if (!(DSR_REQUEST_STATUSES as readonly string[]).includes(status)) {
    return ruleError(400, 'choose_one', { field: 'status' });
  }
  const notes = typeof body?.notes === 'string' ? body.notes.slice(0, 2000) : null;

  try {
    const row = await withTenantContext(guard.claims, async (client) => {
      if (status === 'completed') {
        const { rows } = await client.query(`select request_type from data_subject_requests where school_id = $1 and request_id = $2`, [
          guard.claims.schoolId,
          params.requestId,
        ]);
        if (rows[0]?.request_type === 'deletion') {
          throw new Error('deletion_requires_execute');
        }
      }
      const updated = await updateDsrStatus(client, {
        schoolId: guard.claims.schoolId,
        requestId: params.requestId,
        status: status as DsrRequestStatus,
        notes,
      });
      if (updated) {
        await writeAuditLog(client, {
          schoolId: guard.claims.schoolId,
          actorUserId: guard.claims.sub,
          actorRole: guard.claims.role,
          eventAction: 'dsr.status_updated',
          targetType: 'data_subject_requests',
          targetId: params.requestId,
          afterState: { status },
        });
      }
      return updated;
    });
    if (!row) return ruleError(404, 'not_found', { field: 'data_request' });
    return NextResponse.json(row);
  } catch (err) {
    if (err instanceof Error && err.message === 'deletion_requires_execute') {
      return ruleError(409, 'two_step_delete');
    }
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
