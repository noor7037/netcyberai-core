import { jobQueue } from './pg-queue';
import { PermanentJobError, type ClaimedJob, type JobHandler, type JobQueue } from './types';

// Runs due jobs (C97). Called two ways:
// - the sweeper, /api/jobs/run, every minute from pg_cron (all due work);
// - right after a request commits, for the jobs it just enqueued
//   (kickJobs), so an email goes out now rather than within the minute.
// Both are best effort; the jobs table is the record, and anything not
// finished here is picked up by the next sweep.

// Well below the function's limit (maxDuration 300 s on /api/jobs/run): stop
// claiming after this and leave the rest for the next minute. A job
// already started is allowed to finish; its lease (LEASE_SECONDS) covers
// a worker that is cut off. Long jobs have their own rule, below.
export const RUN_BUDGET_MS = 25_000;
export const RUN_BATCH_CAP = 25;
const CLAIM_BATCH = 5;
// A request only waits this long for its own jobs.
export const KICK_BUDGET_MS = 8_000;

// LONG JOBS (AI marking, C347). Each waits for one AI answer over many page pictures: its chain is bounded by its
// profile (src/lib/ai/platform.ts: 90 s to read pages, 200 s to mark a script) and its reads and writes by the job
// (src/lib/marking/pipeline.ts), so one ends within LONG_JOB_MAX_MS of starting. /api/jobs/run has 300 s, and a job
// once started runs to its end; five claimed together and run one after another would not fit. So every claim leaves
// them out, and only the sweeper (runDueJobs, longJobs) starts them: after the short jobs, only while the run is younger
// than LONG_JOB_START_MS, at most LONG_JOBS_AT_ONCE side by side (they wait on the AI, not on this server), so they end
// by 45 + 240 = 285 s. The lease (LEASE_SECONDS, 300 s from its claim) outlives them. Runs overlap (the sweeper is called
// every minute), so a class of forty is marked in about ten minutes. A request's kick never starts one: the request
// would wait minutes for it.
export const LONG_JOB_TYPES: readonly string[] = ['marking.read', 'marking.mark'];
export const LONG_JOB_START_MS = 45_000;
export const LONG_JOB_MAX_MS = 240_000;
export const LONG_JOBS_AT_ONCE = 4;

export type RunSummary = { claimed: number; succeeded: number; retried: number; dead: number; stoppedEarly: boolean };

export async function runJobs(opts: {
  handlers: Record<string, JobHandler>;
  queue?: JobQueue;
  limit?: number;
  budgetMs?: number;
  onlyKeys?: string[];
  now?: () => number;
  // The sweeper only: may start one long job (LONG_JOB_TYPES) after the short ones.
  longJobs?: boolean;
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
    const batch = await queue.claim(Math.min(CLAIM_BATCH, limit - summary.claimed), opts.onlyKeys, { except: LONG_JOB_TYPES });
    if (batch.length === 0) break;
    summary.claimed += batch.length;
    for (const job of batch) await runOne(job);
  }
  // Long jobs side by side, when this run is still young enough for them to end inside the route's time: one school's at
  // most each, oldest first, so a school that closes ten classes at once never holds up the others (review of #318).
  if (opts.longJobs && summary.claimed < limit && now() - started < LONG_JOB_START_MS) {
    const jobs: ClaimedJob[] = [];
    while (jobs.length < Math.min(LONG_JOBS_AT_ONCE, limit - summary.claimed)) {
      const schools = jobs.map((j) => j.schoolId).filter((s): s is string => !!s);
      const [job] = await queue.claim(1, opts.onlyKeys, { only: LONG_JOB_TYPES, exceptSchools: schools });
      if (!job) break;
      jobs.push(job);
    }
    summary.claimed += jobs.length;
    await Promise.all(jobs.map(runOne));
  }
  return summary;

  async function runOne(job: ClaimedJob) {
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

// Keys removed from a dead job's payload, by type: a dead job keeps no
// one-time code (payload.secret). The rest stays so "Retry" can work.
function redactOnDeath(type: string): string[] {
  return type === 'email.send' ? ['secret'] : [];
}
