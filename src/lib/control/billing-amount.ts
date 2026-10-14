import type { ModuleId } from '@/lib/contracts/modules';
import { isModuleId } from '@/lib/contracts/modules';
import { isBillingPeriod, loadPlan, type BillingPeriod } from '@/lib/frameworks/plans';
import type { Sql } from '@/lib/jobs/types';
import { indiaDate } from '@/lib/time/india';

// The amount a school owes for one period (founder, C212), worked out here and nowhere else: every screen that
// shows it calls amountDue below.
//
//   amount due = max(enrolled students, minimum billed students)
//                × the price per student for the period the school chose
//                  (its negotiated price while one is in force, else its plan's)
//                − the discount in force (rounded half up to the paisa)
//
// Money is in paise and whole numbers only; the multiplication is done in BigInt, so no amount passes through
// floating-point arithmetic. A complimentary module is listed with the amount and never changes it. No price is
// written here: prices are rows (plans, school_billing_terms).

// A typing slip of a few noughts is refused: no student is charged more than these in a month or a year (the
// database holds the same bounds).
export const MAX_STUDENT_MONTH_PAISE = 100_000_000;
export const MAX_STUDENT_YEAR_PAISE = 1_000_000_000;

// The yearly price the Control forms propose from the monthly one: ten months, so two months are free. The person
// can change it before saving; both prices are stored.
export const MONTHS_CHARGED_IN_A_YEAR = 10;
export const proposeYearMinor = (monthMinor: number): number => monthMinor * MONTHS_CHARGED_IN_A_YEAR;

// A discount is kept in hundredths of a percent, from 0 to BP_IN_WHOLE (the whole amount). "12.5", "12.50" or
// 12.5 → 1250. null: not a percent from 0 to 100 with at most two decimals.
export const BP_IN_WHOLE = 10_000;
export function percentToBp(input: unknown): number | null {
  const text = typeof input === 'number' && Number.isFinite(input) ? String(input) : typeof input === 'string' ? input.trim() : '';
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text);
  if (!m) return null;
  const bp = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0');
  return bp <= BP_IN_WHOLE ? bp : null;
}
// 1250 → "12.50", for a screen.
export const bpToPercent = (bp: number): string => `${Math.trunc(bp / 100)}.${String(bp % 100).padStart(2, '0')}`;

export type AmountParts = { billedStudents: number; grossMinor: number; discountMinor: number; amountMinor: number };

