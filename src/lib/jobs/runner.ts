import { jobQueue } from './pg-queue';
import { PermanentJobError, type JobHandler, type JobQueue } from './types';

// Runs due jobs (C97). Called two ways:
// - the sweeper, /api/jobs/run, every minute from pg_cron (all due work);
// - right after a request commits, for the jobs it just enqueued
//   (kickJobs), so an email goes out now rather than within the minute.
// Both are best effort; the jobs table is the record, and anything not
// finished here is picked up by the next sweep.

// Below Vercel's function limit (maxDuration 60 s on /api/jobs/run): stop
// claiming after this and leave the rest for the next minute. A job
// already started is allowed to finish; its lease (LEASE_SECONDS) covers
// a worker that is cut off.
export const RUN_BUDGET_MS = 25_000;
export const RUN_BATCH_CAP = 25;
const CLAIM_BATCH = 5;
// A request only waits this long for its own jobs.
export const KICK_BUDGET_MS = 8_000;

export type RunSummary = { claimed: number; succeeded: number; retried: number; dead: number; stoppedEarly: boolean };

export async function runJobs(opts: {
  handlers: Record<string, JobHandler>;
  queue?: JobQueue;
  limit?: number;
  budgetMs?: number;
  onlyKeys?: string[];
  now?: () => number;
}): Promise<RunSummary> {
  const queue = opts.queue ?? jobQueue;
  const limit = Math.min(opts.limit ?? RUN_BATCH_CAP, RUN_BATCH_CAP);
  const budget = opts.budgetMs ?? RUN_BUDGET_MS;
  const now = opts.now ?? Date.now;
  const started = now();
  const summary: RunSummary = { claimed: 0, succeeded: 0, retried: 0, dead: 0, stoppedEarly: false };

  while (summary.claimed < limit) {
    if (now() - started >= budget) {
      summary.stoppedEarly = true;
      break;
    }
    const batch = await queue.claim(Math.min(CLAIM_BATCH, limit - summary.claimed), opts.onlyKeys);
    if (batch.length === 0) break;
    summary.claimed += batch.length;
    for (const job of batch) {
      const handler = opts.handlers[job.type];
      try {
        if (!handler) throw new PermanentJobError(`no handler for job type ${job.type}`);
        // A lease that ran out after the last allowed attempt.
        if (job.attempts > job.maxAttempts) throw new PermanentJobError('attempts exhausted');
        const outcome = await handler(job);
        await queue.succeed(job, outcome?.redact);
        summary.succeeded += 1;
      } catch (err) {
        const decision = await queue.fail(job, err, redactOnDeath(job.type));
        if (decision === 'retry') summary.retried += 1;
        else summary.dead += 1;
      }
    }
  }
  return summary;
}

// Keys removed from a dead job's payload, by type: a dead job keeps no
// one-time code (payload.secret). The rest stays so "Retry" can work.
function redactOnDeath(type: string): string[] {
  return type === 'email.send' ? ['secret'] : [];
}
