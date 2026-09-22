import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession, canWriteMasterData } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
import { DSR_REQUEST_STATUSES, updateDsrStatus, type DsrRequestStatus } from '@/lib/consent/dsr';

// Ordinary status progression for access/correction requests, and for
// rejecting/reopening a deletion request -- never for completing a
// deletion request itself, which must go through /authorize then
// /execute (Task 3's explicit, separately-confirmed gate).
export async function PATCH(req: NextRequest, { params }: { params: { requestId: string } }) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!canWriteMasterData(guard.claims.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const status = body?.status;
  if (!(DSR_REQUEST_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: `status must be one of ${DSR_REQUEST_STATUSES.join(', ')}` }, { status: 400 });
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
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(row);
  } catch (err) {
    if (err instanceof Error && err.message === 'deletion_requires_execute') {
      return NextResponse.json({ error: 'a deletion request can only be completed via authorize + execute, not a direct status update' }, { status: 409 });
    }
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
