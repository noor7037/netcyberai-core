import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import type { JobQueue, Sql } from '@/lib/jobs/types';
import { transition, type ApplicationEvent, type ApplicationState } from './application-machine';
import {
  CODE_RESEND_SECONDS,
  CODE_TTL_MINUTES,
  MAX_CODES_PER_APPLICATION,
  MAX_CODE_ATTEMPTS,
  codeHash,
  codeMatches,
  newVerificationCode,
  schoolNameKey,
  type ApplicationInput,
} from './intake';
import { createInvitation } from './invitations';

// School applications in the database (C98). Every function runs inside
// the caller's transaction (withPlatformService for the public form and
// the job runner, withTenantContext for a platform admin), changes state
// only through transition(), writes one audit row per transition (IDs and
// states only, C41), and returns the idempotency keys of the jobs it
// enqueued so the caller can run them right after commit.

export type Actor = { userId: string | null; role: StaffRole | null };
export const APPLICANT: Actor = { userId: null, role: null };

export class ApplicationError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message?: string
  ) {
    super(message ?? code);
    this.name = 'ApplicationError';
  }
}

type AppRow = {
  application_id: string;
  status: ApplicationState;
  school_name: string;
  city: string;
  state_code: string;
  board: string;
  principal_name: string;
  email: string;
  verify_code_hash: string | null;
  verify_expires_at: string | null;
  verify_attempts: number;
  codes_sent: number;
  last_code_sent_at: string | null;
  school_id: string | null;
  invitation_id: string | null;
};

const APP_COLUMNS = `application_id, status, school_name, city, state_code, board, principal_name, email,
  verify_code_hash, verify_expires_at, verify_attempts, codes_sent, last_code_sent_at, school_id, invitation_id`;

async function lockApplication(db: Sql, applicationId: string): Promise<AppRow | null> {
  const { rows } = await db.query(`select ${APP_COLUMNS} from school_applications where application_id = $1 for update`, [applicationId]);
  return (rows[0] as AppRow | undefined) ?? null;
}

async function audit(db: Sql, row: { application_id: string; school_id: string | null }, actor: Actor, action: string, after: Record<string, unknown>) {
  await writeAuditLog(db as PoolClient, {
    schoolId: row.school_id,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: `school_application.${action}`,
    targetType: 'school_applications',
    targetId: row.application_id,
    afterState: after,
  });
}

// The single way an application changes state. Returns whether it moved;
// an event that already happened is a no-op, an impossible one an error.
export async function applyEvent(db: Sql, row: AppRow, event: ApplicationEvent, actor: Actor): Promise<boolean> {
  const result = transition(row.status, event);
  if (!result.ok) throw new ApplicationError('invalid_transition', 409, result.reason);
  if (!result.changed) return false;
  await db.query(`update school_applications set status = $2, updated_at = now() where application_id = $1 and status = $3`, [
    row.application_id,
    result.to,
    result.from,
  ]);
  await audit(db, row, actor, event, { from: result.from, to: result.to });
  row.status = result.to;
  return true;
}

// ---- the public form ---------------------------------------------------------------

async function issueCode(db: Sql, queue: JobQueue, row: AppRow): Promise<{ sent: boolean; retryAfter?: number; jobKeys: string[] }> {
  if (row.codes_sent >= MAX_CODES_PER_APPLICATION) return { sent: false, jobKeys: [] };
  if (row.last_code_sent_at) {
    const waited = (Date.now() - new Date(row.last_code_sent_at).getTime()) / 1000;
    if (waited < CODE_RESEND_SECONDS) return { sent: false, retryAfter: Math.ceil(CODE_RESEND_SECONDS - waited), jobKeys: [] };
  }
  const code = newVerificationCode();
  const sendNumber = row.codes_sent + 1;
  await db.query(
    `update school_applications
        set verify_code_hash = $2, verify_expires_at = now() + make_interval(mins => $3), verify_attempts = 0,
            codes_sent = $4, last_code_sent_at = now(), updated_at = now()
      where application_id = $1`,
    [row.application_id, codeHash(row.application_id, code), CODE_TTL_MINUTES, sendNumber]
  );
  const key = `email.send:application_code:${row.application_id}:${sendNumber}`;
  await queue.enqueue(db, {
    type: 'email.send',
    idempotencyKey: key,
    payload: { to: [row.email], template: 'application_code', data: { schoolName: row.school_name }, secret: { code } },
    maxAttempts: 4,
  });
  return { sent: true, jobKeys: [key] };
}

export type SubmitResult =
  | { kind: 'created' | 'resent'; applicationId: string; codeSent: boolean; retryAfter?: number; jobKeys: string[] }
  | { kind: 'duplicate' };

