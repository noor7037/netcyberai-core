import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../db/pglite-harness';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import { LONG_JOBS_AT_ONCE, LONG_JOB_MAX_MS, LONG_JOB_START_MS, LONG_JOB_TYPES, runJobs } from '@/lib/jobs/runner';
import { LEASE_SECONDS } from '@/lib/jobs/policy';
import { MAX_CALL_TIMEOUT_MS } from '@/lib/ai/adapters/types';
import { PROFILES } from '@/lib/ai/platform';
import { PICTURES_MS } from '@/lib/marking/pipeline';
import type { JobHandler, JobQueue } from '@/lib/jobs/types';

// AI marking's jobs wait minutes for the AI (C347). The job route has 300 s and a started job runs to its end, so a run
// starts at most LONG_JOBS_AT_ONCE of them side by side, after the short jobs, only while it is young, and a request's
// kick never starts one.

let db: TestDb;
let queue: JobQueue;
beforeEach(async () => {
  db = await createTestDb();
  queue = createPgJobQueue((fn) => db.platform(fn as never));
});
const enqueue = (type: string, key: string) => db.platform((q) => queue.enqueue(q, { type, idempotencyKey: key, payload: {} }));
const statusOf = async (key: string) => (await db.query(`select status from jobs where idempotency_key = $1`, [key])).rows[0].status as string;

describe('long jobs (AI marking) in the job runner', () => {
  it('a run takes the short jobs first, then up to LONG_JOBS_AT_ONCE long jobs side by side; the rest wait for the next run', async () => {
    const order: string[] = [];
    let running = 0;
    let most = 0;
    const handler: JobHandler = async (job) => {
      order.push(job.idempotencyKey);
      if (LONG_JOB_TYPES.includes(job.type)) {
        running++;
        most = Math.max(most, running);
        await new Promise((r) => setTimeout(r, 20));
        running--;
      }
    };
    const handlers = { 'marking.read': handler, 'marking.mark': handler, 'probe.ok': handler };
    for (let i = 0; i < LONG_JOBS_AT_ONCE + 2; i++) await enqueue(i % 2 ? 'marking.read' : 'marking.mark', `l${i}`);
    await enqueue('probe.ok', 's1');
    await enqueue('probe.ok', 's2');
    const first = await runJobs({ handlers, queue, longJobs: true });
    expect(first.claimed).toBe(2 + LONG_JOBS_AT_ONCE);
    expect(order.slice(0, 2).sort()).toEqual(['s1', 's2']);
    expect(most).toBe(LONG_JOBS_AT_ONCE);
    // Two long jobs are still waiting for the next run.
    expect((await db.query(`select count(*)::int as n from jobs where status = 'pending'`)).rows[0].n).toBe(2);
    await runJobs({ handlers, queue, longJobs: true });
    expect(order).toHaveLength(4 + LONG_JOBS_AT_ONCE);
  });

  it('one school’s long jobs never hold up another’s: a run takes at most one a school (review of #318)', async () => {
    const [A, B] = ['a3180000-0000-4000-8000-000000000001', 'a3180000-0000-4000-8000-000000000002'];
    await db.query(`insert into schools (school_id, name, jurisdiction) values ($1, 'School A', 'IN-HR'), ($2, 'School B', 'IN-DL')`, [A, B]);
    for (let i = 0; i < 4; i++) await db.platform((q) => queue.enqueue(q, { type: 'marking.mark', idempotencyKey: `a${i}`, payload: {}, schoolId: A }));
    await db.platform((q) => queue.enqueue(q, { type: 'marking.mark', idempotencyKey: 'b0', payload: {}, schoolId: B }));
    const ran: string[] = [];
    await runJobs({ handlers: { 'marking.mark': async (job) => void ran.push(job.idempotencyKey) }, queue, longJobs: true });
    expect(ran.sort()).toEqual(['a0', 'b0']);
  });

  it('a request’s kick, or a run without longJobs, never starts one', async () => {
    let ran = 0;
    const handlers = { 'marking.mark': async () => void ran++ };
    await enqueue('marking.mark', 'k');
    expect(await runJobs({ handlers, queue, onlyKeys: ['k'], limit: 1, budgetMs: 8_000 })).toMatchObject({ claimed: 0 });
    expect(await runJobs({ handlers, queue })).toMatchObject({ claimed: 0 });
    expect(ran).toBe(0);
    expect(await statusOf('k')).toBe('pending');
  });

  it('a run past its young part leaves the long job for the next run', async () => {
    let ran = 0;
    const handlers = { 'marking.read': async () => void ran++, 'probe.ok': async () => undefined };
    await enqueue('marking.read', 'late');
    let t = 0;
    // Each look at the clock is thirty seconds on: by the time the short jobs are done, the run is too old.
    const summary = await runJobs({ handlers, queue, longJobs: true, now: () => (t += 30_000) });
    expect(summary).toMatchObject({ claimed: 0, stoppedEarly: true });
    expect(ran).toBe(0);
    expect(await statusOf('late')).toBe('pending');
  });

  it('the bounds add up: a long job started in time ends inside the route’s 300 s and its lease', () => {
    const longest = Math.max(...PROFILES.map((p) => p.callMs ?? 0));
    expect(longest).toBeGreaterThan(0);
    expect(longest).toBeLessThanOrEqual(MAX_CALL_TIMEOUT_MS);
    // The AI chain, the pictures, and a margin for three short transactions.
    expect(longest + PICTURES_MS + 10_000).toBeLessThanOrEqual(LONG_JOB_MAX_MS);
    expect(LONG_JOB_START_MS + LONG_JOB_MAX_MS).toBeLessThanOrEqual(290_000);
    expect(LONG_JOB_MAX_MS).toBeLessThan(LEASE_SECONDS * 1000);
  });
});
