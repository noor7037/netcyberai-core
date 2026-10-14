import type { PoolClient } from 'pg';
import type { StaffRole } from '@/lib/auth/types';

interface AuditEntry {
  schoolId: string | null; // null = platform-level event
  actorUserId: string | null;
  actorRole: StaffRole | null;
  eventAction: string;
  targetType?: string;
  targetId?: string;
  beforeState?: unknown;
  afterState?: unknown;
}

// Writes through whatever client the caller is already inside a
// withTenantContext/withSuperAdminBypass transaction on -- never opens
// its own connection or role. db/rls_policies.sql's audit_hash_chain
// trigger and audit_insert_only policy do the rest (hash chaining,
// append-only). Never logs a plaintext credential or token; callers are
// responsible for keeping before/after state to that same rule.
export async function writeAuditLog(client: Pick<PoolClient, 'query'>, entry: AuditEntry): Promise<void> {
  await client.query(
    `insert into audit_log
       (school_id, actor_user_id, actor_role, event_action, target_type, target_id, before_state, after_state)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      entry.schoolId,
      entry.actorUserId,
      entry.actorRole,
      entry.eventAction,
      entry.targetType ?? null,
      entry.targetId ?? null,
      entry.beforeState ? JSON.stringify(entry.beforeState) : null,
      entry.afterState ? JSON.stringify(entry.afterState) : null,
    ]
  );
}

// An entitlement change (C124). The founder's reason is founder-only: it
// goes to entitlement_change_reasons, which only nca_super can read or
// write, never into audit_log (a school reads its own audit rows; the
// database hides any 'entitlement.%' row that carries one). One statement, so
// the audit row and its reason are written together or not at all. Runs as
// nca_super.
export async function writeEntitlementAudit(client: Pick<PoolClient, 'query'>, entry: AuditEntry & { schoolId: string }, reason: string): Promise<void> {
  await client.query(
    `with a as (
       insert into audit_log
         (school_id, actor_user_id, actor_role, event_action, target_type, target_id, before_state, after_state)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning audit_id
     )
     insert into entitlement_change_reasons (audit_id, school_id, reason)
     select audit_id, $1, $9 from a`,
    [
      entry.schoolId,
      entry.actorUserId,
      entry.actorRole,
      entry.eventAction,
      entry.targetType ?? null,
      entry.targetId ?? null,
      entry.beforeState ? JSON.stringify(entry.beforeState) : null,
      entry.afterState ? JSON.stringify(entry.afterState) : null,
      reason,
    ]
  );
}

// An attendance change with the words the person gave for it (review of C224): the office's reason for entering or
// correcting a past day, or a late correction's note. The words are kept beside the audit row, in
// attendance_change_reasons (read by the office and the person who wrote them, removed by a data request's erasure),
// never in the row itself (C56). One statement, so both are written or neither. No words: the audit row alone.
export async function writeAttendanceAudit(
  client: Pick<PoolClient, 'query'>,
  entry: AuditEntry & { schoolId: string; actorUserId: string },
  words: { studentId: string; reason: string } | null
): Promise<void> {
  if (!words) return writeAuditLog(client, entry);
  await client.query(
    `with a as (
       insert into audit_log
         (school_id, actor_user_id, actor_role, event_action, target_type, target_id, before_state, after_state)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning audit_id
     )
     insert into attendance_change_reasons (audit_id, school_id, student_id, reason, written_by)
     select audit_id, $1, $9, $10, $2 from a`,
    [
      entry.schoolId,
      entry.actorUserId,
      entry.actorRole,
      entry.eventAction,
      entry.targetType ?? null,
      entry.targetId ?? null,
      entry.beforeState ? JSON.stringify(entry.beforeState) : null,
      entry.afterState ? JSON.stringify(entry.afterState) : null,
      words.studentId,
      words.reason,
    ]
  );
}
