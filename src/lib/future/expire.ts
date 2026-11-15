import type { Sql } from '@/lib/jobs/types';
import { PermanentJobError, type JobHandler } from '@/lib/jobs/types';
import { indiaDate, isIsoDate } from '@/lib/time/india';
import { listingOf } from './listings';
import { computeStatus } from './status';

// The daily expiry (founder plan §3.5; 00:15 in India, queued by public.future_expire_enqueue). No scraping and no AI.
//   - Moves each listing's status on from its dates: upcoming → open → closing_soon → closed, or in_progress while an exam
//     or result date is still ahead, and archived the day after the last date. A closed listing whose last date was moved
//     later is re-opened.
//   - Never deletes: a listing is archived (or withdrawn by a person).
//   - A recurring series whose cycle has ended is copied forward as 'expected' for the next cycle, pending review, with no
//     dates and no deadline (the family sees "official dates are not out yet", never an Apply button).
//   - Reminders are not stored: the 30, 7 and 1 day reminders are worked out from the live status when they are sent
//     (src/lib/family/future-reminders.ts), so a closed, archived or withdrawn listing stops sending at once and a
//     re-opened one starts again.
// Idempotent: a second run on the same day changes nothing.

export const FUTURE_EXPIRE_JOB = 'future.expire';

// The next cycle's label: '2026-27' → '2027-28', '2027' → '2028', '2027 S1' → '2028 S1', '2027-29' (a two-year batch) → '2029-31'.
// Null when the label does not start with a year (a person then sets the next cycle).
export function nextCycle(cycle: string): string | null {
  const m = /^(\d{4})(?:-(\d{2}|\d{4})(?!\d))?(.*)$/.exec(cycle.trim());
  if (!m) return null;
  const start = Number(m[1]);
  const tail = m[3];
  if (!m[2]) return `${start + 1}${tail}`;
  const end = m[2].length === 2 ? Math.floor(start / 100) * 100 + Number(m[2]) : Number(m[2]);
  const span = end > start ? end - start : 1;
  const ns = start + span;
  const ne = ns + span;
  return `${ns}-${m[2].length === 2 ? String(ne).slice(2) : String(ne)}${tail}`;
}

export type ExpireResult = { moved: number; archived: number; cloned: number };

export async function expireListings(db: Sql, today: string): Promise<ExpireResult> {
  const { rows } = await db.query(
    `select listing_id, hub, category, provider_type, provider, title_en, title_hi, summary_en, summary_hi, eligibility_en, eligibility_hi, benefit_en, benefit_hi, fee_en, fee_hi,
            key_dates, to_char(last_date, 'YYYY-MM-DD') as last_date, documents, prepare_steps, classes, prepare_classes, future_classes, states, apply_url, source_url,
            to_char(last_verified_at, 'YYYY-MM-DD') as verified_on, status, series_key, cycle, recurring
       from content.future_listings where status not in ('withdrawn', 'draft', 'archived') for update`
  );
  let moved = 0;
  let archived = 0;
  let cloned = 0;
  for (const r of rows) {
    const l = listingOf(r);
    const computed = computeStatus({ status: l.status, keyDates: l.keyDates, lastDate: l.lastDate }, today);
    // 'closed' (the day after the last date, nothing left ahead) is archived at once: families never see either.
    const now = computed === 'closed' ? 'archived' : computed;
    if (now === l.status) continue;
    await db.query(`update content.future_listings set status = $2, updated_at = now() where listing_id = $1`, [l.id, now]);
    moved++;
    if (now !== 'archived') continue;
    archived++;
    const next = r.recurring ? nextCycle(String(r.cycle)) : null;
    if (!next) continue;
    // The copy: same series, next cycle, expected, pending review, no dates. Skipped when that cycle already exists.
    const made = await db.query(
      `insert into content.future_listings (hub, category, provider_type, provider, series_key, cycle, title_en, title_hi, summary_en, summary_hi, eligibility_en, eligibility_hi, benefit_en, benefit_hi, fee_en, fee_hi,
          key_dates, last_date, documents, prepare_steps, classes, prepare_classes, future_classes, states, apply_url, source_url, last_verified_at, confidence, notes, recurring, status, review_state)
       select hub, category, provider_type, provider, series_key, $2, title_en, title_hi, summary_en, summary_hi, eligibility_en, eligibility_hi, benefit_en, benefit_hi, fee_en, fee_hi,
          '[]'::jsonb, null, documents, prepare_steps, classes, prepare_classes, future_classes, states, apply_url, source_url, last_verified_at, least(confidence, 0.5),
          'Copied forward from cycle ' || cycle || ': dates, fees and eligibility must be checked before approving.', recurring, 'expected', 'pending'
         from content.future_listings src
        where listing_id = $1 and not exists (select 1 from content.future_listings x where x.series_key = src.series_key and x.cycle = $2 and x.title_en = src.title_en)`,
      [l.id, next]
    );
    cloned += made.rowCount ?? 0;
  }
  return { moved, archived, cloned };
}

export function futureExpireHandler(deps: { platform: <T>(fn: (db: Sql) => Promise<T>) => Promise<T>; now?: () => Date }): JobHandler {
  return async (job) => {
    const given = (job.payload as Record<string, unknown>).date;
    if (given !== undefined && !isIsoDate(given)) throw new PermanentJobError('future.expire: bad date');
    const today = typeof given === 'string' ? given : indiaDate((deps.now ?? (() => new Date()))());
    await deps.platform((db) => expireListings(db, today));
  };
}
