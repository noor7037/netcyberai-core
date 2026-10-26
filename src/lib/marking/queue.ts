import { MARKING_TRIES_PER_JOB } from '@/lib/contracts/marking';
import type { JobQueue, Sql } from '@/lib/jobs/types';

// The school's marking jobs and their keys (C347). Queued in the caller's own transaction (a teacher's request, or the
// school's marking job), so a job exists only once what it works on is committed. Each key names what the job is for,
// so a retried request or a job run twice queues nothing more:
//   marking.read   {uploadId, pageIds}  one run of at most PAGES_PER_READ pages of a closed upload, in scan order
//   marking.group  {uploadId}           once no page of the upload is left to read: its scripts, matched
//   marking.mark   {sheetId}            one script; the key carries when the script last changed (the moment it was
//                                       made, or a person asked to mark it again), so "mark again" queues anew
// The jobs themselves are in ./pipeline.ts, wired in src/lib/jobs/handlers.ts.

export const MARKING_READ_JOB = 'marking.read';
export const MARKING_GROUP_JOB = 'marking.group';
export const MARKING_MARK_JOB = 'marking.mark';

// Pages a reading request carries: a few pages, so one answer is short and a failure costs little.
export const PAGES_PER_READ = 8;
// Tries before a page or a script is given up (it is then failed, for the teacher to see and retry).
export const READ_ATTEMPTS = 3;
// A job's own tries at its script; the script's tries ever are bounded apart (MAX_MARKING_ATTEMPTS, takeSheetForMarking).
export const MARK_ATTEMPTS = MARKING_TRIES_PER_JOB;

export const readKey = (uploadId: string, run: number) => `${MARKING_READ_JOB}:${uploadId}:${run}`;
export const groupKey = (uploadId: string) => `${MARKING_GROUP_JOB}:${uploadId}`;
export const markKey = (sheetId: string, changedAt: string) => `${MARKING_MARK_JOB}:${sheetId}:${changedAt}`;

// A closed upload's pages, in runs of PAGES_PER_READ in scan order (duplicates are never read). The runs are the same
// every time for a closed upload, so its keys are too. With nothing to read, the scripts are made at once.
// `again`: the teacher pressed "Mark these" once more on an upload already closed (its reading stopped, for example while
// AI marking was off): only the pages still unread are queued, under keys of this minute, so the press works once more
// and a double press queues nothing twice (review of #318).
export async function queueReading(db: Sql, queue: JobQueue, schoolId: string, uploadId: string, opts: { again?: boolean } = {}): Promise<{ keys: string[]; runs: number }> {
  const ids = (
    await db.query(
      `select page_id from marking_pages where school_id = $1 and upload_id = $2 and ${opts.again ? `state = 'new'` : `state <> 'duplicate'`} order by file_no, page_no`,
      [schoolId, uploadId]
    )
  ).rows.map((r) => r.page_id as string);
  const minute = opts.again ? `:again:${Math.floor(Date.now() / 60_000)}` : '';
  const keys: string[] = [];
  for (let run = 0; run * PAGES_PER_READ < ids.length; run++) {
    const key = readKey(uploadId, run) + minute;
    await queue.enqueue(db, { type: MARKING_READ_JOB, payload: { uploadId, pageIds: ids.slice(run * PAGES_PER_READ, (run + 1) * PAGES_PER_READ) }, idempotencyKey: key, schoolId, maxAttempts: READ_ATTEMPTS });
    keys.push(key);
  }
  if (keys.length === 0) keys.push(await queueGrouping(db, queue, schoolId, uploadId, minute));
  return { keys, runs: Math.ceil(ids.length / PAGES_PER_READ) };
}

export async function queueGrouping(db: Sql, queue: JobQueue, schoolId: string, uploadId: string, suffix = ''): Promise<string> {
  const key = groupKey(uploadId) + suffix;
  await queue.enqueue(db, { type: MARKING_GROUP_JOB, payload: { uploadId }, idempotencyKey: key, schoolId });
  return key;
}

// The scripts named that still wait to be marked, one job each. A script waits once: when it is made, or when a person
// asks again (askToMarkAgain changes it, and so its key); asked twice in a row, the second is refused there.
export async function queueMarking(db: Sql, queue: JobQueue, schoolId: string, sheetIds: readonly string[]): Promise<string[]> {
  if (!sheetIds.length) return [];
  const { rows } = await db.query(
    `select sheet_id, ((extract(epoch from updated_at) * 1000000)::bigint)::text as changed
       from marking_sheets where school_id = $1 and sheet_id = any($2::uuid[]) and state = 'waiting' order by created_at, sheet_id`,
    [schoolId, [...sheetIds]]
  );
  const keys: string[] = [];
  for (const r of rows) {
    const key = markKey(r.sheet_id as string, String(r.changed));
    await queue.enqueue(db, { type: MARKING_MARK_JOB, payload: { sheetId: r.sheet_id }, idempotencyKey: key, schoolId, maxAttempts: MARK_ATTEMPTS });
    keys.push(key);
  }
  return keys;
}
