import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import { bearerToken, runnerAuthorized } from './runner-auth';

const RUNNER_TOKEN = 'ab'.repeat(32);
const DIGEST = createHash('sha256').update(RUNNER_TOKEN).digest();

describe('the sweeper credential', () => {
  it('accepts only the exact bearer secret, compared by digest', () => {
    expect(runnerAuthorized(bearerToken(`Bearer ${RUNNER_TOKEN}`), DIGEST)).toBe(true);
    expect(runnerAuthorized(bearerToken(`Bearer ${'cd'.repeat(32)}`), DIGEST)).toBe(false);
  });

  it('refuses a malformed header before any comparison', () => {
    expect(bearerToken(RUNNER_TOKEN)).toBeNull();
    expect(bearerToken(`Bearer ${RUNNER_TOKEN}x`)).toBeNull();
    expect(bearerToken('Bearer short')).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });

  it('refuses everything while no secret is set', () => {
    expect(runnerAuthorized(RUNNER_TOKEN, null)).toBe(false);
    expect(runnerAuthorized(RUNNER_TOKEN, Buffer.alloc(0))).toBe(false);
  });
});
