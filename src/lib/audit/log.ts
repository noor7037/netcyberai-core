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
