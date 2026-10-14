import type { Sql } from './types';

// Deploy safety for scheduled jobs (C210). A migration reaches the database before the code that runs its jobs,
// and a job with no handler dies at once. So the deployed runner writes down the job types it can run, and the
// database's enqueue functions for the school checks (early_warning_nightly_enqueue, auditor_weekly_enqueue) queue
// a job only when its type is on that list. The row exists from the migration on ('[]'). The runner only ever
// changes it and never makes it, so a database without the row queues nothing.

export const HANDLED_TYPES_KEY = 'jobs.handlers';

type Platform = <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;

// Writes the sorted list when it differs from what is stored. True when it changed.
export async function recordHandledTypes(platform: Platform, types: readonly string[]): Promise<boolean> {
  const sorted = [...new Set(types)].sort();
  const res = await platform((db) =>
    db.query(`update platform_settings set value = $1::jsonb, updated_at = now() where key = $2 and value is distinct from $1::jsonb returning key`, [JSON.stringify(sorted), HANDLED_TYPES_KEY])
  );
  return res.rows.length === 1;
}
