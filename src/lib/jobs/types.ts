import type { PoolClient } from 'pg';

// The durable job pipeline's contracts (Decision Log C97). Business code
// enqueues through JobQueue.enqueue inside its own transaction and never
// knows how jobs are stored or run; the Postgres outbox (pg-queue.ts) is
// today's implementation, and a dedicated queue can replace it later
// behind this same interface without touching a handler or a caller.

export type Sql = Pick<PoolClient, 'query'>;

export type JobStatus = 'pending' | 'running' | 'succeeded' | 'dead';
export const JOB_STATUSES: readonly JobStatus[] = ['pending', 'running', 'succeeded', 'dead'];

export type JobSpec = {
  type: string;
  payload: Record<string, unknown>;
  // Same key, same job: enqueuing twice (a retried request, a double
  // click) creates it once.
  idempotencyKey: string;
  schoolId?: string | null;
  maxAttempts?: number;
  // Not before this moment (C185): a message held for quiet hours. Now, when not given.
  runAt?: Date;
};

export type ClaimedJob = {
  jobId: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  schoolId: string | null;
  idempotencyKey: string;
};

// `redact`: payload keys removed once the job is finished (succeeded or
// dead), such as an emailed code or an address.
export type JobOutcome = { redact?: string[] } | void;

export type JobHandler = (job: ClaimedJob) => Promise<JobOutcome>;

// A failure that retrying cannot fix (bad payload, unknown type, a state
// only a person can resolve): the job goes straight to dead, where the
// founder sees it and can retry once the cause is fixed.
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentJobError';
  }
}

export type EnqueueResult = { jobId: string; created: boolean };

// Which types a claim may take: only these, or every type but these (the runner's long jobs, ./runner.ts).
export type ClaimTypes = { only?: readonly string[]; except?: readonly string[]; exceptSchools?: readonly string[] };

export interface JobQueue {
  enqueue(db: Sql, spec: JobSpec): Promise<EnqueueResult>;
  claim(limit: number, onlyIds?: string[], types?: ClaimTypes): Promise<ClaimedJob[]>;
  succeed(job: ClaimedJob, redact?: string[]): Promise<void>;
  fail(job: ClaimedJob, error: unknown, redact?: string[]): Promise<'retry' | 'dead'>;
}
