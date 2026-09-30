import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestDb, type TestDb } from '../db/pglite-harness';
import { createPgJobQueue, retryDeadJob } from '@/lib/jobs/pg-queue';
import { runJobs, RUN_BATCH_CAP } from '@/lib/jobs/runner';
import { emailSendHandler } from '@/lib/jobs/email-handler';
import { PermanentJobError, type JobHandler, type JobQueue } from '@/lib/jobs/types';
import type { EmailMessage } from '@/lib/email/sender';

// C97: the job pipeline on real Postgres (PGlite, B2 migration verbatim):
// retries with backoff, dead-lettering, the founder's retry, leases, the
// run caps, and handlers that are idempotent on their key.

let db: TestDb;
let queue: JobQueue;
beforeEach(async () => {
  db = await createTestDb();
  queue = createPgJobQueue((fn) => db.platform(fn as never));
});

const enqueue = (type: string, key: string, payload: Record<string, unknown> = {}, maxAttempts?: number) =>
  db.platform((q) => queue.enqueue(q, { type, idempotencyKey: key, payload, maxAttempts }));
const job = async (key: string) => (await db.query(`select * from jobs where idempotency_key = $1`, [key])).rows[0];
const makeDue = (key: string) => db.query(`update jobs set next_run_at = now() - interval '1 second' where idempotency_key = $1`, [key]);

describe('enqueue', () => {
  it('the same idempotency key twice is one job', async () => {
    expect((await enqueue('probe.ok', 'k')).created).toBe(true);
    expect((await enqueue('probe.ok', 'k')).created).toBe(false);
    expect((await db.query(`select count(*)::int n from jobs`)).rows[0].n).toBe(1);
  });
});

describe('retries, backoff and the dead letter', () => {
  it('a failing job is retried later, with a growing wait, then succeeds', async () => {
    let calls = 0;
    const handlers: Record<string, JobHandler> = {
      'probe.flaky': async () => {
        calls += 1;
        if (calls < 3) throw new Error('provider timeout');
      },
    };
    await enqueue('probe.flaky', 'f');
    const waits: number[] = [];
    for (let i = 0; i < 3; i++) {
      await runJobs({ handlers, queue });
      const j = await job('f');
      if (j.status === 'pending') {
        waits.push((new Date(j.next_run_at).getTime() - Date.now()) / 1000);
        expect(j.last_error).toBe('provider timeout');
        // Not due yet: another run leaves it alone.
        expect((await runJobs({ handlers, queue })).claimed).toBe(0);
        await makeDue('f');
      }
    }
    const done = await job('f');
    expect(done.status).toBe('succeeded');
    expect(done.attempts).toBe(3);
    expect(done.last_error).toBeNull();
    expect(waits).toHaveLength(2);
    expect(waits[1]).toBeGreaterThan(waits[0]);
  });

  it('after max attempts it is dead, with a masked error; the founder’s Retry runs it again once', async () => {
    let fail = true;
    const handlers: Record<string, JobHandler> = {
      'probe.broken': async () => {
        if (fail) throw new Error('rejected for principal@school.test with key re_abcdefghijklmnopqrstuvwxyz');
      },
    };
    await enqueue('probe.broken', 'b', {}, 2);
    await runJobs({ handlers, queue });
    await makeDue('b');
    const summary = await runJobs({ handlers, queue });
    expect(summary.dead).toBe(1);
    const dead = await job('b');
    expect(dead.status).toBe('dead');
    expect(dead.last_error).toBe('rejected for <email> with key <secret>');

    const retry = await db.platform((q) => retryDeadJob(q, dead.job_id));
    expect(retry).toEqual({ retried: true, idempotencyKey: 'b' });
    expect(await db.platform((q) => retryDeadJob(q, dead.job_id))).toEqual({ retried: false, idempotencyKey: null });
    fail = false;
    await runJobs({ handlers, queue });
    expect((await job('b')).status).toBe('succeeded');
  });

  it('a permanent error, or an unknown type, is dead at once', async () => {
    await enqueue('probe.permanent', 'p');
    await enqueue('probe.unknown', 'u');
    const summary = await runJobs({
      handlers: {
        'probe.permanent': async () => {
          throw new PermanentJobError('bad payload');
        },
      },
      queue,
    });
    expect(summary).toMatchObject({ claimed: 2, dead: 2 });
    expect((await job('u')).last_error).toBe('PermanentJobError: no handler for job type probe.unknown');
  });

  it('a dead email job keeps no one-time code', async () => {
    await enqueue('email.send', 'e', { to: ['a@school.test'], template: 'nope', data: {}, secret: { code: '123456' } });
    await runJobs({ handlers: { 'email.send': emailSendHandler({ sender: () => null, platform: (fn) => db.platform(fn as never) }) }, queue });
    const j = await job('e');
    expect(j.status).toBe('dead');
    expect(j.payload.secret).toBeUndefined();
  });
});

describe('claims and caps', () => {
  it('a claimed job is not claimed again until its lease runs out', async () => {
    await enqueue('probe.ok', 'l');
    const first = await queue.claim(10);
    expect(first).toHaveLength(1);
    expect(await queue.claim(10)).toHaveLength(0);
    await db.query(`update jobs set locked_until = now() - interval '1 second' where idempotency_key = 'l'`);
    const again = await queue.claim(10);
    expect(again.map((j) => j.idempotencyKey)).toEqual(['l']);
    expect(again[0].attempts).toBe(2);
  });

  it('a run takes at most RUN_BATCH_CAP jobs and stops claiming when its time budget is spent', async () => {
    for (let i = 0; i < RUN_BATCH_CAP + 5; i++) await enqueue('probe.ok', `c${i}`);
    const handlers = { 'probe.ok': async () => {} };
    expect((await runJobs({ handlers, queue, limit: 1000 })).claimed).toBe(RUN_BATCH_CAP);
    let t = 0;
    const slow = await runJobs({ handlers, queue, budgetMs: 10, now: () => (t += 20) });
    expect(slow).toMatchObject({ claimed: 0, stoppedEarly: true });
  });
});

describe('handlers are idempotent on their key', () => {
  it('email.send run twice for one job sends one email', async () => {
    const sent: EmailMessage[] = [];
    const seen = new Set<string>();
    // Like Resend: a repeated Idempotency-Key returns the first result.
    const sender = {
      async send(m: EmailMessage) {
        if (!seen.has(m.idempotencyKey)) {
          seen.add(m.idempotencyKey);
          sent.push(m);
        }
        return { providerId: 'x' };
      },
    };
    const handler = emailSendHandler({ sender: () => sender, platform: (fn) => db.platform(fn as never) });
    const claimed = {
      jobId: randomUUID(),
      type: 'email.send',
      attempts: 1,
      maxAttempts: 8,
      schoolId: null,
      idempotencyKey: 'email.send:application_code:x:1',
      payload: { to: ['a@school.test'], template: 'application_code', data: { schoolName: 'A <b>School</b>' }, secret: { code: '482913' } },
    };
    expect(await handler(claimed)).toEqual({ redact: ['secret'] });
    expect(await handler(claimed)).toEqual({ redact: ['secret'] });
    expect(sent).toHaveLength(1);
    expect(sent[0].html).toContain('A &lt;b&gt;School&lt;/b&gt;');
    expect(sent[0].idempotencyKey).toBe('email.send:application_code:x:1');
  });
});
