import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession, canWriteMasterData } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
import {
  DIRECT_VERIFICATION_METHODS,
  GuardianLinkNotFoundError,
  InvalidTransitionError,
  CodeExpiredError,
  CodeMismatchError,
  TooManyAttemptsError,
  startVerification,
  verifyDirect,
  requestVerificationCode,
  confirmVerificationCode,
  withdrawVerification,
  type DirectVerificationMethod,
} from '@/lib/consent/guardian-verification';

type Params = { parentId: string; studentId: string };

// GET: current verification state for this guardian/student pair.
export async function GET(req: NextRequest, { params }: { params: Params }) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;

  try {
    const link = await withTenantContext(guard.claims, async (client) => {
      const { rows } = await client.query(
        `select verification_status, verification_method, verification_evidence_ref, requested_at, verified_at, verified_by,
                verification_code_expires_at, verification_attempts
         from parent_student_map where school_id = $1 and parent_id = $2 and student_id = $3`,
        [guard.claims.schoolId, params.parentId, params.studentId]
      );
      return rows[0] ?? null;
    });
    if (!link) return NextResponse.json({ error: 'guardian not linked to this student' }, { status: 404 });
    return NextResponse.json(link);
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}

// POST: every state transition, one action field -- start | verify_direct
// | request_code | confirm_code | withdraw. One resource (this
// guardian/student pair's own verification state), one route,
// mirroring the state machine itself rather than spreading five
// sub-routes across five files for what is a single small state object.
export async function POST(req: NextRequest, { params }: { params: Params }) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!canWriteMasterData(guard.claims.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const action = body?.action;

  try {
    if (action === 'start') {
      await withTenantContext(guard.claims, (client) => startVerification(client, guard.claims.schoolId, params.parentId, params.studentId));
      return NextResponse.json({ status: 'pending' });
    }

    if (action === 'verify_direct') {
      const method = body?.method;
      if (!(DIRECT_VERIFICATION_METHODS as readonly string[]).includes(method)) {
        return NextResponse.json({ error: `method must be one of ${DIRECT_VERIFICATION_METHODS.join(', ')}` }, { status: 400 });
      }
      const evidenceRef = typeof body?.evidenceRef === 'string' ? body.evidenceRef.slice(0, 500) : null;
      await withTenantContext(guard.claims, async (client) => {
        await verifyDirect(client, {
          schoolId: guard.claims.schoolId,
          parentId: params.parentId,
          studentId: params.studentId,
          method: method as DirectVerificationMethod,
          evidenceRef,
          actorUserId: guard.claims.sub,
        });
        await writeAuditLog(client, {
          schoolId: guard.claims.schoolId,
          actorUserId: guard.claims.sub,
          actorRole: guard.claims.role,
          eventAction: 'guardian_verification.active',
          targetType: 'parent_student_map',
          targetId: `${params.parentId}:${params.studentId}`,
          afterState: { method, studentId: params.studentId, parentId: params.parentId },
        });
      });
      return NextResponse.json({ status: 'active' });
    }

    if (action === 'request_code') {
      // Interim method, plainly flagged: no real OTP delivery channel
      // exists yet (WhatsApp/SMS come in Prompt H/L). The code is
      // returned to THIS staff-facing response only -- never sent
      // anywhere by the system -- for staff to read out loud or
      // display, with the guardian confirming it back over the phone
      // or in person.
      const { code, expiresAt } = await withTenantContext(guard.claims, (client) =>
        requestVerificationCode(client, guard.claims.schoolId, params.parentId, params.studentId)
      );
      return NextResponse.json({
        status: 'requested',
        code,
        expiresAt,
        interim: true,
        note: 'Interim method: read this code aloud or show it to the guardian. It is not sent by WhatsApp/SMS.',
      });
    }

    if (action === 'confirm_code') {
      const code = body?.code;
      if (typeof code !== 'string') {
        return NextResponse.json({ error: 'code is required' }, { status: 400 });
      }
      await withTenantContext(guard.claims, async (client) => {
        await confirmVerificationCode(client, {
          schoolId: guard.claims.schoolId,
          parentId: params.parentId,
          studentId: params.studentId,
          code,
          actorUserId: guard.claims.sub,
        });
        await writeAuditLog(client, {
          schoolId: guard.claims.schoolId,
          actorUserId: guard.claims.sub,
          actorRole: guard.claims.role,
          eventAction: 'guardian_verification.active',
          targetType: 'parent_student_map',
          targetId: `${params.parentId}:${params.studentId}`,
          afterState: { method: 'otp_plus_attestation', studentId: params.studentId, parentId: params.parentId },
        });
      });
      return NextResponse.json({ status: 'active' });
    }

    if (action === 'withdraw') {
      await withTenantContext(guard.claims, async (client) => {
        await withdrawVerification(client, guard.claims.schoolId, params.parentId, params.studentId);
        await writeAuditLog(client, {
          schoolId: guard.claims.schoolId,
          actorUserId: guard.claims.sub,
          actorRole: guard.claims.role,
          eventAction: 'guardian_verification.withdrawn',
          targetType: 'parent_student_map',
          targetId: `${params.parentId}:${params.studentId}`,
          afterState: { studentId: params.studentId, parentId: params.parentId },
        });
      });
      return NextResponse.json({ status: 'withdrawn' });
    }

    return NextResponse.json({ error: 'action must be one of start, verify_direct, request_code, confirm_code, withdraw' }, { status: 400 });
  } catch (err) {
    if (err instanceof GuardianLinkNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof InvalidTransitionError) return NextResponse.json({ error: err.message }, { status: 409 });
    if (err instanceof CodeExpiredError || err instanceof CodeMismatchError || err instanceof TooManyAttemptsError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
