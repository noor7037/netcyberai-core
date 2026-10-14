import { rupeesToMinor } from '@/lib/fees/money';
import type { PlanInput, PlanProblem } from './billing';

// What Control sends for a plan or a payment, made ready for src/lib/control/billing.ts. Money is typed in rupees
// and kept in paise: an amount never passes through floating-point arithmetic on the way.

// "1500", "1,500.50" or 1500 → paise. null: left empty. undefined: not an amount.
export function rupeesFromBody(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  return rupeesToMinor(text) ?? undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function planInputFromBody(b: any): { ok: true; value: PlanInput } | { ok: false; reason: PlanProblem } {
  const priceMinor = rupeesFromBody(b.priceRupees);
  if (priceMinor === undefined) return { ok: false, reason: 'price' };
  return { ok: true, value: { name: b.name, priceMinor, period: b.period, graceDays: b.graceDays, allWorkingModules: b.allWorkingModules, moduleIds: b.moduleIds, limits: b.limits } };
}
