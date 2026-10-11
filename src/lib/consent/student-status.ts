import type { PoolClient } from 'pg';
import type { StaffRole } from '@/lib/auth/types';
import { writeAuditLog } from '@/lib/audit/log';
import { REQUIRED_CONSENT_PURPOSES } from '@/lib/onboarding/stages';

// A student's status follows the consent ledger (C142).
//
//   pending_consent → active            every purpose that is required for
//                                       service is currently granted
//   active          → pending_consent   a required purpose is withdrawn
//                                       (only by that withdrawal itself: a
//                                       student who was made active before
//                                       this rule, with no consent on
//                                       record, is not moved by a grant or
//                                       by an optional purpose)
//
// "Required" is PRD §3.5's pair, core_records and operational_communication
// (REQUIRED_CONSENT_PURPOSES); the database holds the same definition in
// student_required_consents_granted(), which this module and the trigger on
// students.status both use, so there is one answer. 'inactive' and
// 'transferred' are the office's own decisions and are never moved here.
//
// Runs inside the caller's transaction, straight after the consent row is
// written: the row, the status and the audit row are saved together or not
// at all. Calling it again changes nothing.

export type ConsentDrivenStatus = 'pending_consent' | 'active';
export interface StudentStatusChange {
  from: ConsentDrivenStatus;
  to: ConsentDrivenStatus;
}

export interface ConsentDecision {
  purpose: string;
  granted: boolean;
}

export function isRequiredPurpose(purpose: string): boolean {
  return (REQUIRED_CONSENT_PURPOSES as readonly string[]).includes(purpose);
}

export function nextStudentStatus(current: string, requiredGranted: boolean, decision: ConsentDecision): ConsentDrivenStatus | null {
  if (current === 'pending_consent' && requiredGranted) return 'active';
  if (current === 'active' && !requiredGranted && !decision.granted && isRequiredPurpose(decision.purpose)) return 'pending_consent';
  return null;
}

export async function syncStudentStatusWithConsent(
  client: Pick<PoolClient, 'query'>,
  params: { schoolId: string; studentId: string; actorUserId: string | null; actorRole: StaffRole | null; decision: ConsentDecision; consentId?: string }
): Promise<StudentStatusChange | null> {
  // Lock first, then read the ledger in a second statement: two people
  // granting the two required purposes at the same moment take turns here,
  // and the second one's check then sees the first one's committed row.
  const { rows } = await client.query(`select status::text as status from students where school_id = $1 and student_id = $2 for update`, [
    params.schoolId,
    params.studentId,
  ]);
  const current = rows[0];
  if (!current) return null;
  const { rows: consent } = await client.query(`select public.student_required_consents_granted($1, $2) as required_granted`, [
    params.schoolId,
    params.studentId,
  ]);
  const to = nextStudentStatus(current.status, consent[0]?.required_granted === true, params.decision);
  if (!to) return null;
  const from = current.status as ConsentDrivenStatus;

  await client.query(`update students set status = $3, updated_at = now() where school_id = $1 and student_id = $2`, [
    params.schoolId,
    params.studentId,
    to,
  ]);
  // IDs and states only, never a name (C41).
  await writeAuditLog(client, {
    schoolId: params.schoolId,
    actorUserId: params.actorUserId,
    actorRole: params.actorRole,
    eventAction: to === 'active' ? 'student.activated' : 'student.returned_to_pending_consent',
    targetType: 'students',
    targetId: params.studentId,
    beforeState: { status: from },
    afterState: {
      status: to,
      reason: to === 'active' ? 'required_consents_granted' : 'required_consent_withdrawn',
      ...(params.consentId ? { consentId: params.consentId } : {}),
    },
  });
  return { from, to };
}
