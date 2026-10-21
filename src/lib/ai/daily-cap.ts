import type { Sql } from '@/lib/jobs/types';

// The daily cap per family (docs/family-app/03 §7 "Budgets and quotas"). The limit is Control's setting
// 'family.ai.daily_requests', read live on every call: no number for it lives in the code. The count is
// family.ai_daily, one row per account and India day, raised in the caller's own transaction (the family session's,
// under its row level security: own account only) before the request leaves. Counts only, never a prompt or answer.

export const DAILY_REQUESTS_SETTING = 'family.ai.daily_requests';

// The limit as Control set it; null when the setting is missing or not a whole number (then nothing is let through).
export async function dailyLimit(db: Sql): Promise<number | null> {
  const { rows } = await db.query(`select value from control.settings where key = $1`, [DAILY_REQUESTS_SETTING]);
  const v = rows[0]?.value;
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : null;
}

// One more request for this account today, if it is under the limit. One statement, so two requests at the same
// moment cannot both take the last place.
export async function takeDailyRequest(db: Sql, accountId: string, day: string, limit: number): Promise<boolean> {
  if (limit < 1) return false;
  const { rows } = await db.query(
    `insert into family.ai_daily as d (account_id, day, requests) values ($1::uuid, $2::date, 1)
     on conflict (account_id, day) do update set requests = d.requests + 1 where d.requests < $3::int
     returning requests`,
    [accountId, day, limit]
  );
  return rows.length === 1;
}
