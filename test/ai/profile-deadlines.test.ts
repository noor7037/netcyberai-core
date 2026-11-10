import { describe, expect, it } from 'vitest';
import { CHAIN_MIN_MS, PROFILES } from '@/lib/ai/platform';

// W23 integration (C497): word help was given 8 seconds with no first-text time, and the gateway tries no provider with
// less than CHAIN_MIN_MS left on a profile's own time, so every word help was refused before anything was sent. A profile
// with its own time must leave its first provider a try: at least CHAIN_MIN_MS, or a first-text time (whose floor is short).
describe('every profile with its own time can reach its first provider', () => {
  it('callMs is at least the chain minimum, or the profile has a first-text time below its callMs', () => {
    const blocked = PROFILES.filter((p) => p.callMs !== undefined && p.callMs < CHAIN_MIN_MS && !(p.firstTextMs !== undefined && p.firstTextMs < p.callMs)).map((p) => p.id);
    expect(blocked).toEqual([]);
  });
});
