import type { PoolClient } from 'pg';
import type { StaffRole } from '@/lib/auth/types';
import { writeAuditLog } from '@/lib/audit/log';
import { failureOfKind, type SendFailureKind } from '@/lib/jobs/policy';
import { queueWhatsAppMessage, type QueueLike } from './gate';
import { hasDocumentHeader } from './templates';

// "Retry now" on the communication delivery log (W21-M3). The office sends a message that was given up on once more,
// at once. The old row stays as it was (the log only moves forward); a NEW message is queued from its words, its dedupe
// key 'retry:<log_id>:<n>' says which it is a retry of, and the gate reads every rule again. A failure that trying
// again cannot mend (a wrong number, a number that asked to stop, words Meta rejected) is not offered and not done.

export const RETRY_ROLES: readonly string[] = ['principal', 'school_admin'];
export type RetryActor = { schoolId: string; userId: string; role: StaffRole };
export type RetryResult =
  | { ok: true; logId: string; status: string }
  | { ok: false; reason: 'not_allowed' | 'not_found' | 'not_failed' | 'permanent' | 'already' | 'not_retryable' };

// Which failed rows the log offers the button on: the list uses it, and the action checks again.
export const mayRetry = (r: { status: string; failure_kind: string | null; retried: boolean; template_name: string | null }): boolean =>
  r.status === 'failed' && !r.retried && r.template_name !== null && !hasDocumentHeader(r.template_name) && !(r.failure_kind && failureOfKind(r.failure_kind as SendFailureKind).permanent);

export async function retryNow(db: PoolClient, queue: QueueLike, actor: RetryActor, logId: string): Promise<RetryResult> {
  if (!RETRY_ROLES.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const row = (await db.query(
    `select log_id, student_id, staff_user_id, parent_id, purpose, to_phone, template_name, language, template_params, status::text as status, failure_kind, body,
            (select count(*)::int from communication_log r where r.school_id = l.school_id and r.dedupe_key like 'retry:' || l.log_id::text || ':%') as retries
       from communication_log l where school_id = $1 and log_id = $2 and channel = 'whatsapp'`,
    [actor.schoolId, logId]
  )).rows[0];
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.status !== 'failed') return { ok: false, reason: 'not_failed' };
  if (row.failure_kind && failureOfKind(row.failure_kind as SendFailureKind).permanent) return { ok: false, reason: 'permanent' };
  if (row.retries > 0) return { ok: false, reason: 'already' };
  if (row.body !== null || !row.template_name || hasDocumentHeader(row.template_name)) return { ok: false, reason: 'not_retryable' };
  const made = await queueWhatsAppMessage(db, queue, {
    schoolId: actor.schoolId, studentId: row.student_id, staffUserId: row.staff_user_id, parentId: row.parent_id, purpose: row.purpose, toPhone: row.to_phone,
    templateName: row.template_name, templateParams: row.template_params ?? {}, language: row.language ?? 'en', dedupeKey: `retry:${logId}:1`,
  });
  await writeAuditLog(db, {
    schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'communication.retry_now', targetType: 'communication_log', targetId: logId,
    beforeState: { status: 'failed', failureKind: row.failure_kind ?? 'other' }, afterState: { newLogId: made.logId, status: made.status },
  });
  return { ok: true, logId: made.logId, status: made.status };
}
