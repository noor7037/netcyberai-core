import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { SEND_MAX_ATTEMPTS, SEND_RETRY_SECONDS, classifySendFailure, gaveUpReason, retryDelayFor, sendRetryDelaySeconds } from '@/lib/jobs/policy';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import { PermanentJobError } from '@/lib/jobs/types';
import { deliverQueued, queueWhatsAppMessage } from '@/lib/whatsapp/gate';
import type { WhatsAppProvider } from '@/lib/whatsapp/provider';
import { listMessages } from '@/lib/whatsapp/delivery';
import { retryNow } from '@/lib/whatsapp/retry';

// Retry on a failed send (W21-M3): the schedule, each try kept with the provider's failure kind, a permanent failure not
// retried, and "Retry now" for the office, audited. Every number is made up; nothing leaves the process.

const A = 'c5000000-0000-4000-8000-000000000001';
const STUDENT = 'c5500000-0000-4000-8000-000000000001';
const PRINCIPAL = 'c5600000-0000-4000-8000-000000000001';
const TEACHER = 'c5600000-0000-4000-8000-000000000002';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(role: string, user: string, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', A], ['app.current_role', role], ['app.current_user_id', user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const queue = createPgJobQueue(platform);
const failing = (message: string) => {
  const state = { asked: 0 };
  const provider: WhatsAppProvider = {
    name: 'stand-in',
    send: async () => {
      state.asked += 1;
      return { success: false, providerMessageId: null, errorMessage: message, raw: null };
    },
    sendText: async () => ({ success: false, providerMessageId: null, errorMessage: 'not used', raw: null }),
    sendChoice: async () => ({ success: false, providerMessageId: null, errorMessage: 'not used', raw: null }),
    testConnection: async () => ({ ok: true, message: 'made up' }),
    readNotice: () => ({ ok: false, reason: 'no_secret' }),
  };
  return { provider, state };
};
const T0 = new Date('2099-05-04T05:00:00Z'); // 10:30 in India, outside quiet hours
const plus = (d: Date, seconds: number) => new Date(d.getTime() + seconds * 1000);
let n = 0;
const enqueue = () =>
  as('principal', PRINCIPAL, (c) => queueWhatsAppMessage(c, queue, { schoolId: A, studentId: STUDENT, purpose: 'operational_communication', toPhone: '+910000000031', templateName: 'absence', templateParams: { child: 'Asha', date: '04-05-2099' }, dedupeKey: `retry-test:${(n += 1)}` }, () => T0));
const deliver = (logId: string, at: Date, provider: WhatsAppProvider) => deliverQueued({ platform, queue, now: () => at, provider }, logId);
const row = async (logId: string) => (await db.pg.query(`select status::text as status, reason, attempts, failure_kind, attempt_log from communication_log where log_id = $1`, [logId])).rows[0];

describe('the retry policy, pure', () => {
  it('waits 1 minute, 10 minutes and 1 hour, then gives up: the first try and three more', () => {
    expect(SEND_RETRY_SECONDS).toEqual([60, 600, 3600]);
    expect(SEND_MAX_ATTEMPTS).toBe(4);
    expect([1, 2, 3, 4].map(sendRetryDelaySeconds)).toEqual([60, 600, 3600, null]);
    expect(retryDelayFor('email.send', 2, 0.9)).toBe(600);
    expect(retryDelayFor('whatsapp.send', 3, 0.9)).toBe(3600);
    expect(retryDelayFor('other.job', 1, 0)).toBe(30); // every other job keeps its own backoff
  });
  it('names the kind of failure, and which ones trying again cannot mend', () => {
    expect(classifySendFailure('Meta answered 400 (code 131026): Message undeliverable')).toMatchObject({ kind: 'bad_number', permanent: true });
    expect(classifySendFailure('Meta answered 400 (code 132001): Template name does not exist')).toMatchObject({ kind: 'template_rejected', permanent: true });
    expect(classifySendFailure('Meta answered 400 (code 131049): not sent to protect the user')).toMatchObject({ kind: 'unsubscribed', permanent: true });
    expect(classifySendFailure('email service answered 422 validation_error')).toMatchObject({ kind: 'bad_address', permanent: true });
    expect(classifySendFailure('Meta answered 429 (code 130429): rate limit')).toMatchObject({ kind: 'busy', permanent: false });
    expect(classifySendFailure('Meta could not be reached (TimeoutError)')).toMatchObject({ kind: 'unreachable', permanent: false });
    expect(gaveUpReason(classifySendFailure('code 131026'), 1)).toMatch(/^Not sent: the number is wrong.*would not help/);
    expect(gaveUpReason(classifySendFailure('Meta could not be reached'), 4)).toMatch(/^Not sent after 4 tries: the service could not be reached/);
  });
});

describe('a failed send, on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture, is_pilot, pilot_allow_outbound, monthly_budget_paise, quiet_hours_start, quiet_hours_end, timezone) values
        ('${A}', 'School A', 'IN-HR', false, false, true, 100000, '00:00', '00:00', 'Asia/Kolkata');
      insert into users (user_id, school_id, email, role, display_name, is_active) values
        ('${PRINCIPAL}', '${A}', 'principal@retry.example', 'principal', 'Priya', true), ('${TEACHER}', '${A}', 'teacher@retry.example', 'teacher', 'Tara', true);
      insert into students (student_id, school_id, admission_no, name, status) values ('${STUDENT}', '${A}', 'A-1', 'Asha', 'active');
      insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version, created_at) select '${A}', '${STUDENT}', 'operational_communication', true, (enum_range(null::consent_method))[1], 'v1', now();
      insert into whatsapp_templates (school_id, template_name, version, language, body, variables, billing_category, stale_after_minutes, status) values
        (null, 'absence', 1, 'en', '{{school}}: {{child}} was absent on {{date}}.', '{school,child,date}', 'utility', 720, 'approved');
    `);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('is tried at 1 minute, 10 minutes and 1 hour; each try is kept with its kind; then it is failed for good in plain words', async () => {
    const p = failing('Meta could not be reached (TimeoutError)');
    const q = await enqueue();
    const a = await deliver(q.logId, T0, p.provider);
    expect(a).toMatchObject({ status: 'queued', retryAt: plus(T0, 60) });
    const b = await deliver(q.logId, plus(T0, 60), p.provider);
    expect(b).toMatchObject({ status: 'queued', retryAt: plus(T0, 60 + 600) });
    const c = await deliver(q.logId, plus(T0, 660), p.provider);
    expect(c).toMatchObject({ status: 'queued', retryAt: plus(T0, 660 + 3600) });
    const d = await deliver(q.logId, plus(T0, 4260), p.provider);
    expect(d).toEqual({ status: 'failed', reason: 'Not sent after 4 tries: the service could not be reached. "Retry now" tries once more.' });
    expect(p.state.asked).toBe(4);
    const r = await row(q.logId);
    expect(r).toMatchObject({ status: 'failed', attempts: 4, failure_kind: 'unreachable' });
    expect(r.attempt_log.map((t: { attempt: number; kind: string }) => [t.attempt, t.kind])).toEqual([[1, 'unreachable'], [2, 'unreachable'], [3, 'unreachable'], [4, 'unreachable']]);
    // Not tried a fifth time.
    await deliver(q.logId, plus(T0, 99999), p.provider);
    expect(p.state.asked).toBe(4);
  });

  it('a permanent failure (a wrong number) is not retried: failed at once, saying why, no button', async () => {
    const p = failing('Meta answered 400 (code 131026): Message undeliverable');
    const q = await enqueue();
    const out = await deliver(q.logId, T0, p.provider);
    expect(out.status).toBe('failed');
    expect(out.reason).toMatch(/^Not sent: the number is wrong or not on WhatsApp\. Trying again would not help/);
    expect(p.state.asked).toBe(1);
    expect(await row(q.logId)).toMatchObject({ status: 'failed', attempts: 1, failure_kind: 'bad_number' });
    const listed = await as('principal', PRINCIPAL, (c) => listMessages(c, A, 'failed'));
    expect(listed.messages.find((m) => m.log_id === q.logId)).toMatchObject({ can_retry: false, failure_kind: 'bad_number', tries: 1 });
    const refused = await as('principal', PRINCIPAL, (c) => retryNow(c, queue, { schoolId: A, userId: PRINCIPAL, role: 'principal' }, q.logId));
    expect(refused).toEqual({ ok: false, reason: 'permanent' });
  });

  it('"Retry now" queues a new message from a given-up one, once, audited with no personal data; a teacher may not', async () => {
    const p = failing('Meta could not be reached (TimeoutError)');
    const q = await enqueue();
    let at = T0;
    for (const wait of [0, 60, 600, 3600]) {
      at = plus(at, wait);
      await deliver(q.logId, at, p.provider);
    }
    expect((await row(q.logId)).status).toBe('failed');
    const listed = await as('principal', PRINCIPAL, (c) => listMessages(c, A, 'failed'));
    expect(listed.messages.find((m) => m.log_id === q.logId)).toMatchObject({ can_retry: true, retried: false, tries: 4 });

    expect(await as('teacher', TEACHER, (c) => retryNow(c, queue, { schoolId: A, userId: TEACHER, role: 'teacher' }, q.logId))).toEqual({ ok: false, reason: 'not_allowed' });
    const done = await as('principal', PRINCIPAL, (c) => retryNow(c, queue, { schoolId: A, userId: PRINCIPAL, role: 'principal' }, q.logId));
    expect(done).toMatchObject({ ok: true, status: 'queued' });
    const again = await as('principal', PRINCIPAL, (c) => retryNow(c, queue, { schoolId: A, userId: PRINCIPAL, role: 'principal' }, q.logId));
    expect(again).toEqual({ ok: false, reason: 'already' });
    expect(await row(q.logId)).toMatchObject({ status: 'failed' }); // the old row is never changed back
    const fresh = done.ok ? await row(done.logId) : null;
    expect(fresh).toMatchObject({ status: 'queued', attempts: 0 });

    const audit = (await db.pg.query(`select actor_user_id, target_id, before_state, after_state from audit_log where event_action = 'communication.retry_now'`)).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor_user_id: PRINCIPAL, target_id: q.logId, before_state: { status: 'failed', failureKind: 'unreachable' } });
    expect(JSON.stringify(audit[0])).not.toMatch(/\+91|Asha|0000000031/);
    // And the new message is sent through the gate as any other.
    const ok: WhatsAppProvider = { ...p.provider, send: async () => ({ success: true, providerMessageId: 'standin-retry-1', errorMessage: null, raw: null }) };
    expect(await deliver((done as { logId: string }).logId, new Date(Date.now() + 5000), ok)).toEqual({ status: 'sent' });
  });

  it('the email job runs on the same schedule: 1 minute, 10 minutes, 1 hour, then dead; a wrong address stops at once', async () => {
    const mk = async (key: string) => {
      await platform((db2) => queue.enqueue(db2, { type: 'email.send', payload: {}, idempotencyKey: key }));
      return (await queue.claim(1, [key]))[0];
    };
    const job = await mk('mail-1');
    expect(job.maxAttempts).toBe(4);
    const wait = async (j: typeof job) => Number((await db.pg.query(`select extract(epoch from (next_run_at - now()))::int as s from jobs where job_id = $1`, [j.jobId])).rows[0].s);
    expect(await queue.fail(job, new Error('email service answered 503'))).toBe('retry');
    expect(Math.abs((await wait(job)) - 60)).toBeLessThanOrEqual(3);
    const last = await db.pg.query(`select attempt_log from jobs where job_id = $1`, [job.jobId]);
    expect(last.rows[0].attempt_log).toMatchObject([{ attempt: 1, kind: 'busy' }]);
    // Third failure waits an hour; the fourth is the end.
    const again = (j: typeof job) => db.pg.query(`update jobs set status = 'running' where job_id = $1`, [j.jobId]);
    await again(job);
    expect(await queue.fail({ ...job, attempts: 3 }, new Error('email service answered 503'))).toBe('retry');
    expect(Math.abs((await wait(job)) - 3600)).toBeLessThanOrEqual(3);
    await again(job);
    expect(await queue.fail({ ...job, attempts: 4 }, new Error('email service answered 503'))).toBe('dead');
    const dead = (await db.pg.query(`select status, last_error from jobs where job_id = $1`, [job.jobId])).rows[0];
    expect(dead).toMatchObject({ status: 'dead' });
    expect(dead.last_error).toMatch(/^Not sent after 4 tries/);

    const bad = await mk('mail-2');
    expect(await queue.fail(bad, new PermanentJobError('email service answered 422 validation_error', 'bad_address'))).toBe('dead');
    expect((await db.pg.query(`select last_error from jobs where job_id = $1`, [bad.jobId])).rows[0].last_error).toMatch(/^Not sent: the email address is wrong/);
  });
});
