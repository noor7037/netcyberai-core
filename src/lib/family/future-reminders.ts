import type { FamilyChild } from './children';
import { forState, listingOf, type FutureListing } from '@/lib/future/listings';
import { computeStatus, daysLeft } from '@/lib/future/status';

// Future tab reminders (founder, 15 Nov 2026), through the web push and the notifications centre that already exist.
//   future_deadline: 30, 7 and 1 day before a listing's last date, for a child whose class and state match it (the apply-now
//     classes, never the plan-ahead row). One message per listing and step, once.
//   future_new: a listing a person approved since the last look, matching a child's class and state.
// Nothing is stored for a reminder: it is worked out from the live listing, so a listing that is closed, archived, withdrawn,
// not approved or only "expected" sends nothing at all (its reminders are cancelled by that alone), and a deadline moved
// later starts the steps again. A message names no child and carries no personal detail: only the kind and the page.

export const REMINDER_STEPS = [1, 7, 30] as const;
export const FUTURE_PAGE = '/family/future';
export const NEW_WINDOW_DAYS = 7;

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
type Who = Pick<FamilyChild, 'classLevel' | 'stateCode'>;

// The step a listing is in: the smallest of 1, 7, 30 that is at least the days left (0 and 1 days left are step 1); none
// when more than 30 days remain.
export function reminderStep(left: number | null): 1 | 7 | 30 | null {
  if (left === null || left < 0) return null;
  for (const s of REMINDER_STEPS) if (left <= s) return s;
  return null;
}

const COLUMNS = `listing_id, hub, category, provider_type, provider, title_en, title_hi, summary_en, summary_hi, eligibility_en, eligibility_hi, benefit_en, benefit_hi, fee_en, fee_hi,
  key_dates, to_char(last_date, 'YYYY-MM-DD') as last_date, documents, prepare_steps, classes, prepare_classes, future_classes, states, apply_url, source_url,
  to_char(last_verified_at, 'YYYY-MM-DD') as verified_on, status, to_char(reviewed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as reviewed_at`;

async function approvedFor(db: Db, who: readonly Who[]): Promise<(FutureListing & { reviewedAt: string | null })[]> {
  if (!who.length) return [];
  // The family role only ever sees approved, live rows; the child's class and state are applied here.
  const classes = [...new Set(who.map((c) => c.classLevel))];
  const { rows } = await db.query(`select ${COLUMNS} from content.future_listings where classes && $1::smallint[]`, [classes]);
  return rows.map((r) => ({ ...listingOf(r), reviewedAt: (r.reviewed_at as string | null) ?? null })).filter((l) => who.some((c) => l.classes.includes(c.classLevel) && forState(l, c.stateCode || null)));
}

export type DueDeadline = { listing: FutureListing; step: 1 | 7 | 30; left: number; scope: string };

// The deadline reminders in their step today (the caller removes those whose mark says already sent).
export async function dueDeadlines(db: Db, who: readonly Who[], today: string): Promise<DueDeadline[]> {
  const out: DueDeadline[] = [];
  for (const l of await approvedFor(db, who)) {
    const shown = computeStatus({ status: l.status, keyDates: l.keyDates, lastDate: l.lastDate }, today);
    if (shown !== 'open' && shown !== 'closing_soon') continue;
    const left = daysLeft(l.lastDate, today);
    const step = reminderStep(left);
    if (step !== null && left !== null) out.push({ listing: l, step, left, scope: `${l.id}:${step}` });
  }
  return out;
}

// Listings approved after `since` (an ISO time) that are open or opening, for these children.
export async function newListings(db: Db, who: readonly Who[], since: string, today: string): Promise<FutureListing[]> {
  const out: FutureListing[] = [];
  for (const l of await approvedFor(db, who)) {
    if (!l.reviewedAt || l.reviewedAt <= since) continue;
    const shown = computeStatus({ status: l.status, keyDates: l.keyDates, lastDate: l.lastDate }, today);
    if (shown === 'open' || shown === 'closing_soon' || shown === 'upcoming') out.push(l);
  }
  return out;
}
