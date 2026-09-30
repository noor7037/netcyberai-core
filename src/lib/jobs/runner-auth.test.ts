import { describe, expect, it } from 'vitest';
import { runnerAuthorized } from './runner-auth';

const SECRET = 'a'.repeat(48);

describe('the sweeper credential', () => {
  it('accepts only the exact bearer secret', () => {
    expect(runnerAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(runnerAuthorized(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(runnerAuthorized(SECRET, SECRET)).toBe(false);
    expect(runnerAuthorized(null, SECRET)).toBe(false);
  });

  it('refuses everything when the secret is missing or too short', () => {
    expect(runnerAuthorized('Bearer ', undefined)).toBe(false);
    expect(runnerAuthorized('Bearer short', 'short')).toBe(false);
  });
});
