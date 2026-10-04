import type { Trend, ValueUnit } from '@/lib/contracts/charts';

// How the app writes numbers (17 §4): Indian digit grouping, rupees from
// paise, one decimal for percentages, and a dash, never a guess, when there
// is no value yet (null).

export const NO_VALUE = '—';

const grouped = (n: number, maxFraction = 0) => n.toLocaleString('en-IN', { maximumFractionDigits: maxFraction });

export function formatValue(value: number | null | undefined, unit: ValueUnit): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_VALUE;
  switch (unit) {
    case 'count':
      return grouped(value);
    case 'percent':
      return `${grouped(value, 1)}%`;
    case 'inr_paise': {
      const rupees = value / 100;
      return `₹${grouped(rupees, Number.isInteger(rupees) ? 0 : 2)}`;
    }
    case 'days':
      return `${grouped(value, 1)} ${Math.abs(value) === 1 ? 'day' : 'days'}`;
    case 'minutes':
      return `${grouped(value)} min`;
    case 'score':
      return grouped(value, 1);
  }
}

// A trend in words for screen readers and in short form for the tile.
export function formatTrend(trend: Trend): { short: string; spoken: string; tone: 'good' | 'bad' | 'neutral' } {
  const amount = trend.unit === 'percent' ? `${grouped(Math.abs(trend.delta), 1)} points` : formatValue(Math.abs(trend.delta), trend.unit);
  const arrow = trend.direction === 'up' ? '▲' : trend.direction === 'down' ? '▼' : '■';
  const word = trend.direction === 'up' ? 'up' : trend.direction === 'down' ? 'down' : 'unchanged';
  const tone = trend.direction === 'flat' || trend.good === 'neither' ? 'neutral' : trend.direction === trend.good ? 'good' : 'bad';
  return {
    short: trend.direction === 'flat' ? `${arrow} same as ${trend.comparedTo}` : `${arrow} ${amount} vs ${trend.comparedTo}`,
    spoken: trend.direction === 'flat' ? `unchanged since ${trend.comparedTo}` : `${word} ${amount} since ${trend.comparedTo}`,
    tone,
  };
}
