import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession, canAuthorizeErasure } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
import { authorizeDsrDeletion, WrongRequestTypeError } from '@/lib/consent/dsr';
import { ruleError } from '@/lib/frameworks/route';

// Task 3's explicit, separately-confirmed authorization step. Logging a
// deletion request (POST .../dsr) never reaches this on its own --
// this is a deliberate second action, restricted to school_admin/
// principal, that must happen before /execute will do anything.
export async function POST(req: NextRequest, { params }: { params: { requestId: string } }) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!canAuthorizeErasure(guard.claims.role)) {
    return ruleError(403, 'not_allowed');
  }

  try {
    const row = await withTenantContext(guard.claims, async (client) => {
      const updated = await authorizeDsrDeletion(client, { schoolId: guard.claims.schoolId, requestId: params.requestId, authorizedBy: guard.claims.sub });
      await writeAuditLog(client, {
        schoolId: guard.claims.schoolId,
        actorUserId: guard.claims.sub,
        actorRole: guard.claims.role,
        eventAction: 'dsr.deletion_authorized',
        targetType: 'data_subject_requests',
        targetId: params.requestId,
      });
      return updated;
    });
    return NextResponse.json(row);
  } catch (err) {
    if (err instanceof WrongRequestTypeError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof Error && err.message === 'request not found') return NextResponse.json({ error: err.message }, { status: 404 });
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