// Dedupe on (normalised email, normalised school name): a second
// submission while the email is still unconfirmed sends a new code to the
// same application; after that it is "already received".
export async function submitApplication(db: Sql, queue: JobQueue, input: ApplicationInput): Promise<SubmitResult> {
  const nameKey = schoolNameKey(input.schoolName);
  const { rows } = await db.query(
    `select ${APP_COLUMNS} from school_applications
      where email_key = $1 and school_name_key = $2 and status <> 'rejected' for update`,
    [input.email, nameKey]
  );
  const existing = rows[0] as AppRow | undefined;
  if (existing) {
    if (existing.status !== 'submitted') return { kind: 'duplicate' };
    const issued = await issueCode(db, queue, existing);
    return { kind: 'resent', applicationId: existing.application_id, codeSent: issued.sent, retryAfter: issued.retryAfter, jobKeys: issued.jobKeys };
  }

  const applicationId = randomUUID();
  await db.query(
    `insert into school_applications
       (application_id, school_name, school_name_key, city, state_code, board, approx_students, principal_name, email, email_key, mobile)
     values ($1, $2, $3, $4, $5, $6::board_type, $7, $8, $9, $9, $10)`,
    [applicationId, input.schoolName, nameKey, input.city, input.stateCode, input.board, input.approxStudents, input.principalName, input.email, input.mobile]
  );
  const row = (await lockApplication(db, applicationId))!;
  await audit(db, row, APPLICANT, 'submitted', { to: 'submitted' });
  const issued = await issueCode(db, queue, row);
  return { kind: 'created', applicationId, codeSent: issued.sent, jobKeys: issued.jobKeys };
}

export async function resendApplicationCode(db: Sql, queue: JobQueue, applicationId: string) {
  const row = await lockApplication(db, applicationId);
  if (!row || row.status !== 'submitted') throw new ApplicationError('not_found', 404);
  return issueCode(db, queue, row);
}

export type VerifyResult =
  | { kind: 'verified'; jobKeys: string[] }
  | { kind: 'wrong_code'; attemptsLeft: number }
  | { kind: 'expired' }
  | { kind: 'too_many_attempts' };

export async function verifyApplicationEmail(
  db: Sql,
  queue: JobQueue,
  applicationId: string,
  code: string,
  origin: string
): Promise<VerifyResult> {
  const row = await lockApplication(db, applicationId);
  if (!row) throw new ApplicationError('not_found', 404);
  // Already confirmed (a double submit, a second tab): same answer again.
  if (row.status !== 'submitted') return { kind: 'verified', jobKeys: [] };
  if (row.verify_attempts >= MAX_CODE_ATTEMPTS) return { kind: 'too_many_attempts' };
  if (!row.verify_expires_at || new Date(row.verify_expires_at).getTime() < Date.now()) return { kind: 'expired' };
  await db.query(`update school_applications set verify_attempts = verify_attempts + 1, updated_at = now() where application_id = $1`, [applicationId]);
  if (!codeMatches(applicationId, code, row.verify_code_hash)) {
    return { kind: 'wrong_code', attemptsLeft: Math.max(0, MAX_CODE_ATTEMPTS - row.verify_attempts - 1) };
  }

  await applyEvent(db, row, 'verify_email', APPLICANT);
  await db.query(
    `update school_applications set email_verified_at = now(), verify_code_hash = null, verify_expires_at = null where application_id = $1`,
    [applicationId]
  );
  const key = `email.send:application_verified:${applicationId}`;
  await queue.enqueue(db, {
    type: 'email.send',
    idempotencyKey: key,
    payload: {
      to: 'founders',
      template: 'application_verified',
      data: { schoolName: row.school_name, city: row.city, reviewUrl: `${origin}/control/onboarding/applications/${applicationId}` },
    },
  });
  const jobKeys = [key];
  if ((await approvalMode(db)) === 'auto') {
    const approved = await approveApplication(db, queue, applicationId, { userId: null, role: null }, origin);
    jobKeys.push(...approved.jobKeys);
  }
  return { kind: 'verified', jobKeys };
}

// ---- approval mode ------------------------------------------------------------------------

export type ApprovalMode = 'manual' | 'auto';

export async function approvalMode(db: Sql): Promise<ApprovalMode> {
  const { rows } = await db.query(`select value from platform_settings where key = 'onboarding.approval_mode'`);
  return rows[0]?.value === 'auto' ? 'auto' : 'manual';
}

export async function setApprovalMode(db: Sql, mode: ApprovalMode, actor: Actor): Promise<void> {
  await db.query(
    `update platform_settings set value = $1::jsonb, updated_by = $2, updated_at = now() where key = 'onboarding.approval_mode'`,
    [JSON.stringify(mode), actor.userId]
  );
  await writeAuditLog(db as PoolClient, {
    schoolId: null,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'platform_setting.update',
    targetType: 'platform_settings',
    targetId: 'onboarding.approval_mode',
    afterState: { value: mode },
  });
}

// ---- the founder's decisions -----------------------------------------------------------------

