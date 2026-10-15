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

// Many rows in one statement, each as writeAuditLog writes it, in the order given (review of C229: a timetable
// publish writes one row for each period it changes). The hash chain links them one after another: the trigger of
// each row sees the rows before it in the same statement.
export async function writeAuditLogs(client: Pick<PoolClient, 'query'>, entries: readonly AuditEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await client.query(
    `insert into audit_log
       (school_id, actor_user_id, actor_role, event_action, target_type, target_id, before_state, after_state)
     select (e->>'schoolId')::uuid, (e->>'actorUserId')::uuid, (e->>'actorRole')::user_role, e->>'eventAction', e->>'targetType', e->>'targetId',
            nullif(e->'beforeState', 'null'::jsonb), nullif(e->'afterState', 'null'::jsonb)
       from jsonb_array_elements($1::jsonb) with ordinality as x(e, n)
      order by x.n`,
    [
      JSON.stringify(
        entries.map((entry) => ({
          schoolId: entry.schoolId,
          actorUserId: entry.actorUserId,
          actorRole: entry.actorRole,
          eventAction: entry.eventAction,
          targetType: entry.targetType ?? null,
          targetId: entry.targetId ?? null,
          beforeState: entry.beforeState || null,
          afterState: entry.afterState || null,
        }))
      ),
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

// The founder's "View as" starting (C165, C232 part B): the viewing's own row, with the reason the founder gave, and
// the ImpersonationStarted audit row that names it by its id, in one statement, so both are written or neither. The
// reason is kept beside the audit row, on impersonation_sessions, never in it (C224's rule, C230-A): that row is
// where the school viewed reads it (its Compliance page), and what it records never changes (a trigger). Runs as
// nca_super, the only role that may add a viewing.
export async function writeImpersonationAudit(
  client: Pick<PoolClient, 'query'>,
  entry: AuditEntry & { schoolId: string; actorUserId: string },
  viewing: { impersonationId: string; targetUserId: string; reason: string; expiresAt: Date }
): Promise<void> {
  await client.query(
    `with s as (
       insert into impersonation_sessions (impersonation_id, actor_user_id, target_user_id, target_school_id, reason, expires_at)
       values ($9, $2, $12, $1, $10, $11)
       returning impersonation_id
     )
     insert into audit_log
       (school_id, actor_user_id, actor_role, event_action, target_type, target_id, before_state, after_state)
     select $1, $2, $3, $4, $5, $6, $7, $8 from s`,
    [
      entry.schoolId,
      entry.actorUserId,
      entry.actorRole,
      entry.eventAction,
      entry.targetType ?? null,
      entry.targetId ?? null,
      entry.beforeState ? JSON.stringify(entry.beforeState) : null,
      entry.afterState ? JSON.stringify(entry.afterState) : null,
      viewing.impersonationId,
      viewing.reason,
      viewing.expiresAt,
      viewing.targetUserId,
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
