import { describe, expect, it } from 'vitest';
import { MAX_DELAY_SECONDS, afterFailure, errorSummary, retryDelaySeconds } from './policy';
import { PermanentJobError } from './types';

describe('retry policy', () => {
  it('backs off exponentially from 30 seconds, capped at 6 hours', () => {
    expect([1, 2, 3, 4].map((a) => retryDelaySeconds(a))).toEqual([30, 60, 120, 240]);
    expect(retryDelaySeconds(30)).toBe(MAX_DELAY_SECONDS);
    expect(retryDelaySeconds(1, 0.999)).toBeLessThanOrEqual(36);
  });

  it('dead after the last attempt, or at once for a permanent error', () => {
    expect(afterFailure({ attempts: 1, maxAttempts: 8, error: new Error('x') })).toBe('retry');
    expect(afterFailure({ attempts: 8, maxAttempts: 8, error: new Error('x') })).toBe('dead');
    expect(afterFailure({ attempts: 1, maxAttempts: 8, error: new PermanentJobError('x') })).toBe('dead');
  });

  it('keeps one masked line of an error', () => {
    const err = new Error('failed for a.b@school.test token eyJhbGciOiJIUzI1NiJ9.payload\nstack line');
    expect(errorSummary(err)).toBe('failed for <email> token <secret>');
    expect(errorSummary('x'.repeat(400))).toHaveLength(300);
  });
});
