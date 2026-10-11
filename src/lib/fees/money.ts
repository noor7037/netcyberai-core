// Money in P3 (docs/23 §3 rule 1): whole minor units (paise) only. Nothing
// here uses a floating-point number for an amount.

export const MAX_MINOR = 99_999_999_99; // ₹9,99,99,999.99: no single fee line is larger

// "1500", "1500.5", "1,500.50" → paise. Null for anything else: a sign,
// three decimals, letters, an empty box.
export function rupeesToMinor(input: unknown): number | null {
  if (typeof input !== 'string') return null;
  const s = input.trim().replace(/,/g, '');
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const minor = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0');
  return minor <= MAX_MINOR ? minor : null;
}

// 150050 → "1,500.50" in the Indian grouping; whole rupees show no paise.
export function minorToRupees(minor: number): string {
  const whole = Math.trunc(minor / 100);
  const paise = Math.abs(minor % 100);
  const digits = String(Math.abs(whole));
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${minor < 0 ? '-' : ''}${rest ? `${rest},` : ''}${last3}${paise ? `.${String(paise).padStart(2, '0')}` : ''}`;
}

export const FREQUENCIES = ['monthly', 'quarterly', 'half_yearly', 'annual', 'one_time'] as const;
export type Frequency = (typeof FREQUENCIES)[number];
const PER_YEAR: Record<Frequency, number> = { monthly: 12, quarterly: 4, half_yearly: 2, annual: 1, one_time: 1 };

// What a structure comes to over one session, in paise.
export function yearlyTotalMinor(items: readonly { amount_minor: number; frequency: Frequency }[]): number {
  return items.reduce((sum, i) => sum + i.amount_minor * PER_YEAR[i.frequency], 0);
}
