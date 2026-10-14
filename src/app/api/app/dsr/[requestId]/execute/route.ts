import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession, canAuthorizeErasure } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
import { executeDsrDeletion, NotAuthorizedForExecutionError, WrongRequestTypeError } from '@/lib/consent/dsr';
import { ruleError } from '@/lib/frameworks/route';

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
    return ruleError(403, 'not_allowed');
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
        afterState: { fieldsScrubbed: ['name', 'dob', 'gender'], documentsScrubbed: outcome.result.documentsScrubbed, dataCheckRowsErased: outcome.result.dataCheckRowsErased, rteRowsErased: outcome.result.rteRowsErased, admissionEnquiriesErased: outcome.result.admissionEnquiriesErased, admissionStepsErased: outcome.result.admissionStepsErased, admissionFamilyEnquiriesDeleted: outcome.result.admissionFamilyEnquiriesDeleted, attendanceRowsErased: outcome.result.attendanceRowsErased },
      });
      return outcome;
    });
    return NextResponse.json({ request, result });
  } catch (err) {
    if (err instanceof NotAuthorizedForExecutionError) return ruleError(409, 'approve_first');
    if (err instanceof WrongRequestTypeError) return ruleError(400, 'only_for_deletion');
    if (err instanceof Error && (err.message === 'request not found' || err.message === 'this request has already been executed')) {
      return err.message === 'request not found' ? ruleError(404, 'not_found', { field: 'data_request' }) : ruleError(409, 'already_done');
    }
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
