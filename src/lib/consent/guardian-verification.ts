import { randomInt, createHash } from 'crypto';
import type { PoolClient } from 'pg';

// Task 2's state machine, exactly as named in the PRD (04_SYSTEM_DESIGN_PRD.md
// Sec3.5) -- Stage 0 confirmed nothing like it existed anywhere in the
// live schema before this migration. Tracked per (parent_id, student_id)
// pair on parent_student_map, independent of consent_ledger's own
// purpose-scoped grants (see gate.ts's own note on why).
export const DIRECT_VERIFICATION_METHODS = ['dob_on_record', 'school_attested', 'digilocker_token'] as const;
export type DirectVerificationMethod = (typeof DIRECT_VERIFICATION_METHODS)[number];

const OTP_CODE_TTL_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;

export class GuardianLinkNotFoundError extends Error {}
export class InvalidTransitionError extends Error {}
export class CodeExpiredError extends Error {}
export class CodeMismatchError extends Error {}
export class TooManyAttemptsError extends Error {}

interface Link {
  verification_status: string;
  verification_code_hash: string | null;
  verification_code_expires_at: string | null;
  verification_attempts: number;
}

async function fetchLink(client: PoolClient, schoolId: string, parentId: string, studentId: string): Promise<Link> {
  const { rows } = await client.query(
    `select verification_status, verification_code_hash, verification_code_expires_at, verification_attempts
     from parent_student_map where school_id = $1 and parent_id = $2 and student_id = $3`,
    [schoolId, parentId, studentId]
  );
  if (!rows[0]) throw new GuardianLinkNotFoundError('this guardian is not linked to this student');
  return rows[0];
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

// Staff starts the flow -- moves a fresh/withdrawn/expired relationship
// into Pending. Idempotent from Pending itself (re-entering the flow
// doesn't error).
export async function startVerification(client: PoolClient, schoolId: string, parentId: string, studentId: string): Promise<void> {
  const link = await fetchLink(client, schoolId, parentId, studentId);
  if (!['not_required', 'pending', 'withdrawn', 'expired'].includes(link.verification_status)) {
    throw new InvalidTransitionError(`cannot start verification from status "${link.verification_status}"`);
  }
  await client.query(
    `update parent_student_map set verification_status = 'pending', updated_at = now()
     where school_id = $1 and parent_id = $2 and student_id = $3`,
    [schoolId, parentId, studentId]
  );
}

// The three synchronous methods: staff has already checked the DOB
// against the record, personally attests to the guardian's identity,
// or has visually inspected a Digilocker token the guardian shared --
// none of these involve this system contacting anyone, so Pending ->
// Verified -> Active happens in one step. evidenceRef is staff-entered
// free text (e.g. "DOB matched: 2015-03-04"), never raw Aadhaar/
// identity-document content.
export async function verifyDirect(
  client: PoolClient,
  params: { schoolId: string; parentId: string; studentId: string; method: DirectVerificationMethod; evidenceRef: string | null; actorUserId: string }
): Promise<void> {
  const link = await fetchLink(client, params.schoolId, params.parentId, params.studentId);
  // Unlike otp_plus_attestation (where 'requested' represents a real
  // in-flight step -- a code has actually been issued and is awaiting
  // confirmation), the three synchronous methods have no meaningful
  // intermediate state: staff either has the DOB match/personal
  // knowledge/Digilocker token in hand right now, or doesn't. Requiring
  // startVerification first would be a UI click that represents
  // nothing real. Allowed from every non-terminal-for-this-student
  // state except 'active' itself (already verified) and 'tombstoned'
  // (student pseudonymized -- see dsr.ts).
  if (!['not_required', 'pending', 'requested', 'withdrawn', 'expired'].includes(link.verification_status)) {
    throw new InvalidTransitionError(`cannot verify from status "${link.verification_status}"`);
  }
  await client.query(
    `update parent_student_map
     set verification_status = 'active', verification_method = $4, verification_evidence_ref = $5,
         verified_at = now(), verified_by = $6, updated_at = now()
     where school_id = $1 and parent_id = $2 and student_id = $3`,
    [params.schoolId, params.parentId, params.studentId, params.method, params.evidenceRef, params.actorUserId]
  );
}

// otp_plus_attestation, step 1: a system-generated code, NOT sent over
// WhatsApp/SMS (no real delivery channel exists until Prompt H/L) --
// staff reads it out loud or displays it on screen, the guardian
// repeats it back, staff types it into the confirm step below. Only
// the hash is ever persisted; the raw code is returned here once and
// never stored or logged anywhere.
export async function requestVerificationCode(
  client: PoolClient,
  schoolId: string,
  parentId: string,
  studentId: string
): Promise<{ code: string; expiresAt: Date }> {
  const link = await fetchLink(client, schoolId, parentId, studentId);
  if (!['not_required', 'pending', 'requested', 'withdrawn', 'expired'].includes(link.verification_status)) {
    throw new InvalidTransitionError(`cannot request a code from status "${link.verification_status}"`);
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = new Date(Date.now() + OTP_CODE_TTL_MINUTES * 60_000);
  await client.query(
    `update parent_student_map
     set verification_status = 'requested', verification_method = 'otp_plus_attestation',
         verification_code_hash = $4, verification_code_expires_at = $5, verification_attempts = 0, requested_at = now(), updated_at = now()
     where school_id = $1 and parent_id = $2 and student_id = $3`,
    [schoolId, parentId, studentId, hashCode(code), expiresAt.toISOString()]
  );
  return { code, expiresAt };
}

// otp_plus_attestation, step 2: staff types back the code the guardian
// read out. Expired or exhausted-attempts codes are rejected outright
// -- a stale or brute-forced code must never silently succeed.
export async function confirmVerificationCode(
  client: PoolClient,
  params: { schoolId: string; parentId: string; studentId: string; code: string; actorUserId: string }
): Promise<void> {
  const link = await fetchLink(client, params.schoolId, params.parentId, params.studentId);
  if (link.verification_status !== 'requested') {
    throw new InvalidTransitionError(`no code pending confirmation (status: "${link.verification_status}")`);
  }
  if (link.verification_attempts >= MAX_CODE_ATTEMPTS) {
    throw new TooManyAttemptsError('too many incorrect attempts -- request a new code');
  }
  if (!link.verification_code_expires_at || new Date(link.verification_code_expires_at) < new Date()) {
    throw new CodeExpiredError('this code has expired -- request a new one');
  }
  if (link.verification_code_hash !== hashCode(params.code)) {
    await client.query(
      `update parent_student_map set verification_attempts = verification_attempts + 1, updated_at = now()
       where school_id = $1 and parent_id = $2 and student_id = $3`,
      [params.schoolId, params.parentId, params.studentId]
    );
    throw new CodeMismatchError('code does not match');
  }
  await client.query(
    `update parent_student_map
     set verification_status = 'active', verification_code_hash = null, verification_code_expires_at = null,
         verified_at = now(), verified_by = $4, updated_at = now()
     where school_id = $1 and parent_id = $2 and student_id = $3`,
    [params.schoolId, params.parentId, params.studentId, params.actorUserId]
  );
}

export async function withdrawVerification(client: PoolClient, schoolId: string, parentId: string, studentId: string): Promise<void> {
  await client.query(
    `update parent_student_map set verification_status = 'withdrawn', updated_at = now()
     where school_id = $1 and parent_id = $2 and student_id = $3`,
    [schoolId, parentId, studentId]
  );
}

// Used only by DSR erasure execution (dsr.ts): once a student is
// pseudonymized, every guardian relationship tied to them is
// tombstoned -- a terminal state distinct from Withdrawn (which a
// family can still reactivate by re-verifying; Tombstoned cannot,
// since the student record it was ever active for no longer holds
// real identity data).
export async function tombstoneVerificationsForStudent(client: PoolClient, schoolId: string, studentId: string): Promise<void> {
  await client.query(
    `update parent_student_map set verification_status = 'tombstoned', updated_at = now()
     where school_id = $1 and student_id = $2`,
    [schoolId, studentId]
  );
}
