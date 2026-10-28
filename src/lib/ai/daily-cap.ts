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

// The requests this account has used today (E1, C382: a screen says the cap is reached before a child speaks).
export async function dailyRequestsUsed(db: Sql, accountId: string, day: string): Promise<number> {
  const { rows } = await db.query(`select requests from family.ai_daily where account_id = $1::uuid and day = $2::date`, [accountId, day]);
  return Number(rows[0]?.requests ?? 0);
}

// The daily voice allowance per family (C230-AS, C388): characters the server voice may speak for one account in one
// India day, Control's setting 'family.voice.daily_characters' (20,000 unless Control changes it). Spoken lines meter
// against it, not against the daily requests. Missing or not a whole number: nothing is spoken.
export const VOICE_CHARS_SETTING = 'family.voice.daily_characters';

export async function voiceCharLimit(db: Sql): Promise<number | null> {
  const { rows } = await db.query(`select value from control.settings where key = $1`, [VOICE_CHARS_SETTING]);
  const v = rows[0]?.value;
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : null;
}

// This many more characters for this account today, if they fit under the limit; one statement, as the requests.
export async function takeVoiceChars(db: Sql, accountId: string, day: string, chars: number, limit: number): Promise<boolean> {
  if (!Number.isInteger(chars) || chars < 1 || chars > limit) return false;
  const { rows } = await db.query(
    `insert into family.ai_daily as d (account_id, day, voice_chars) values ($1::uuid, $2::date, $3::int)
     on conflict (account_id, day) do update set voice_chars = d.voice_chars + $3::int where d.voice_chars + $3::int <= $4::int
     returning voice_chars`,
    [accountId, day, chars, limit]
  );
  return rows.length === 1;
}

// A line the voice could not speak gives its characters back.
export async function giveVoiceCharsBack(db: Sql, accountId: string, day: string, chars: number): Promise<void> {
  await db.query(`update family.ai_daily set voice_chars = greatest(voice_chars - $3::int, 0) where account_id = $1::uuid and day = $2::date`, [accountId, day, chars]);
}

// The characters left for this account today (a screen says the phone's voice reads before the first line is asked).
export async function voiceCharsLeft(db: Sql, accountId: string, day: string): Promise<number> {
  const limit = await voiceCharLimit(db);
  if (limit === null) return 0;
  const { rows } = await db.query(`select voice_chars from family.ai_daily where account_id = $1::uuid and day = $2::date`, [accountId, day]);
  return Math.max(0, limit - Number(rows[0]?.voice_chars ?? 0));
}
