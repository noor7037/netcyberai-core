import { spendAlertUsd, spentOn } from '@/lib/ai/gateway/upkeep';
import { tutorTotals } from '@/lib/ai/tutor-use';
import { retryDeadJob } from '@/lib/jobs/pg-queue';
import { PermanentJobError, type JobHandler, type JobQueue, type Sql } from '@/lib/jobs/types';
import { log } from '@/lib/observability/log';
import { indiaDate, isIsoDate } from '@/lib/time/india';
import { siteUrl } from '@/lib/site-config';
import { AI_OPS_DAILY_JOB } from './agents/jobs';

// The ops agent's daily look (W16-B4; the agent "ops", job ai.ops_daily), once a day just after midnight in India
// (public.ai_ops_daily_enqueue). For the day that has just ended it:
//   1. retries every dead tutor.* job once (a job already retried by an earlier run is not retried again; the ids are
//      kept in the day's row), so a provider that was down overnight does not leave a child's quiz or report undone;
//   2. writes one row to control.ai_ops_daily: the day's text turns, voice minutes, photo doubts, quizzes made, reports
//      sent, failures and cost (counts and money; the same numbers Control's "Tutor use today" shows);
//   3. when the day's known cost reached the amount set in Control → AI (ai.spend_alert_usd_per_day), sends the founders
//      the existing ai_spend_alert email, under the same key the hourly upkeep uses, so a day that was already
//      announced is not announced twice;
//   4. on a Sunday, starts the week's parent reports (W16-B3's enqueueWeeklyParentReports), after the rest is saved, so a
//      failure there never undoes the row.
// A run again for the same day updates its row and does nothing twice. Failures over the share set in Control's alerts
// (control.alert.ai_failure_share) already show as a red line on Control; the failures count is in the row.

export { AI_OPS_DAILY_JOB };
type Platform = <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;
export type WeeklyReports = (db: Sql, queue: JobQueue, week: string) => Promise<unknown>;
export type OpsDeps = { platform: Platform; queue: JobQueue; now?: () => Date; weeklyReports?: WeeklyReports };
export type OpsRow = { day: string; children: number; textTurns: number; voiceMinutes: number; photoDoubts: number; quizzes: number; reports: number; failures: number; costUsd: number; retried: string[] };

const RETRY_LIMIT = 200;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

// The Monday of the week the given India day falls in (the week the parent reports cover).
export const mondayOf = (iso: string) => addDays(iso, -((weekdayOf(iso) + 6) % 7));

// Dead tutor jobs not yet retried by this job, retried now; their ids.
async function retryDeadTutorJobs(db: Sql): Promise<string[]> {
  const { rows } = await db.query(
    `select j.job_id from jobs j
      where j.type like 'tutor.%' and j.status = 'dead'
        and not exists (select 1 from control.ai_ops_daily r where j.job_id = any (r.retried))
      order by j.updated_at limit $1`,
    [RETRY_LIMIT]
  );
  const done: string[] = [];
  for (const r of rows as { job_id: string }[]) if ((await retryDeadJob(db, r.job_id)).retried) done.push(r.job_id);
  return done;
}

export async function writeOpsRow(db: Sql, day: string): Promise<OpsRow & { limitUsd: number | null; unpriced: number }> {
  const retried = await retryDeadTutorJobs(db);
  const totals = await tutorTotals(db, day);
  const failures = Number((await db.query(`select coalesce(sum(failures), 0)::int as n from control.ai_usage where day = $1::date`, [day])).rows[0]?.n ?? 0);
  const spent = await spentOn(db, day);
  await db.query(
    `insert into control.ai_ops_daily as o (day, children, text_turns, voice_minutes, photo_doubts, quizzes, reports, failures, cost_usd, retried)
     values ($1::date, $2, $3, $4, $5, $6, $7, $8, $9, $10::uuid[])
     on conflict (day) do update set children = excluded.children, text_turns = excluded.text_turns, voice_minutes = excluded.voice_minutes, photo_doubts = excluded.photo_doubts,
       quizzes = excluded.quizzes, reports = excluded.reports, failures = excluded.failures, cost_usd = excluded.cost_usd, retried = o.retried || excluded.retried, written_at = now()`,
    [day, totals.children, totals.textTurns, totals.voiceMinutes, totals.photoDoubts, totals.quizzes, totals.reports, failures, spent.usd, retried]
  );
  return { day, ...totals, failures, costUsd: spent.usd, retried, limitUsd: await spendAlertUsd(db), unpriced: spent.unpriced };
}

export function aiOpsDailyHandler(deps: OpsDeps): JobHandler {
  return async (job) => {
    const given = (job.payload as Record<string, unknown>).date;
    if (given !== undefined && !isIsoDate(given)) throw new PermanentJobError('ai.ops_daily: bad date');
    const today = typeof given === 'string' ? given : indiaDate((deps.now ?? (() => new Date()))());
    const day = addDays(today, -1);
    await deps.platform(async (db) => {
      const row = await writeOpsRow(db, day);
      if (row.limitUsd !== null && row.costUsd >= row.limitUsd) {
        await deps.queue.enqueue(db, {
          type: 'email.send',
          idempotencyKey: `email.send:ai_spend_alert:${day}`,
          payload: { to: 'founders', template: 'ai_spend_alert', data: { day, spentUsd: row.costUsd.toFixed(2), limitUsd: row.limitUsd.toFixed(2), unpriced: String(row.unpriced), url: `${siteUrl}/control/ai` } },
          maxAttempts: 4,
        });
      }
    });
    if (weekdayOf(today) === 0 && deps.weeklyReports) {
      const run = deps.weeklyReports;
      try {
        await deps.platform((db) => run(db, deps.queue, mondayOf(today)));
      } catch (err) {
        // The row is saved; the reports are the next job's to try (the sweeper), never a reason to run the day again.
        log('error', 'ai.ops_daily.reports_failed', { error: err instanceof Error ? err.name : 'error' });
      }
    }
  };
}
