import type { PoolClient } from 'pg';
import { deleteDocument } from '@/lib/capture/storage';
import { tombstoneVerificationsForStudent } from './guardian-verification';

// Task 3: staff-initiated data subject requests -- no parent portal
// exists (Decision Log C13), so there is no self-service form. A
// parent asks by phone or in person; staff logs the request against
// the real student record.
export const DSR_REQUEST_TYPES = ['access', 'correction', 'deletion'] as const;
export type DsrRequestType = (typeof DSR_REQUEST_TYPES)[number];
export const DSR_REQUEST_STATUSES = ['logged', 'in_progress', 'completed', 'rejected'] as const;
export type DsrRequestStatus = (typeof DSR_REQUEST_STATUSES)[number];

export interface DsrRequestRow {
  request_id: string;
  student_id: string;
  request_type: DsrRequestType;
  requested_by_description: string;
  logged_by: string;
  status: DsrRequestStatus;
  notes: string | null;
  authorized_by: string | null;
  authorized_at: string | null;
  executed_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function createDsrRequest(
  client: PoolClient,
  params: { schoolId: string; studentId: string; requestType: DsrRequestType; requestedByDescription: string; notes: string | null; loggedBy: string }
): Promise<DsrRequestRow> {
  const { rows } = await client.query(
    `insert into data_subject_requests (school_id, student_id, request_type, requested_by_description, notes, logged_by)
     values ($1, $2, $3, $4, $5, $6)
     returning *`,
    [params.schoolId, params.studentId, params.requestType, params.requestedByDescription, params.notes, params.loggedBy]
  );
  return rows[0];
}

export async function listDsrRequests(client: PoolClient, schoolId: string, studentId?: string): Promise<DsrRequestRow[]> {
  const { rows } = studentId
    ? await client.query(`select * from data_subject_requests where school_id = $1 and student_id = $2 order by created_at desc`, [
        schoolId,
        studentId,
      ])
    : await client.query(`select * from data_subject_requests where school_id = $1 order by created_at desc`, [schoolId]);
  return rows;
}

// 'completed' is a valid target here for access/correction requests,
// which have no separate execution mechanism -- staff just marks them
// done. A deletion request reaching 'completed' this way (rather than
// through executeDsrDeletion) would mean the record was never actually
// pseudonymized; the route calling this rejects that combination
// before it reaches here.
export async function updateDsrStatus(
  client: PoolClient,
  params: { schoolId: string; requestId: string; status: DsrRequestStatus; notes: string | null }
): Promise<DsrRequestRow | null> {
  const { rows } = await client.query(
    `update data_subject_requests set status = $3, notes = coalesce($4, notes), updated_at = now()
     where school_id = $1 and request_id = $2
     returning *`,
    [params.schoolId, params.requestId, params.status, params.notes]
  );
  return rows[0] ?? null;
}

export class NotAuthorizedForExecutionError extends Error {}
export class WrongRequestTypeError extends Error {}

// Task 3's explicit, separately-confirmed authorization gate: logging a
// deletion request never authorizes anything by itself. A distinct
// role-restricted action (route enforces school_admin/principal --
// see require-app-session.ts's canAuthorizeErasure) must run first,
// before execute() below will do anything.
export async function authorizeDsrDeletion(
  client: PoolClient,
  params: { schoolId: string; requestId: string; authorizedBy: string }
): Promise<DsrRequestRow> {
  const { rows: existing } = await client.query(`select request_type, status from data_subject_requests where school_id = $1 and request_id = $2`, [
    params.schoolId,
    params.requestId,
  ]);
  if (!existing[0]) throw new Error('request not found');
  if (existing[0].request_type !== 'deletion') throw new WrongRequestTypeError('only deletion requests can be authorized for erasure execution');

  const { rows } = await client.query(
    `update data_subject_requests set authorized_by = $3, authorized_at = now(), status = 'in_progress', updated_at = now()
     where school_id = $1 and request_id = $2
     returning *`,
    [params.schoolId, params.requestId, params.authorizedBy]
  );
  return rows[0];
}

export interface PseudonymizationResult {
  studentId: string;
  before: { name: string; dob: string | null };
  after: { name: string; dob: string | null };
  documentsScrubbed: number;
  storageObjectsDeleted: number;
  storageDeleteFailures: string[];
  guardianLinksTombstoned: number;
  qrTokensRevoked: number;
  dataCheckRowsErased: number;
}

// The mechanical answer Task 3 asks for: scrub the student's own PII
// fields, keep student_id unchanged so fees_ledger/attendance/marks/
// at-risk-flags/certificate_requests/qr_scan_log/recognition_events/
// pulse_response_log/consent_ledger -- every table that references
// student_id -- keep resolving via that same, never-deleted, id.
//
// Deliberately does NOT touch: `parents` (a guardian may have other,
// non-erased children -- scrubbing their shared row would corrupt a
// sibling's real record), and consent_ledger (append-only proof of
// what consent existed and when; whether DPDP erasure should actually
// override that retention is the real legal question this build
// flags rather than resolves -- see this function's own caller,
// executeDsrDeletion, for the authorization gate that stands in front
// of this ever running against a real record).
export async function pseudonymizeStudent(client: PoolClient, schoolId: string, studentId: string): Promise<PseudonymizationResult> {
  const { rows: beforeRows } = await client.query(`select name, dob from students where school_id = $1 and student_id = $2`, [schoolId, studentId]);
  if (!beforeRows[0]) throw new Error('student not found');
  const before = { name: beforeRows[0].name as string, dob: beforeRows[0].dob as string | null };

  const redactedName = `Redacted Student ${studentId.slice(0, 8)}`;
  await client.query(`update students set name = $3, dob = null, gender = 'not_given', updated_at = now() where school_id = $1 and student_id = $2`, [
    schoolId,
    studentId,
    redactedName,
  ]);

  // captured_documents/ocr_extractions: this student's own uploaded
  // documents and whatever OCR extracted from them (names, dates) are
  // exactly the PII an erasure request targets. Storage objects are
  // deleted best-effort (the service-role credential gap from Decision
  // Log C48 may still block this in a given deployment) -- the DB-level
  // scrub below runs regardless, so the pointer and the extracted
  // values are gone from this app's own data even if the underlying
  // Storage blob could not be reached this time.
  const { rows: docRows } = await client.query(
    `select document_id, storage_path from captured_documents where school_id = $1 and student_id = $2`,
    [schoolId, studentId]
  );
  let storageObjectsDeleted = 0;
  const storageDeleteFailures: string[] = [];
  for (const doc of docRows) {
    if (!doc.storage_path.startsWith('discarded:')) {
      try {
        await deleteDocument(doc.storage_path);
        storageObjectsDeleted++;
      } catch (err) {
        storageDeleteFailures.push(err instanceof Error ? err.message : String(err));
      }
    }
  }
  if (docRows.length > 0) {
    await client.query(`delete from ocr_extractions where school_id = $1 and document_id = any($2::uuid[])`, [
      schoolId,
      docRows.map((d) => d.document_id),
    ]);
    await client.query(
      `update captured_documents set storage_path = 'discarded:pseudonymized' where school_id = $1 and student_id = $2`,
      [schoolId, studentId]
    );
  }

  await tombstoneVerificationsForStudent(client, schoolId, studentId);
  const { rowCount: guardianLinksTombstoned } = await client.query(
    `select 1 from parent_student_map where school_id = $1 and student_id = $2 and verification_status = 'tombstoned'`,
    [schoolId, studentId]
  );

  // An active QR token still resolves to this student's (now scrubbed)
  // profile -- revoke it so a card printed before erasure can't keep
  // being scanned as if the record were still live.
  const { rowCount: qrTokensRevoked } = await client.query(
    `update student_qr_tokens set revoked_at = now(), revoke_reason = 'student pseudonymized (DSR erasure)'
     where school_id = $1 and student_id = $2 and revoked_at is null`,
    [schoolId, studentId]
  );

  // The student data check (C222): what was typed from the child's Aadhaar and every request about the child go with
  // the name and date of birth, through the database's own function (the app's role deletes nothing there).
  const { rows: dataCheck } = await client.query(`select public.erase_student_data_check($1) as n`, [studentId]);

  return {
    studentId,
    before,
    after: { name: redactedName, dob: null },
    documentsScrubbed: docRows.length,
    storageObjectsDeleted,
    storageDeleteFailures,
    guardianLinksTombstoned: guardianLinksTombstoned ?? 0,
    qrTokensRevoked: qrTokensRevoked ?? 0,
    dataCheckRowsErased: Number(dataCheck[0]?.n ?? 0),
  };
}

// The one place authorize -> execute actually runs the mechanism.
// Refuses outright if authorizeDsrDeletion (a separate, explicit action)
// never ran -- "gate actual execution behind an explicit authorization
// step that isn't automatic" is enforced here, not just documented.
export async function executeDsrDeletion(
  client: PoolClient,
  params: { schoolId: string; requestId: string }
): Promise<{ request: DsrRequestRow; result: PseudonymizationResult }> {
  const { rows } = await client.query(`select * from data_subject_requests where school_id = $1 and request_id = $2`, [
    params.schoolId,
    params.requestId,
  ]);
  const request: DsrRequestRow | undefined = rows[0];
  if (!request) throw new Error('request not found');
  if (request.request_type !== 'deletion') throw new WrongRequestTypeError('only deletion requests can be executed as erasure');
  if (!request.authorized_by || !request.authorized_at) {
    throw new NotAuthorizedForExecutionError('this request has not been authorized -- run the authorize step first');
  }
  if (request.executed_at) {
    throw new Error('this request has already been executed');
  }

  const result = await pseudonymizeStudent(client, params.schoolId, request.student_id);

  const { rows: updated } = await client.query(
    `update data_subject_requests set status = 'completed', executed_at = now(), updated_at = now()
     where school_id = $1 and request_id = $2
     returning *`,
    [params.schoolId, params.requestId]
  );
  return { request: updated[0], result };
}
