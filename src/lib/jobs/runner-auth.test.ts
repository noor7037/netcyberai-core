import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import { bearerToken, runnerAuthorized } from './runner-auth';

const SECRET = 'ab'.repeat(32);
const DIGEST = createHash('sha256').update(SECRET).digest();

describe('the sweeper credential', () => {
  it('accepts only the exact bearer secret, compared by digest', () => {
    expect(runnerAuthorized(bearerToken(`Bearer ${SECRET}`), DIGEST)).toBe(true);
    expect(runnerAuthorized(bearerToken(`Bearer ${'cd'.repeat(32)}`), DIGEST)).toBe(false);
  });

  it('refuses a malformed header before any comparison', () => {
    expect(bearerToken(SECRET)).toBeNull();
    expect(bearerToken(`Bearer ${SECRET}x`)).toBeNull();
    expect(bearerToken('Bearer short')).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });

  it('refuses everything while no secret is set', () => {
    expect(runnerAuthorized(SECRET, null)).toBe(false);
    expect(runnerAuthorized(SECRET, Buffer.alloc(0))).toBe(false);
  });
});