export async function startReview(db: Sql, applicationId: string, actor: Actor): Promise<void> {
  const row = await lockApplication(db, applicationId);
  if (!row) throw new ApplicationError('not_found', 404);
  await applyEvent(db, row, 'start_review', actor);
}

// Approve, idempotent: one transaction creates the school, the principal's
// invitation and its invite job; approving again (double click, a second
// tab, a retried request) finds the application approved and does nothing.
// The principal's user and membership are created by the invite job, once
// Supabase Auth has created the sign-in account whose id they share.
export async function approveApplication(
  db: Sql,
  queue: JobQueue,
  applicationId: string,
  actor: Actor,
  origin: string
): Promise<{ changed: boolean; schoolId: string | null; invitationId: string | null; jobKeys: string[] }> {
  const row = await lockApplication(db, applicationId);
  if (!row) throw new ApplicationError('not_found', 404);
  if (row.status === 'email_verified') await applyEvent(db, row, 'start_review', actor);
  const changed = await applyEvent(db, row, 'approve', actor);
  if (!changed) return { changed: false, schoolId: row.school_id, invitationId: row.invitation_id, jobKeys: [] };

  const { rows } = await db.query(
    `insert into schools (name, board, tenant_type, jurisdiction) values ($1, $2::board_type, 'school', $3) returning school_id`,
    [row.school_name, row.board, row.state_code]
  );
  const schoolId = rows[0].school_id as string;
  await writeAuditLog(db as PoolClient, {
    schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'school.create',
    targetType: 'schools',
    targetId: schoolId,
    afterState: { fromApplication: applicationId },
  });
  const invitation = await createInvitation(db, queue, {
    schoolId,
    email: row.email,
    displayName: row.principal_name,
    role: 'principal',
    source: 'application',
    applicationId,
    invitedBy: actor,
    redirectTo: `${origin}/login`,
  });
  await db.query(
    `update school_applications set school_id = $2, invitation_id = $3, reviewed_by = $4, reviewed_at = now(), updated_at = now()
      where application_id = $1`,
    [applicationId, schoolId, invitation.invitationId, actor.userId]
  );
  return { changed: true, schoolId, invitationId: invitation.invitationId, jobKeys: invitation.jobKeys };
}

export async function rejectApplication(db: Sql, applicationId: string, actor: Actor, reason: string): Promise<boolean> {
  const row = await lockApplication(db, applicationId);
  if (!row) throw new ApplicationError('not_found', 404);
  const changed = await applyEvent(db, row, 'reject', actor);
  if (changed) {
    await db.query(
      `update school_applications set decision_reason = $2, reviewed_by = $3, reviewed_at = now(), updated_at = now() where application_id = $1`,
      [applicationId, reason, actor.userId]
    );
  }
  return changed;
}

// Called by the invite job once the principal's invite went out.
export async function markProvisioned(db: Sql, applicationId: string): Promise<void> {
  const row = await lockApplication(db, applicationId);
  if (row) await applyEvent(db, row, 'provision', APPLICANT);
}

// Called on the principal's first sign-in.
export async function markActive(db: Sql, applicationId: string, actor: Actor): Promise<void> {
  const row = await lockApplication(db, applicationId);
  if (!row) return;
  if (await applyEvent(db, row, 'activate', actor)) {
    await db.query(`update school_applications set activated_at = now() where application_id = $1`, [applicationId]);
  }
}

// ---- reading, for the founder ---------------------------------------------------------------------

export type ApplicationSummary = {
  application_id: string;
  status: ApplicationState;
  school_name: string;
  city: string;
  state_code: string;
  board: string;
  approx_students: number | null;
  principal_name: string;
  email: string;
  mobile: string;
  created_at: string;
  email_verified_at: string | null;
  reviewed_at: string | null;
  decision_reason: string | null;
  school_id: string | null;
  invitation_id: string | null;
  activated_at: string | null;
};

const SUMMARY_COLUMNS = `application_id, status, school_name, city, state_code, board::text as board, approx_students, principal_name,
  email, mobile, created_at, email_verified_at, reviewed_at, decision_reason, school_id, invitation_id, activated_at`;

export async function listApplications(db: Sql, status: ApplicationState | null, limit = 100): Promise<ApplicationSummary[]> {
  const { rows } = await db.query(
    `select ${SUMMARY_COLUMNS} from school_applications
      where ($1::text is null or status = $1) order by created_at desc limit $2`,
    [status, limit]
  );
  return rows as ApplicationSummary[];
}

export async function applicationCounts(db: Sql): Promise<Record<string, number>> {
  const { rows } = await db.query(`select status, count(*)::int as n from school_applications group by status`);
  return Object.fromEntries(rows.map((r) => [r.status as string, Number(r.n)]));
}

export async function getApplication(db: Sql, applicationId: string): Promise<ApplicationSummary | null> {
  const { rows } = await db.query(`select ${SUMMARY_COLUMNS} from school_applications where application_id = $1`, [applicationId]);
  return (rows[0] as ApplicationSummary | undefined) ?? null;
}
