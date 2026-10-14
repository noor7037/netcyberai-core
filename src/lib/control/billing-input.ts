import { rupeesToMinor } from '@/lib/fees/money';
import { percentToBp } from './billing-amount';
import type { PlanInput, PlanProblem } from './billing';
import type { TermInput, TermProblem } from './billing-terms';

// What Control sends for a plan, a payment or a school's term, made ready for src/lib/control/billing.ts and
// billing-terms.ts. Money is typed in rupees and kept in paise; a discount is typed in percent and kept in hundredths
// of a percent: neither passes through floating-point arithmetic on the way.

// "2400", "2,400.50" or 2400 → paise. null: left empty. undefined: not an amount.
export function rupeesFromBody(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  return rupeesToMinor(text) ?? undefined;
}

// A whole number typed or sent: "450" or 450. null: left empty. undefined: not a whole number.
function wholeFromBody(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim().replace(/,/g, '') : '';
  return /^\d{1,9}$/.test(text) ? Number(text) : undefined;
}

// Prices are per enrolled student: priceMonthRupees and priceYearRupees (C212).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function planInputFromBody(b: any): { ok: true; value: PlanInput } | { ok: false; reason: PlanProblem } {
  const priceMonthMinor = rupeesFromBody(b.priceMonthRupees);
  const priceYearMinor = rupeesFromBody(b.priceYearRupees);
  if (priceMonthMinor === undefined || priceYearMinor === undefined) return { ok: false, reason: 'price' };
  const messagesPerStudentMonth = wholeFromBody(b.messagesPerStudentMonth);
  if (messagesPerStudentMonth === undefined) return { ok: false, reason: 'messages' };
  return {
    ok: true,
    value: { name: b.name, priceMonthMinor, priceYearMinor, graceDays: b.graceDays, allWorkingModules: b.allWorkingModules, moduleIds: b.moduleIds, limits: b.limits, features: b.features, messagesPerStudentMonth },
  };
}

// A school's term (C212): { kind, priceMonthRupees, priceYearRupees | moduleId | percent | minimumStudents, startsOn, endsOn, reason }.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function termInputFromBody(b: any): { ok: true; value: TermInput } | { ok: false; reason: TermProblem } {
  const base = { kind: b.kind, startsOn: b.startsOn, endsOn: b.endsOn, reason: b.reason };
  if (b.kind === 'price') {
    const priceMonthMinor = rupeesFromBody(b.priceMonthRupees);
    const priceYearMinor = rupeesFromBody(b.priceYearRupees);
    if (priceMonthMinor === undefined || priceMonthMinor === null || priceYearMinor === undefined || priceYearMinor === null) return { ok: false, reason: 'price' };
    return { ok: true, value: { ...base, priceMonthMinor, priceYearMinor } };
  }
  if (b.kind === 'discount') {
    const discountBp = percentToBp(b.percent);
    if (discountBp === null) return { ok: false, reason: 'percent' };
    return { ok: true, value: { ...base, discountBp } };
  }
  if (b.kind === 'minimum') {
    const minimumStudents = wholeFromBody(b.minimumStudents);
    if (minimumStudents === undefined || minimumStudents === null) return { ok: false, reason: 'minimum' };
    return { ok: true, value: { ...base, minimumStudents } };
  }
  return { ok: true, value: { ...base, moduleId: b.moduleId } };
}
