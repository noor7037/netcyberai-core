import { hasAadhaarNumber } from '@/lib/privacy/aadhaar';

// The RTE claim desk's own rules (docs/28 slice 10c, C223; C225). Pure: no server import and no database, so the
// website's free tool imports the claim rule from here (src/lib/free-tools/rte-claim.ts, C223-A answer 6) and the
// screens may import any of it.
//
// What lives elsewhere, and why:
//   - the age of an unpaid claim is the free tool's ageBucket: ./ageing.ts imports it (it cannot be imported here,
//     since the free tool imports this file);
//   - the fee of a class for a year is read as dues are raised (src/lib/fees/dues.ts, a server file): ./year-fee.ts.

// Which of the two decided a claim: the state rate, the school fee, or both the same.
export type ClaimApplied = 'rate' | 'fee' | 'equal';

// THE CLAIM RULE (RTE Act s.12(2)): the lower of the state's per-child rate and the school's fee, and which of the
// two it was. The one place it is written: the free tool's buildClaim calls it on the rupees it reads, and claimFor
// below on whole paise.
export function lowerOfRateAndFee(rate: number, fee: number): { claim: number; applied: ClaimApplied } {
  return { claim: Math.min(rate, fee), applied: rate < fee ? 'rate' : fee < rate ? 'fee' : 'equal' };
}

// One child's claim for a year, in whole paise: the rule on the rate in force and the year's fee. The database holds
// amount = least(rate, fee) on every claim, so the two can never disagree.
export function claimFor(rateMinor: number, feeMinor: number): { amountMinor: number; applied: ClaimApplied } {
  if (!Number.isSafeInteger(rateMinor) || rateMinor <= 0 || !Number.isSafeInteger(feeMinor) || feeMinor < 0) throw new Error('a claim needs a rate above zero and a fee of zero or more, in whole paise');
  const { claim, applied } = lowerOfRateAndFee(rateMinor, feeMinor);
  return { amountMinor: claim, applied };
}

// Which fee heads count in a claim (C223-A answer 4): a school setting, fees.rte_claim_heads. By default the
// recurring heads an RTE child does not pay (fee_heads.rte_covered, C162); a school whose state counts only the
// heads every child pays chooses the second. A one-time head never counts (./year-fee.ts). The words on the screen
// tell the office to check its state's notification.
export const RTE_CLAIM_HEADS = ['rte_covered', 'rte_covered_mandatory'] as const;
export type RteClaimHeads = (typeof RTE_CLAIM_HEADS)[number];
export const isRteClaimHeads = (v: unknown): v is RteClaimHeads => typeof v === 'string' && (RTE_CLAIM_HEADS as readonly string[]).includes(v);
export type HeadFacts = { head_id: string; rte_covered: boolean; is_mandatory: boolean };
export function headsCounted(heads: readonly HeadFacts[], choice: RteClaimHeads): Set<string> {
  return new Set(heads.filter((h) => h.rte_covered && (choice === 'rte_covered' || h.is_mandatory)).map((h) => h.head_id));
}

export const EVIDENCE_KINDS = ['admission_order', 'lottery', 'income_or_category', 'other'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
export const isEvidenceKind = (v: unknown): v is EvidenceKind => typeof v === 'string' && (EVIDENCE_KINDS as readonly string[]).includes(v);

// A recorded receipt is never changed or removed (C225). One typed wrongly is undone by a reversing row of minus its
// amount, while the claim is still raised, with one of these reasons (a code, never free text).
export const REVERSAL_REASONS = ['typed_wrong', 'recorded_twice', 'not_received'] as const;
export type ReversalReason = (typeof REVERSAL_REASONS)[number];
export const isReversalReason = (v: unknown): v is ReversalReason => typeof v === 'string' && (REVERSAL_REASONS as readonly string[]).includes(v);

// What is still due on a claim: its amount less what the state has paid (the receipts, reversals counted). A paid or
// written-off claim has nothing due.
export function dueOf(state: 'raised' | 'paid' | 'written_off', amountMinor: number, receivedMinor: number): number {
  return state === 'raised' ? Math.max(0, amountMinor - receivedMinor) : 0;
}

// The lengths the database holds.
export const NOTE_MAX = 300;
export const REFERENCE_MAX = 80;
export const SOURCE_MIN = 5;
export const SOURCE_MAX = 300;

// One trimmed line of typed text within its length, or why not. Every free-text field of the desk (a rate's source,
// a receipt's reference, a write-off note, a reason for reopening, an evidence note) takes the ONE Aadhaar rule
// (src/lib/privacy/aadhaar.ts), as the database does: a longer bank UTR passes, a twelve-digit number standing alone
// is refused, so a twelve-digit IMPS or UPI reference is refused too (C225).
export function typedText(v: unknown, min: number, max: number, oneLine = true): { ok: true; text: string } | { ok: false; reason: 'length' | 'aadhaar' } {
  const raw = typeof v === 'string' ? v.trim() : '';
  const text = oneLine ? raw.replace(/\s+/g, ' ') : raw;
  if (text.length < min || text.length > max) return { ok: false, reason: 'length' };
  if (hasAadhaarNumber(text)) return { ok: false, reason: 'aadhaar' };
  return { ok: true, text };
}

// Paise as a plain number of rupees for a spreadsheet: 150050 is "1500.50". Whole numbers only, no float.
export function minorToPlainRupees(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