// The rule itself, on numbers already read. Every input is a whole number of at least 0.
export function computeAmountDue(input: { enrolledStudents: number; minimumStudents: number | null; pricePerStudentMinor: number; discountBp: number | null }): AmountParts {
  const whole = (n: number) => Number.isSafeInteger(n) && n >= 0;
  if (!whole(input.enrolledStudents) || !(input.minimumStudents === null || whole(input.minimumStudents)) || !whole(input.pricePerStudentMinor) || !(input.discountBp === null || (whole(input.discountBp) && input.discountBp <= BP_IN_WHOLE))) {
    throw new Error('billing-amount: every input is a whole number of at least 0');
  }
  const billedStudents = Math.max(input.enrolledStudents, input.minimumStudents ?? 0);
  const gross = BigInt(billedStudents) * BigInt(input.pricePerStudentMinor);
  // Half up: add half of the divisor before dividing (all values are at least 0, so division rounds down).
  const scale = BigInt(BP_IN_WHOLE);
  const discount = input.discountBp ? (gross * BigInt(input.discountBp) + scale / BigInt(2)) / scale : BigInt(0);
  const amount = gross - discount;
  if (gross > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('billing-amount: the amount is too large to show');
  return { billedStudents, grossMinor: Number(gross), discountMinor: Number(discount), amountMinor: Number(amount) };
}

// What is missing before an amount can be worked out: no plan, no period chosen, or no price for that period.
export type AmountMissing = 'no_plan' | 'no_period' | 'no_price';
export type AmountDue = {
  onDay: string;
  planId: string | null;
  planName: string | null;
  period: BillingPeriod | null;
  enrolledStudents: number;
  minimumStudents: number | null; // the minimum in force, if any
  billedStudents: number;
  priceSource: 'negotiated' | 'plan' | null;
  pricePerStudentMinor: number | null;
  discountBp: number | null; // the discount in force, if any
  grossMinor: number | null;
  discountMinor: number | null;
  amountMinor: number | null; // null: see missing
  missing: AmountMissing | null;
  complimentary: { moduleId: ModuleId; endsOn: string }[]; // on for free: shown, never charged
};

// The students module's own rule for who counts: a student whose status is 'active' (not waiting for consent, not
// left, not moved to another school).
export async function enrolledStudentCount(db: Sql, schoolId: string): Promise<number> {
  const { rows } = await db.query(`select count(*)::int as n from students where school_id = $1 and status = 'active'`, [schoolId]);
  return Number(rows[0]?.n ?? 0);
}

// The amount due for one period, as of `onDay` (India's date): the terms in force that day, the students enrolled now.
// Runs as the platform role (plans and terms are the platform's). Null: no such school.
export async function amountDue(db: Sql, schoolId: string, onDay: string = indiaDate()): Promise<AmountDue | null> {
  const school = (await db.query(
    `select coalesce(sub.plan_id, e.plan) as plan_id, sub.billing_period
       from schools s left join school_subscriptions sub on sub.school_id = s.school_id left join school_entitlements e on e.school_id = s.school_id
      where s.school_id = $1`,
    [schoolId]
  )).rows[0];
  if (!school) return null;
  const { rows: terms } = await db.query(
    `select kind, price_month_minor, price_year_minor, module_id, discount_bp, minimum_students, ends_on::text as ends_on
       from school_billing_terms
      where school_id = $1 and starts_on <= $2::date and (ends_on is null or ends_on >= $2::date)
      order by kind, module_id`,
    [schoolId, onDay]
  );
  const term = (kind: string) => terms.find((t) => t.kind === kind);
  const plan = await loadPlan(db, school.plan_id);
  const period: BillingPeriod | null = isBillingPeriod(school.billing_period) ? school.billing_period : null;
  const enrolledStudents = await enrolledStudentCount(db, schoolId);
  const minimumStudents = term('minimum') ? Number(term('minimum').minimum_students) : null;
  const discountBp = term('discount') ? Number(term('discount').discount_bp) : null;
  const negotiated = term('price');
  const priceOf = (row: { month: unknown; year: unknown } | null) => (row && period ? (row[period] === null || row[period] === undefined ? null : Number(row[period])) : null);
  const negotiatedPrice = negotiated ? priceOf({ month: negotiated.price_month_minor, year: negotiated.price_year_minor }) : null;
  const planPrice = plan ? priceOf({ month: plan.priceMonthMinor, year: plan.priceYearMinor }) : null;
  const pricePerStudentMinor = negotiatedPrice ?? planPrice;
  const missing: AmountMissing | null = !plan ? 'no_plan' : !period ? 'no_period' : pricePerStudentMinor === null ? 'no_price' : null;
  const parts = missing === null && pricePerStudentMinor !== null ? computeAmountDue({ enrolledStudents, minimumStudents, pricePerStudentMinor, discountBp }) : null;
  return {
    onDay,
    planId: plan?.planId ?? null,
    planName: plan?.name ?? null,
    period,
    enrolledStudents,
    minimumStudents,
    billedStudents: Math.max(enrolledStudents, minimumStudents ?? 0),
    priceSource: missing !== null ? null : negotiatedPrice !== null ? 'negotiated' : 'plan',
    pricePerStudentMinor: missing !== null ? null : pricePerStudentMinor,
    discountBp,
    grossMinor: parts?.grossMinor ?? null,
    discountMinor: parts?.discountMinor ?? null,
    amountMinor: parts?.amountMinor ?? null,
    missing,
    complimentary: terms.filter((t) => t.kind === 'complimentary' && isModuleId(t.module_id)).map((t) => ({ moduleId: t.module_id as ModuleId, endsOn: t.ends_on as string })),
  };
}
