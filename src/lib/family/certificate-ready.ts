import type { PoolClient } from 'pg';

// family.certificate_ready (W21-M7): a certificate the school made ready reaches the families linked to the child by
// email, besides the Family app's feed. The school side queues this job with the request, the child, the kind and the
// number (no name); it is read here, on the family's side, because only the Family app's own code names family tables.
// One email an account (the idempotency key), in the account's language. The email says only that a certificate is
// ready and where to open it; the PDF is downloaded inside the app, by a signed link that works once.

export const CERTIFICATE_READY_JOB_TYPE = 'family.certificate_ready';
type Db = Pick<PoolClient, 'query'>;
type Queue = { enqueue(db: Db, spec: { type: string; payload: Record<string, unknown>; idempotencyKey: string; maxAttempts?: number; schoolId?: string | null }): Promise<unknown> };
type Platform = <T>(fn: (db: Db) => Promise<T>) => Promise<T>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function certificateReadyHandler(deps: { platform: Platform; queue: Queue }) {
  return async (job: { payload: Record<string, unknown>; schoolId?: string | null }): Promise<{ redact: string[] }> => {
    const { requestId, studentId, kind, number } = job.payload as Record<string, unknown>;
    if (typeof requestId !== 'string' || typeof studentId !== 'string' || !UUID.test(requestId) || !UUID.test(studentId) || typeof kind !== 'string' || typeof number !== 'string' || !job.schoolId) return { redact: [] };
    const schoolId = job.schoolId;
    await deps.platform(async (db) => {
      const accounts = (await db.query(`select account_id, email, ui_language from family.certificate_ready_emails($1, $2)`, [schoolId, studentId])).rows as { account_id: string; email: string; ui_language: string }[];
      for (const a of accounts) {
        await deps.queue.enqueue(db, {
          type: 'email.send',
          idempotencyKey: `email.send:certificate_ready:${requestId}:${a.account_id}`,
          schoolId,
          maxAttempts: 4,
          payload: { to: [a.email], template: 'certificate_ready', data: { lang: a.ui_language === 'hi' ? 'hi' : 'en', kind, number } },
        });
      }
    });
    return { redact: [] };
  };
}
