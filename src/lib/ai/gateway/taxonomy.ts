// The failover taxonomy (G2, C370; the brief's §5.1). Every adapter failure is put in one class, and the class decides
// two things: whether the next provider in the route may be tried (retryable), and what the attempt does to the
// provider's circuit (src/lib/ai/gateway/circuit.ts).
//
// Retryable (the next provider is tried, within the route's deadline): a timeout, a network failure, 429 or an
// exhausted quota, a model the vendor no longer has (404), 5xx, and a broken or cut stream before any text arrived.
// Not retryable (the answer stops here): the vendor's safety refusal, a 4xx for the key or the request, and anything
// after text has streamed. A refusal never goes to the backup: a second vendor asked the same thing is not a way round
// the first one's safety decision. Once any text has reached the caller no other model is tried: an answer is never
// stitched from two models.

export const OUTCOMES = [
  'ok',
  'upstream_timeout',
  'upstream_unavailable',
  'rate_limited',
  'quota_exhausted',
  'model_unavailable',
  'auth_failed',
  'invalid_request',
  'content_rejected',
  'cut_short',
  'unknown_provider_error',
  'skipped_open_circuit',
  'skipped_deadline',
] as const;
export type Outcome = (typeof OUTCOMES)[number];

// What an attempt does to the provider's circuit: 'success' closes it (the provider answered, a refusal included);
// 'failure' counts towards opening it; 'neutral' leaves it (the provider answered, but our key or request was wrong);
// 'none' (a skipped attempt) does not touch it.
export type CircuitEffect = 'success' | 'failure' | 'neutral' | 'none';
export type Classified = { outcome: Outcome; retryable: boolean; circuit: CircuitEffect };

// A failure as an adapter reports it. `failure` is a string so a kind added by a later adapter is still classified
// (as an unknown provider error, not retried) instead of breaking the route.
export type AttemptFailure = { failure: string; status?: number };

function byStatus(status: number | undefined): Classified {
  if (status === undefined) return { outcome: 'upstream_unavailable', retryable: true, circuit: 'failure' };
  if (status === 408 || status === 504) return { outcome: 'upstream_timeout', retryable: true, circuit: 'failure' };
  if (status === 429) return { outcome: 'rate_limited', retryable: true, circuit: 'failure' };
  if (status === 402) return { outcome: 'quota_exhausted', retryable: true, circuit: 'failure' };
  if (status === 404) return { outcome: 'model_unavailable', retryable: true, circuit: 'failure' };
  if (status === 401 || status === 403) return { outcome: 'auth_failed', retryable: false, circuit: 'neutral' };
  if (status >= 500 && status <= 599) return { outcome: 'upstream_unavailable', retryable: true, circuit: 'failure' };
  if (status >= 400 && status <= 499) return { outcome: 'invalid_request', retryable: false, circuit: 'neutral' };
  return { outcome: 'unknown_provider_error', retryable: false, circuit: 'neutral' };
}

// `streamed`: some text of this attempt reached the caller. `timedOut`: the attempt ran its whole time before it failed
// (the adapters report an aborted call as a network failure; the platform knows how long it gave it).
export function classifyFailure(f: AttemptFailure, at: { streamed: boolean; timedOut: boolean }): Classified {
  let c: Classified;
  switch (f.failure) {
    case 'refused':
      c = { outcome: 'content_rejected', retryable: false, circuit: 'success' };
      break;
    case 'timeout':
      c = { outcome: 'upstream_timeout', retryable: true, circuit: 'failure' };
      break;
    case 'network':
      c = at.timedOut ? { outcome: 'upstream_timeout', retryable: true, circuit: 'failure' } : { outcome: 'upstream_unavailable', retryable: true, circuit: 'failure' };
      break;
    case 'bad_stream':
    case 'cut_short':
      c = { outcome: 'upstream_unavailable', retryable: true, circuit: 'failure' };
      break;
    case 'http':
      c = byStatus(f.status);
      break;
    default:
      c = { outcome: 'unknown_provider_error', retryable: false, circuit: 'neutral' };
  }
  // Text already shown cannot be taken back: the answer ends here, cut short, whatever the failure was.
  if (at.streamed) return { outcome: c.outcome === 'content_rejected' ? c.outcome : 'cut_short', retryable: false, circuit: c.circuit };
  return c;
}

// A call aborted at its time limit comes back as a network failure a little after the limit; one that failed this
// close to it is counted as a timeout.
const TIMEOUT_SLACK_MS = 250;
export function ranItsTime(elapsedMs: number, limitMs: number): boolean {
  return elapsedMs >= limitMs - TIMEOUT_SLACK_MS;
}
