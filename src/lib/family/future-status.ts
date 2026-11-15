// The life of a Future listing, computed in India's days from its key dates (founder plan §3.5). Pure: the family page,
// the daily expiry job and the reminders all use this one function, so a status the job has not yet moved on can never
// show a closed item as open.

export type FutureStatus = 'draft' | 'expected' | 'upcoming' | 'open' | 'closing_soon' | 'closed' | 'in_progress' | 'archived' | 'withdrawn';
export type KeyDate = { kind: string; date: string; end?: string | null; approx?: boolean; quote?: string | null };
export type DatedListing = { status: FutureStatus; keyDates: readonly KeyDate[]; lastDate: string | null };

export const CLOSING_SOON_DAYS = 7;
// Dates that mean "the apply window", and dates that mean something still to come after it (exam, result, ...).
const APPLY_KINDS = new Set(['form_open', 'last_date', 'late_fee_last_date', 'notification']);
export const isApplyKind = (k: string) => APPLY_KINDS.has(k);

export const dayNumber = (iso: string): number => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
export const daysBetween = (from: string, to: string): number => dayNumber(to) - dayNumber(from);

// The last day a thing still happens: its end when it has one, else its day.
const lastDay = (d: KeyDate) => d.end && d.end > d.date ? d.end : d.date;

// The next date after today that is not about applying: an exam, a result, a correction window, an admit card.
export function nextEvent(l: Pick<DatedListing, 'keyDates'>, today: string): KeyDate | null {
  const ahead = l.keyDates.filter((d) => !isApplyKind(d.kind) && lastDay(d) >= today).sort((a, b) => a.date.localeCompare(b.date));
  return ahead[0] ?? null;
}

// The status today. A withdrawn or draft listing stays so. An 'expected' one stays expected until a firm (not approximate)
// apply date exists. A listing with no last date keeps its stored place (upcoming, closed) and an open-ended scheme is open.
export function computeStatus(l: DatedListing, today: string): FutureStatus {
  if (l.status === 'withdrawn' || l.status === 'draft') return l.status;
  const firm = l.keyDates.filter((d) => isApplyKind(d.kind) && !d.approx);
  if (l.status === 'expected' && firm.length === 0 && !l.lastDate) return 'expected';
  const formOpen = firm.find((d) => d.kind === 'form_open')?.date ?? null;
  const last = l.lastDate;
  if (last) {
    if (formOpen && today < formOpen) return 'upcoming';
    if (today <= last) return daysBetween(today, last) <= CLOSING_SOON_DAYS ? 'closing_soon' : 'open';
    return nextEvent(l, today) ? 'in_progress' : 'closed';
  }
  const latest = l.keyDates.reduce<string | null>((m, d) => (m === null || lastDay(d) > m ? lastDay(d) : m), null);
  // Dates all behind us: a closed one stays closed, a scheme that is simply open (no deadline) stays open, anything else is over.
  if (latest !== null && latest < today && l.status !== 'open') return l.status === 'closed' ? 'closed' : 'archived';
  if (formOpen && today < formOpen) return 'upcoming';
  if ((l.status === 'closed' || l.status === 'archived') && nextEvent(l, today)) return 'in_progress';
  if (l.status === 'closed' || l.status === 'archived' || l.status === 'upcoming' || l.status === 'in_progress') return l.status;
  return 'open';
}

// What the family sees. 'closed' and 'archived' never reach a list; 'in_progress' goes under "Your exams".
export const VISIBLE: readonly FutureStatus[] = ['expected', 'upcoming', 'open', 'closing_soon', 'in_progress'];

// Days left to apply (0 on the last day), or null when there is no deadline or it has passed.
export function daysLeft(lastDate: string | null, today: string): number | null {
  if (!lastDate) return null;
  const n = daysBetween(today, lastDate);
  return n >= 0 ? n : null;
}
