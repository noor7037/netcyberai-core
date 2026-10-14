import { periodKeyFor, type SessionDates } from '@/lib/fees/dues';
import type { Frequency } from '@/lib/fees/money';
import { ageBucket, buildClaim, type AgeBucket, type Applied } from '@/lib/free-tools/rte-claim';
import { daysBetween, looksLikeAadhaarNumber, readDate } from '@/lib/free-tools/student-data-check';

// The RTE claim desk's rules (docs/28 slice 10c, C223). The claim and the ageing are the website's free tool's own
// rules (src/lib/free-tools/rte-claim.ts), imported, never copied (docs/28 §3 rule 2). The fee is the school's own
// fee structure, read the way dues are raised (src/lib/fees/dues.ts). Nothing here reads a database.

export type { AgeBucket, Applied };

// The free tool's buckets for a claim still unpaid, youngest first. A paid claim is in none of them.
export const UNPAID_BUCKETS: readonly Exclude<AgeBucket, 'paid'>[] = ['upTo90', 'upTo180', 'upTo365', 'overYear'];

export const EVIDENCE_KINDS = ['admission_order', 'lottery', 'income_or_category', 'other'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
export const isEvidenceKind = (v: unknown): v is EvidenceKind => typeof v === 'string' && (EVIDENCE_KINDS as readonly string[]).includes(v);

// The day buildClaim needs for its ageing rows, which the claim of one child does not use.
const NO_AGEING_DAY = { y: 2000, m: 1, d: 1 };

// One child's claim for a year: the lower of the state's per-child rate and the school's fee for the child's class
// (RTE Act s.12(2)), by the free tool's own rule. Both are whole paise; the tool reads typed amounts, and a number
// of paise written in digits is read exactly, so the lower of the two is exact to the paisa. Which of the two
// decided it is the tool's own answer too.
export function claimFor(rateMinor: number, feeMinor: number): { amountMinor: number; applied: Applied } {
  if (!Number.isSafeInteger(rateMinor) || rateMinor <= 0 || !Number.isSafeInteger(feeMinor) || feeMinor < 0) throw new Error('a claim needs a rate above zero and a fee of zero or more, in whole paise');
  const settings = { year: '', rate: String(rateMinor), fee: String(feeMinor), classFees: [], documents: [], ageing: [] };
  const { claims, errors } = buildClaim(settings, [{ name: 'child', cls: 'class', admitted: '', docs: [] }], NO_AGEING_DAY);
  if (errors.length || claims.length !== 1) throw new Error(`the claim rule refused the figures: ${errors.join(' ')}`);
  return { amountMinor: claims[0].claim, applied: claims[0].applied };
}

export type FeeVersion = { effective_from: string; items: readonly { head_id: string; amount_minor: number; frequency: Frequency }[] };

// Every month of a school year, as "2026-04".
export function monthsOf(session: Pick<SessionDates, 'start_date' | 'end_date'>): string[] {
  const out: string[] = [];
  let y = Number(session.start_date.slice(0, 4));
  let m = Number(session.start_date.slice(5, 7));
  const last = session.end_date.slice(0, 7);
  for (let i = 0; i < 36; i++) {
    const month = `${y}-${String(m).padStart(2, '0')}`;
    if (month > last) break;
    out.push(month);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

// What the school charges a child of a class for a school year in the heads RTE covers (fee_heads.rte_covered,
// C162: what an RTE child is not charged). Month by month, as dues are raised: the version of the class's fee
// structure in force on the first of the month (on the session's first day for a month it starts in), each head
// in the months it falls due (periodKeyFor). A one-time head (an admission fee) is charged once in a child's time
// at the school, not each year, so it is not part of a year's fee. Null when no version is in force in any month
// of the year.
export function yearFeeMinor(versions: readonly FeeVersion[], covered: ReadonlySet<string>, session: SessionDates): number | null {
  const newestFirst = [...versions].sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  let total = 0;
  let any = false;
  for (const month of monthsOf(session)) {
    const onDate = `${month}-01` < session.start_date ? session.start_date : `${month}-01`;
    const version = newestFirst.find((v) => v.effective_from <= onDate);
    if (!version) continue;
    any = true;
    for (const item of version.items) {
      if (item.frequency === 'one_time' || !covered.has(item.head_id) || item.amount_minor <= 0) continue;
      if (periodKeyFor(item.frequency, month, session) !== null) total += item.amount_minor;
    }
  }
  return any ? total : null;
}

// How long a claim has waited since it was raised (filed), and its age bucket by the free tool's own rule. A claim
// with nothing due is 'paid'.
export function ageOf(raisedOn: string, today: string, dueMinor: number): { days: number; bucket: AgeBucket } {
  const from = readDate(raisedOn);
  const to = readDate(today);
  const days = from && to ? Math.max(0, daysBetween(from, to)) : 0;
  return { days, bucket: ageBucket(days, dueMinor) };
}

// No Aadhaar number, ever (docs/28 §3 rule 1). A note about a child refuses any run of 12 digits, with or without a
// space or a dash between the groups of four; a reference or a source refuses a value that is only 12 digits (the
// free tool's own test), since a payment reference may hold a bank's longer number. The database holds the same.
const TWELVE_DIGIT_RUN = /(^|[^0-9])[0-9]{4}[ -]?[0-9]{4}[ -]?[0-9]{4}([^0-9]|$)/;
export const hasTwelveDigitRun = (s: string): boolean => TWELVE_DIGIT_RUN.test(s);
export const isOnlyTwelveDigits = (s: string): boolean => looksLikeAadhaarNumber(s);

// Paise as a plain number of rupees for a spreadsheet: 150050 is "1500.50". Whole numbers only, no float.
export function minorToPlainRupees(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
