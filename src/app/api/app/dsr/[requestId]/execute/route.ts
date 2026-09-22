import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession, canAuthorizeErasure } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
import { executeDsrDeletion, NotAuthorizedForExecutionError, WrongRequestTypeError } from '@/lib/consent/dsr';

// The one place pseudonymization actually runs. Refuses outright unless
// /authorize already ran (executeDsrDeletion checks authorized_by/
// authorized_at itself, not just this route) -- nothing pseudonymizes
// a real record just because a request was logged, per Task 3's own
// instruction. Same role restriction as authorize: this is not a
// decision to make lightly, and it is irreversible.
export async function POST(req: NextRequest, { params }: { params: { requestId: string } }) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!canAuthorizeErasure(guard.claims.role)) {
    return NextResponse.json({ error: 'forbidden -- only school_admin/principal may execute erasure' }, { status: 403 });
  }

  try {
    const { request, result } = await withTenantContext(guard.claims, async (client) => {
      const outcome = await executeDsrDeletion(client, { schoolId: guard.claims.schoolId, requestId: params.requestId });
      await writeAuditLog(client, {
        schoolId: guard.claims.schoolId,
        actorUserId: guard.claims.sub,
        actorRole: guard.claims.role,
        eventAction: 'dsr.deletion_executed',
        targetType: 'students',
        targetId: outcome.result.studentId,
        afterState: { fieldsScrubbed: ['name', 'dob'], documentsScrubbed: outcome.result.documentsScrubbed },
      });
      return outcome;
    });
    return NextResponse.json({ request, result });
  } catch (err) {
    if (err instanceof NotAuthorizedForExecutionError) return NextResponse.json({ error: err.message }, { status: 409 });
    if (err instanceof WrongRequestTypeError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof Error && (err.message === 'request not found' || err.message === 'this request has already been executed')) {
      return NextResponse.json({ error: err.message }, { status: err.message === 'request not found' ? 404 : 409 });
    }
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
