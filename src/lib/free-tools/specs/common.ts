import type { Lang } from '../engine';

export type Pick = (en: string, hi: string) => string;
export const picker = (lang: Lang): Pick => (en, hi) => (lang === 'en' ? en : hi);

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const ESTIMATE = (p: Pick) =>
  p(
    'Estimates for planning only, built from the numbers you entered. Check them against your school’s accounts and current rules before any decision.',
    'Ye sirf planning ke liye anumaan hain, aapke bhare numbers se bane. Koi bhi faisla lene se pehle apne school ke accounts aur current niyam se milaan karein.'
  );

// Integer ceiling that is safe against floating-point near-misses such
// as 0.1 * 3 = 0.30000000000000004.
export function ceilSafe(x: number): number {
  return Math.ceil(x - 1e-9);
}
export function floorSafe(x: number): number {
  return Math.floor(x + 1e-9);
}

export function ordinal(d: number): string {
  const s = d % 100 >= 11 && d % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[d % 10] ?? 'th';
  return `${d}${s}`;
}

export const EMPTY_REPORT = { title: '', sections: [], assumptions: [], disclaimer: '' };
