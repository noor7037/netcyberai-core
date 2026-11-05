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

// ---- Sends (W21-M3) ------------------------------------------------------------
// A failed email or WhatsApp send is tried again after 1 minute, 10 minutes and 1 hour: the first try plus three
// more. One mechanism for both: the email job runs on this policy (pg-queue.ts), and the WhatsApp send-gate asks
// the same function for the time of its next try (gate.ts). A failure that cannot be mended by trying again (a wrong
// number, an unsubscribed address, a template Meta rejected) is not retried and says why.
export const SEND_RETRY_SECONDS: readonly number[] = [60, 10 * 60, 60 * 60];
export const SEND_MAX_ATTEMPTS = SEND_RETRY_SECONDS.length + 1;
export const SEND_JOB_TYPES: readonly string[] = ['email.send', 'whatsapp.send'];
export const isSendJob = (type: string) => SEND_JOB_TYPES.includes(type);

// `attempt` is the try that just failed, starting at 1. null: there is no further try.
export function sendRetryDelaySeconds(attempt: number): number | null {
  return SEND_RETRY_SECONDS[attempt - 1] ?? null;
}
export function retryDelayFor(type: string, attempt: number, jitter = 0): number {
  return (isSendJob(type) ? sendRetryDelaySeconds(attempt) : null) ?? retryDelaySeconds(attempt, jitter);
}

export type SendFailureKind = 'unreachable' | 'busy' | 'bad_number' | 'bad_address' | 'unsubscribed' | 'template_rejected' | 'not_set_up' | 'other';
export type SendFailure = { kind: SendFailureKind; permanent: boolean; plain: string };

const PLAIN: Record<SendFailureKind, string> = {
  unreachable: 'the service could not be reached',
  busy: 'the service was busy or slow',
  bad_number: 'the number is wrong or not on WhatsApp',
  bad_address: 'the email address is wrong',
  unsubscribed: 'this person asked not to be messaged',
  template_rejected: 'the message words were not accepted by Meta',
  not_set_up: 'sending is not set up yet',
  other: 'the service refused it',
};
const PERMANENT: ReadonlySet<SendFailureKind> = new Set(['bad_number', 'bad_address', 'unsubscribed', 'template_rejected']);

// What kind of failure a provider's message or code says. Pure. Meta's codes: 131026 (cannot be delivered to this
// number), 131021 (the number is the sender's own), 131049 and 130472 (not sent to protect the person: they have not
// wanted such messages), 132000-132999 (the template is wrong, missing or not approved), 131048, 130429 and 131056
// (too many sends), anything else is the provider's fault and is tried again.
export function classifySendFailure(message: string, code?: string | null): SendFailure {
  const m = message.toLowerCase();
  const c = (code ?? /code (\d+)/.exec(message)?.[1] ?? '').trim();
  let kind: SendFailureKind = 'other';
  if (c === '131026' || c === '131021' || /not a full international number|not on whatsapp|invalid (phone|number)/.test(m)) kind = 'bad_number';
  else if (c === '131049' || c === '130472' || /unsubscribed|suppressed|opted out|asked to stop/.test(m)) kind = 'unsubscribed';
  else if (/^132\d{3}$/.test(c) || (/template/.test(m) && /(reject|not approved|does not exist|paused|disabled|not found)/.test(m))) kind = 'template_rejected';
  else if (/invalid.*(email|address)|bad address|validation_error|mailbox/.test(m)) kind = 'bad_address';
  else if (/not configured|not set up/.test(m)) kind = 'not_set_up';
  else if (/could not be reached|did not answer|network|fetch failed|econn|enotfound|abort/.test(m)) kind = 'unreachable';
  else if (c === '131048' || c === '130429' || c === '131056' || /\b(408|429|50\d)\b|too many|rate limit|busy|timed out|timeout/.test(m)) kind = 'busy';
  return { kind, permanent: PERMANENT.has(kind), plain: PLAIN[kind] };
}

export const failureOfKind = (kind: SendFailureKind): SendFailure => ({ kind, permanent: PERMANENT.has(kind), plain: PLAIN[kind] });

// One line the office reads when a send is given up: why, in plain words, and how many tries it had.
export function gaveUpReason(failure: SendFailure, tries: number): string {
  return failure.permanent
    ? `Not sent: ${failure.plain}. Trying again would not help; fix it, then send again.`
    : `Not sent after ${tries} tries: ${failure.plain}. "Retry now" tries once more.`;
}
