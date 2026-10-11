import type { PoolClient } from 'pg';
import type { StaffRole } from '@/lib/auth/types';
import { syncStudentStatusWithConsent, type StudentStatusChange } from './student-status';

// The full six-purpose set (Decision Log C20), mirroring the live
// consent_purpose enum exactly. src/lib/onboarding/stages.ts already
// exports REQUIRED_CONSENT_PURPOSES (the required-for-service subset,
// core_records/operational_communication) for the onboarding
// completion meter -- this is the superset, for the actual gate.
export const ALL_CONSENT_PURPOSES = [
  'core_records',
  'operational_communication',
  'daily_pulse',
  'recognition',
  'weekly_brief',
  'at_risk',
] as const;
export type ConsentPurpose = (typeof ALL_CONSENT_PURPOSES)[number];

// THE consent gate function. Every future outbound path (Pulse,
// recognition, at-risk dispatch, class notices -- Prompt H onward)
// must call this before sending anything to a guardian for a given
// purpose. Nothing calls it yet; this prompt builds the gate, not the
// callers (see this prompt's own "why this precedes messaging" note).
//
// consent_ledger is append-only (a withdrawal is a new row, never a
// mutation -- Task 1), so "is this purpose currently granted" always
// means the LATEST row per (student, purpose), never a count or an
// aggregate. No row at all means ineligible -- not "required purposes
// default to true absent a record" -- a student with zero consent
// history (e.g. still `pending_consent`, per Prompt F) is ineligible
// for everything until a real grant is recorded, full stop. This
// mirrors src/lib/onboarding/consent-summary.ts's own
// `distinct on (student_id, purpose) ... order by created_at desc`
// query shape exactly -- same definition of "current state", not a
// second one that could drift from the onboarding meter's.
export async function isPurposeGranted(
  client: PoolClient,
  schoolId: string,
  studentId: string,
  purpose: ConsentPurpose
): Promise<boolean> {
  const { rows } = await client.query(
    `select granted from consent_ledger
     where school_id = $1 and student_id = $2 and purpose = $3
     order by created_at desc limit 1`,
    [schoolId, studentId, purpose]
  );
  return rows[0]?.granted === true;
}

// All six purposes in one round trip -- for a consent-management UI or
// a batch dispatch job that needs every purpose's state at once,
// rather than six separate isPurposeGranted calls.
export async function getConsentEligibility(
  client: PoolClient,
  schoolId: string,
  studentId: string
): Promise<Record<ConsentPurpose, boolean>> {
  const { rows } = await client.query(
    `select distinct on (purpose) purpose, granted
     from consent_ledger
     where school_id = $1 and student_id = $2
     order by purpose, created_at desc`,
    [schoolId, studentId]
  );
  const result = Object.fromEntries(ALL_CONSENT_PURPOSES.map((p) => [p, false])) as Record<ConsentPurpose, boolean>;
  for (const row of rows) {
    if ((ALL_CONSENT_PURPOSES as readonly string[]).includes(row.purpose)) {
      result[row.purpose as ConsentPurpose] = row.granted === true;
    }
  }
  return result;
}

export interface ConsentLedgerRow {
  consent_id: string;
  purpose: ConsentPurpose;
  granted: boolean;
  verification_method: string;
  evidence_ref: string | null;
  actor_user_id: string | null;
  notice_version: string;
  created_at: string;
}

// Full history, every row, oldest first -- proves the append-only
// guarantee visually (a grant and a later withdrawal both present,
// neither one overwritten) and is what Task 1's UI and this prompt's
// own VERIFY evidence both read from.
export async function getConsentHistory(client: PoolClient, schoolId: string, studentId: string): Promise<ConsentLedgerRow[]> {
  const { rows } = await client.query(
    `select consent_id, purpose, granted, verification_method, evidence_ref, actor_user_id, notice_version, created_at
     from consent_ledger where school_id = $1 and student_id = $2
     order by created_at asc`,
    [schoolId, studentId]
  );
  return rows;
}

export class GuardianNotActiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GuardianNotActiveError';
  }
}

export interface RecordConsentParams {
  schoolId: string;
  studentId: string;
  purpose: ConsentPurpose;
  granted: boolean;
  parentId: string;
  actorUserId: string;
  actorRole: StaffRole;
  noticeVersion: string;
}

export interface ConsentDecisionResult extends ConsentLedgerRow {
  // Set when this decision moved the student between 'pending_consent' and
  // 'active' (C142, ./student-status.ts); null when the status stayed.
  studentStatusChange: StudentStatusChange | null;
}

// Task 1: withdrawal is a new row, never an UPDATE -- this function
// only ever INSERTs (consent_ledger's own grants no longer permit
// app_user UPDATE/DELETE at all, Decision Log C51, so a mutation
// attempt would fail at the database layer even if this code tried).
//
// Task 2: "a guardian's identity gets checked ... before consent tied
// to them becomes Active" -- enforced here as a write-time rule, not
// baked into the eligibility read above: granting (granted=true)
// requires the named guardian's parent_student_map row to already be
// 'active'; withdrawing never requires re-checking that (a family
// calling to stop is honored regardless of the guardian's current
// verification standing). consent_ledger has no parent_id column of
// its own (schema predates this prompt and is shared with the
// onboarding consent-completion meter) -- the guardian relied upon is
// recorded in evidence_ref ("parent:<uuid>"), a pointer, exactly what
// that column's own comment says it is for, and verification_method
// is carried over from that guardian's own recorded method.
//
// C142: the student's status follows the ledger in the same transaction.
// The grant that completes the required purposes makes the student
// 'active'; withdrawing a required purpose returns an active student to
// 'pending_consent'. Each move writes its own audit row.
export async function recordConsentDecision(client: PoolClient, params: RecordConsentParams): Promise<ConsentDecisionResult> {
  const { rows: linkRows } = await client.query(
    `select verification_status, verification_method from parent_student_map
     where school_id = $1 and parent_id = $2 and student_id = $3`,
    [params.schoolId, params.parentId, params.studentId]
  );
  const link = linkRows[0];
  if (!link) {
    throw new Error('this guardian is not linked to this student');
  }
  if (params.granted && link.verification_status !== 'active') {
    throw new GuardianNotActiveError(
      `guardian is not Active for this student (current status: ${link.verification_status}) -- complete verification before granting consent`
    );
  }
  const verificationMethod = link.verification_method ?? 'school_attested';

  const { rows } = await client.query(
    `insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, evidence_ref, actor_user_id, notice_version)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning consent_id, purpose, granted, verification_method, evidence_ref, actor_user_id, notice_version, created_at`,
    [
      params.schoolId,
      params.studentId,
      params.purpose,
      params.granted,
      verificationMethod,
      `parent:${params.parentId}`,
      params.actorUserId,
      params.noticeVersion,
    ]
  );
  const studentStatusChange = await syncStudentStatusWithConsent(client, {
    schoolId: params.schoolId,
    studentId: params.studentId,
    actorUserId: params.actorUserId,
    actorRole: params.actorRole,
    decision: { purpose: params.purpose, granted: params.granted },
    consentId: rows[0].consent_id,
  });
  return { ...rows[0], studentStatusChange };
}
