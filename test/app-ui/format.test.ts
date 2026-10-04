import { describe, expect, it } from 'vitest';
import { formatTrend, formatValue, NO_VALUE } from '@/components/app-ui/format';

describe('formatValue', () => {
  it('writes Indian digit grouping, rupees from paise, and a dash for no data', () => {
    expect(formatValue(1234567, 'count')).toBe('12,34,567');
    expect(formatValue(12345600, 'inr_paise')).toBe('₹1,23,456');
    expect(formatValue(12345650, 'inr_paise')).toBe('₹1,23,456.5');
    expect(formatValue(94.14, 'percent')).toBe('94.1%');
    expect(formatValue(1, 'days')).toBe('1 day');
    expect(formatValue(3, 'days')).toBe('3 days');
    expect(formatValue(45, 'minutes')).toBe('45 min');
    expect(formatValue(null, 'count')).toBe(NO_VALUE);
    expect(formatValue(Number.NaN, 'percent')).toBe(NO_VALUE);
  });
});

describe('formatTrend', () => {
  it('says whether a change is good or bad for this measure', () => {
    const up = formatTrend({ direction: 'up', delta: 1.2, unit: 'percent', comparedTo: 'last week', good: 'up' });
    expect(up).toEqual({ short: '▲ 1.2 points vs last week', spoken: 'up 1.2 points since last week', tone: 'good' });
    expect(formatTrend({ direction: 'up', delta: 3, unit: 'count', comparedTo: 'yesterday', good: 'down' }).tone).toBe('bad');
    expect(formatTrend({ direction: 'flat', delta: 0, unit: 'count', comparedTo: 'yesterday', good: 'up' })).toMatchObject({ tone: 'neutral', short: '■ same as yesterday' });
  });
});
