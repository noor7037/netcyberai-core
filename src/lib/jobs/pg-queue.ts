import { randomUUID } from 'crypto';
import { withPlatformService } from '@/lib/auth/db';
import { DEFAULT_MAX_ATTEMPTS, LEASE_SECONDS, afterFailure, errorSummary, retryDelaySeconds } from './policy';
import type { ClaimTypes, ClaimedJob, EnqueueResult, JobQueue, JobSpec, JobStatus, Sql } from './types';

// The Postgres outbox behind JobQueue (C97). Statements are fixed and
// parameterized; `jobs` is reachable only as nca_super (platform service),
// except enqueue, which a school session may run for its own school's
// invite jobs (policy jobs_enqueue).

type Platform = <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;

type Row = {
  job_id: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  school_id: string | null;
  idempotency_key: string;
};

const toJob = (r: Row): ClaimedJob => ({
  jobId: r.job_id,
  type: r.type,
  payload: r.payload ?? {},
  attempts: Number(r.attempts),
  maxAttempts: Number(r.max_attempts),
  schoolId: r.school_id,
  idempotencyKey: r.idempotency_key,
});

export function createPgJobQueue(platform: Platform = withPlatformService as Platform): JobQueue {
  return {
    // Inside the caller's transaction. No RETURNING, no read-back and no
    // conflict target (naming one needs SELECT on it): a school session
    // holds INSERT only. The only other unique column is the fresh job_id,
    // so a conflict is always the idempotency key. `created` is false when
    // that key was enqueued before (that job is left untouched).
    async enqueue(db: Sql, spec: JobSpec): Promise<EnqueueResult> {
      const jobId = randomUUID();
      const res = await db.query(
        `insert into jobs (job_id, type, payload, idempotency_key, school_id, max_attempts, next_run_at)
         values ($1, $2, $3, $4, $5, $6, coalesce($7::timestamptz, now()))
         on conflict do nothing`,
        [jobId, spec.type, JSON.stringify(spec.payload), spec.idempotencyKey, spec.schoolId ?? null, spec.maxAttempts ?? DEFAULT_MAX_ATTEMPTS, spec.runAt ? spec.runAt.toISOString() : null]
      );
      return { jobId, created: (res.rowCount ?? 0) > 0 };
    },

    // Due work, oldest first. FOR UPDATE SKIP LOCKED: two runners at once
    // never take the same job. A running job whose lease ran out (its
    // worker died) is due again.
    async claim(limit: number, onlyKeys?: string[], types?: ClaimTypes): Promise<ClaimedJob[]> {
      return platform(async (db) => {
        const { rows } = await db.query<Row>(
          `with due as (
             select job_id from jobs
             where ((status = 'pending' and next_run_at <= now())
                 or (status = 'running' and locked_until < now()))
               and ($2::text[] is null or idempotency_key = any($2::text[]))
               and ($4::text[] is null or type = any($4::text[]))
               and ($5::text[] is null or type <> all($5::text[]))
               and ($6::uuid[] is null or school_id is null or school_id <> all($6::uuid[]))
             order by next_run_at
             limit $1
             for update skip locked
           )
           update jobs j
              set status = 'running', attempts = j.attempts + 1,
                  locked_until = now() + make_interval(secs => $3), updated_at = now()
             from due
            where j.job_id = due.job_id
           returning j.job_id, j.type, j.payload, j.attempts, j.max_attempts, j.school_id, j.idempotency_key`,
          [limit, onlyKeys && onlyKeys.length ? onlyKeys : null, LEASE_SECONDS, types?.only ? [...types.only] : null, types?.except ? [...types.except] : null, types?.exceptSchools?.length ? [...types.exceptSchools] : null]
        );
        return rows.map(toJob);
      });
    },

    async succeed(job: ClaimedJob, redact: string[] = []): Promise<void> {
      await platform((db) =>
        db.query(
          `update jobs set status = 'succeeded', completed_at = now(), locked_until = null, last_error = null,
                  payload = payload - $2::text[], updated_at = now()
            where job_id = $1 and status = 'running'`,
          [job.jobId, redact]
        )
      );
    },

    async fail(job: ClaimedJob, error: unknown, redact: string[] = []): Promise<'retry' | 'dead'> {
      const decision = afterFailure({ attempts: job.attempts, maxAttempts: job.maxAttempts, error });
      const summary = errorSummary(error);
      await platform((db) =>
        decision === 'retry'
          ? db.query(
              `update jobs set status = 'pending', next_run_at = now() + make_interval(secs => $2),
                      locked_until = null, last_error = $3, updated_at = now()
                where job_id = $1 and status = 'running'`,
              [job.jobId, retryDelaySeconds(job.attempts, Math.random()), summary]
            )
          : db.query(
              `update jobs set status = 'dead', completed_at = now(), locked_until = null, last_error = $2,
                      payload = payload - $3::text[], updated_at = now()
                where job_id = $1 and status = 'running'`,
              [job.jobId, summary, redact]
            )
      );
      return decision;
    },
  };
}

export const jobQueue = createPgJobQueue();

// ---- the founder's view (Pipeline) --------------------------------------------

export type PipelineCounts = { type: string; status: JobStatus; retrying: number; count: number }[];

export async function pipelineCounts(db: Sql): Promise<PipelineCounts> {
  const { rows } = await db.query(
    `select type, status, count(*)::int as count,
            count(*) filter (where status = 'pending' and attempts > 0)::int as retrying
       from jobs group by type, status order by type, status`
  );
  return rows as PipelineCounts;
}

export type ProblemJob = {
  job_id: string;
  type: string;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  next_run_at: string;
  updated_at: string;
};

// Dead jobs, and jobs waiting for a retry, newest first.
export async function problemJobs(db: Sql, limit = 50): Promise<ProblemJob[]> {
  const { rows } = await db.query(
    `select job_id, type, status, attempts, max_attempts, last_error, next_run_at, updated_at
       from jobs
      where status = 'dead' or (status = 'pending' and attempts > 0)
      order by updated_at desc limit $1`,
    [limit]
  );
  return rows as ProblemJob[];
}

// The founder's "Retry": a dead job runs again now, with one more attempt
// allowed. Returns false when the job is not dead (already retried, or
// never failed), so a double click does nothing twice.
export async function retryDeadJob(db: Sql, jobId: string): Promise<{ retried: boolean; idempotencyKey: string | null }> {
  const { rows } = await db.query(
    `update jobs set status = 'pending', next_run_at = now(), locked_until = null, completed_at = null,
            max_attempts = greatest(max_attempts, attempts + 1), updated_at = now()
      where job_id = $1 and status = 'dead'
      returning idempotency_key`,
    [jobId]
  );
  return { retried: rows.length === 1, idempotencyKey: (rows[0]?.idempotency_key as string | undefined) ?? null };
}
