import type { Reviewed, ReviewState } from './types';

// Families see an approved row whose review day is not more than 180 days past (India date, compared as YYYY-MM-DD).
// Pending and rejected never pass. A missing source does not block approval: the founder reviews the words.

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function visibleToFamily(row: Reviewed, today: string): boolean {
  return row.reviewState === 'approved' && row.reviewDue >= addDays(today, -180);
}

export function projectForFamily<T extends Reviewed>(rows: readonly T[], today: string): T[] {
  return rows.filter((r) => visibleToFamily(r, today));
}

// Due for review: the review day is within 30 days or already past. Rejected rows stay off this list.
export function dueForReview<T extends Reviewed>(rows: readonly T[], today: string): T[] {
  const limit = addDays(today, 30);
  return rows.filter((r) => r.reviewState !== 'rejected' && r.reviewDue <= limit);
}

export function isReviewState(v: unknown): v is ReviewState {
  return v === 'pending' || v === 'approved' || v === 'rejected';
}

// The same predicate the family policies use. Kept here so the loader and the migration cannot drift in silence.
export const FAMILY_VISIBLE_SQL = `review_state = 'approved' and review_due >= (now() at time zone 'Asia/Kolkata')::date - 180`;
