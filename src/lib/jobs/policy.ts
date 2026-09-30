import { PermanentJobError } from './types';

// Retry policy (C97), pure so it is unit-tested. Exponential backoff from
// 30 seconds, doubling, capped at 6 hours; with the default 8 attempts a
// job is retried over about an hour before it is dead-lettered.
export const BASE_DELAY_SECONDS = 30;
export const MAX_DELAY_SECONDS = 6 * 60 * 60;
export const DEFAULT_MAX_ATTEMPTS = 8;
// A claimed job whose worker vanished (timeout, crash) is claimable again
// after this lease. Longer than the runner's time budget (runner.ts).
export const LEASE_SECONDS = 5 * 60;

// `attempt` is the attempt that just failed, starting at 1. `jitter` in
// [0, 1) spreads retries of many jobs that failed together (up to a fifth longer).
export function retryDelaySeconds(attempt: number, jitter = 0): number {
  const exp = BASE_DELAY_SECONDS * 2 ** Math.max(0, attempt - 1);
  const capped = Math.min(exp, MAX_DELAY_SECONDS);
  return Math.round(capped * (1 + 0.2 * Math.min(Math.max(jitter, 0), 0.999)));
}

export function afterFailure(input: { attempts: number; maxAttempts: number; error: unknown }): 'retry' | 'dead' {
  if (input.error instanceof PermanentJobError) return 'dead';
  return input.attempts >= input.maxAttempts ? 'dead' : 'retry';
}

// What is kept of an error: one line, no stack, bounded, with email
// addresses and token-like strings masked. Errors come from providers
// (Supabase, the email service) and must not carry data into the jobs
// table or onto the founder's screen.
export function errorSummary(error: unknown): string {
  const raw = error instanceof Error ? `${error.name === 'Error' ? '' : `${error.name}: `}${error.message}` : String(error);
  return raw
    .split('\n')[0]
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/\b(?:(?:re|sk|pk)_|eyJ)[A-Za-z0-9_\-.]{12,}/g, '<secret>')
    .slice(0, 300);
}
