import { describe, expect, it } from 'vitest';
import { chainShareMs } from '@/lib/ai/platform';

// C421: the time each provider of a route gets, on the resolver's numbers (40 s, first text 12 s): reserveMs is
// min(15 s, 40 s - 12 s) = 15 s.
const resolver = { reserveMs: 15_000, firstTextMs: 12_000 };

describe('the time share down the chain (C421)', () => {
  it('a one-piece provider in front holds one first-text wait for its backups, not one share each', () => {
    expect(chainShareMs({ left: 40_000, behind: 2, streams: false, ...resolver })).toBe(28_000);
    expect(chainShareMs({ left: 40_000, behind: 1, streams: false, ...resolver })).toBe(28_000);
  });
  it('a streaming provider in front keeps the W10 share: a first-text wait held for each backup', () => {
    expect(chainShareMs({ left: 40_000, behind: 2, streams: true, ...resolver })).toBe(15_000);
    expect(chainShareMs({ left: 40_000, behind: 1, streams: true, ...resolver })).toBe(25_000);
  });
  it('the last provider gets all that is left; never more than is left', () => {
    expect(chainShareMs({ left: 9_000, behind: 0, streams: false, ...resolver })).toBe(9_000);
    expect(chainShareMs({ left: 9_000, behind: 0, streams: true, ...resolver })).toBe(9_000);
    expect(chainShareMs({ left: 10_000, behind: 2, streams: false, ...resolver })).toBe(10_000);
  });
  it('a profile with no first-text deadline shares as before, whatever the provider', () => {
    const plain = { reserveMs: 15_000, firstTextMs: null };
    expect(chainShareMs({ left: 60_000, behind: 2, streams: false, ...plain })).toBe(30_000);
    expect(chainShareMs({ left: 60_000, behind: 2, streams: true, ...plain })).toBe(30_000);
  });
});
