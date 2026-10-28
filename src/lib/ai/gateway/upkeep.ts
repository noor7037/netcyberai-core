import { PermanentJobError, type JobHandler, type JobQueue, type Sql } from '@/lib/jobs/types';
import { siteUrl } from '@/lib/site-config';
import { indiaDate } from '@/lib/time/india';

// The AI gateway's upkeep (W5-7, C394; C230-AQ named both gaps), one job each hour (public.ai_upkeep_enqueue):
//   1. The spend alert. The day's known cost (the usage ledger's cost_usd for the India day) against the amount the
//      founder set in Control → AI. At or over it, the founders get one email that day (the email job's key is the
//      day). An attempt with no price set has no cost; the email counts those apart, so no number is invented.
//   2. Ledger retention. Usage ledger and reply-check rows older than LEDGER_KEEP_DAYS are removed, through
//      control.ai_ledger_retention (both tables stay append-only for every session role).

export const AI_UPKEEP_JOB = 'ai.upkeep';
export const SPEND_ALERT_SETTING = 'ai.spend_alert_usd_per_day';
export const SPEND_ALERT_MAX_USD = 10_000;
export const LEDGER_KEEP_DAYS = 90;

type Platform = <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;

// The amount as Control set it, in US dollars; null when off (missing, 0, or not a number in range).
export async function spendAlertUsd(db: Sql): Promise<number | null> {
  const v = (await db.query(`select value from control.settings where key = $1`, [SPEND_ALERT_SETTING])).rows[0]?.value;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= SPEND_ALERT_MAX_USD ? v : null;
}

// One India day's known cost and the answered attempts that had no price.
export async function spentOn(db: Sql, day: string): Promise<{ usd: number; unpriced: number }> {
  const { rows } = await db.query(
    `select coalesce(sum(cost_usd), 0)::float8 as usd, count(*) filter (where cost_usd is null and outcome = 'ok')::int as unpriced
       from control.ai_usage_ledger where day = $1::date`,
    [day]
  );
  return { usd: Math.round(Number(rows[0]?.usd ?? 0) * 100) / 100, unpriced: Number(rows[0]?.unpriced ?? 0) };
}

export function aiUpkeepHandler(deps: { platform: Platform; queue: JobQueue; now?: () => Date }): JobHandler {
  return async (job) => {
    const at = (job.payload as Record<string, unknown>).at;
    if (at !== undefined && (typeof at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(at))) throw new PermanentJobError('ai.upkeep: bad hour');
    const today = indiaDate((deps.now ?? (() => new Date()))());
    await deps.platform(async (db) => {
      await db.query(`select control.ai_ledger_retention($1::date, $2::int)`, [today, LEDGER_KEEP_DAYS]);
      const limit = await spendAlertUsd(db);
      if (limit === null) return;
      const spent = await spentOn(db, today);
      if (spent.usd < limit) return;
      await deps.queue.enqueue(db, {
        type: 'email.send',
        idempotencyKey: `email.send:ai_spend_alert:${today}`,
        payload: { to: 'founders', template: 'ai_spend_alert', data: { day: today, spentUsd: spent.usd.toFixed(2), limitUsd: limit.toFixed(2), unpriced: String(spent.unpriced), url: `${siteUrl}/control/ai` } },
        maxAttempts: 4,
      });
    });
  };
}
