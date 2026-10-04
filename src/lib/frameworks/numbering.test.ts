import { describe, expect, it } from 'vitest';
import { formatNumber, usesYear } from './numbering';

describe('numbering', () => {
  it('fills the year and a zero-padded counter', () => {
    expect(formatNumber('FAM-{YYYY}-{SEQ:4}', 2026, 7)).toBe('FAM-2026-0007');
    expect(formatNumber('ADM/{YY}/{SEQ:3}', 2026, 1234)).toBe('ADM/26/1234');
    expect(formatNumber('F{SEQ:1}', 2026, 5)).toBe('F5');
  });

  it('restarts each year only when the pattern shows the year', () => {
    expect(usesYear('FAM-{YYYY}-{SEQ:4}')).toBe(true);
    expect(usesYear('R{YY}{SEQ:5}')).toBe(true);
    expect(usesYear('FAM-{SEQ:4}')).toBe(false);
  });
});
