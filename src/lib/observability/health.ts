import type { PoolClient } from 'pg';

// What "healthy" means, written once (C111). /api/health answers the uptime
// check with it, and Control's Monitoring page shows the same answer
// (docs/26 slice 8g, C206): one rule, so the page and the endpoint cannot
// disagree.

type Sql = Pick<PoolClient, 'query'>;

// A due job that has waited longer than this means the job runner is not
// keeping up, or has stopped.
export const BACKLOG_AFTER_MINUTES = 10;

export type DatabaseHealth = 'ok' | 'fail';
export type JobsHealth = 'ok' | 'backlog' | 'unknown';
export type HealthStatus = 'ok' | 'degraded' | 'down';

// As the platform role: no school session can read the job table.
export async function jobsHealth(db: Sql): Promise<'ok' | 'backlog'> {
  const { rows } = await db.query(`select exists (select 1 from jobs where status = 'pending' and next_run_at < now() - interval '${BACKLOG_AFTER_MINUTES} minutes') as stuck`);
  return rows[0]?.stuck ? 'backlog' : 'ok';
}

export function healthStatus(database: DatabaseHealth, jobs: JobsHealth): HealthStatus {
  return database === 'fail' ? 'down' : jobs === 'ok' ? 'ok' : 'degraded';
}
