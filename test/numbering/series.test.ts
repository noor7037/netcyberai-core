import { describe, expect, it } from 'vitest';
import { ADMISSION_START, nextNumbers, ROLL_START, seriesOf, STAFF_START } from '@/lib/numbering/series';

// C554: the next number continues the school's own style and is never one already in use.
describe('next numbers', () => {
  it('starts each series where a school with none begins', () => {
    expect(nextNumbers([], 3, ADMISSION_START)).toEqual(['0001', '0002', '0003']);
    expect(nextNumbers([], 2, ROLL_START)).toEqual(['1', '2']);
    expect(nextNumbers([null, ''], 1, STAFF_START)).toEqual(['EMP-001']);
  });
  it("continues the school's own style, padding and highest number", () => {
    expect(nextNumbers(['ADM/0021', 'ADM/0023', 'ADM/0007'], 2, ADMISSION_START)).toEqual(['ADM/0024', 'ADM/0025']);
    expect(nextNumbers(['1', '2', '10'], 1, ROLL_START)).toEqual(['11']);
    expect(nextNumbers(['T-9'], 2, STAFF_START)).toEqual(['T-10', 'T-11']);
  });
  it('follows the style most numbers share, and skips one already taken in any case', () => {
    expect(seriesOf(['2024/1', '2024/2', 'OLD-99'])).toEqual({ prefix: '2024/', width: 1, last: 2 });
    expect(nextNumbers(['A1', 'A2', 'a3', 'B9'], 1, ADMISSION_START)).toEqual(['A4']);
    expect(nextNumbers(['A1', 'A2', 'B9', 'a3'], 1, ADMISSION_START)).toEqual(['A4']);
  });
  it('ignores numbers with no digits at the end', () => {
    expect(nextNumbers(['abc', 'R-', ' '], 1, ROLL_START)).toEqual(['1']);
  });
});
