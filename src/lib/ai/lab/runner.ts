import { CALL_TIMEOUT_MS, type AdapterResult, type TextAdapter } from '../adapters/types';
import type { LabCase } from './cases';

// One lab call (G4, C372): a case sent to one provider and model, with no database connection held. The key was opened
// by the caller's short transaction (store.ts) and is handed in; nothing here keeps or logs it, the prompt or the
// answer. What comes back is measured: the time to the first words and to the end, the tokens, whether a JSON answer
// reads as the one object asked for, whether the deterministic check passed, and, on a failure, its kind in the
// gateway's words (the execution brief §5.1, lower case).
//
// The lab calls the adapter itself: never a feature profile's chain, never the family daily cap, never the safety
// check's chain. A provider's usual time limit applies unless the case sets its own (the timeout probe).

export const LAB_ERROR_CLASSES = [
  'auth_failed',
  'rate_limited',
  'upstream_timeout',
  'upstream_unavailable',
  'model_unavailable',
  'invalid_request',
  'content_rejected',
  'output_schema_invalid',
  'not_configured',
  'unknown_provider_error',
] as const;
export type LabErrorClass = (typeof LAB_ERROR_CLASSES)[number];

export type LabOutcome = {
  outputText: string;
  latencyMs: number;
  firstTokenMs: number | null;
  tokensIn: number;
  tokensOut: number;
  jsonValid: boolean | null;
  checkPassed: boolean | null;
  errorClass: LabErrorClass | null;
};

// The longest answer kept for the table: enough to score, bounded for the database.
export const LAB_OUTPUT_MAX = 20_000;
const LAB_DEFAULT_MAX_TOKENS = 1200;

// The kind of a failure, from what the adapter says (it never says more than a kind and an HTTP status).
export function errorClassOf(r: Extract<AdapterResult, { ok: false }>, elapsedMs: number, limitMs: number): LabErrorClass {
  switch (r.failure) {
    case 'http':
      if (r.status === 401 || r.status === 403) return 'auth_failed';
      if (r.status === 429) return 'rate_limited';
      if (r.status === 404) return 'model_unavailable';
      if (r.status === 400 || r.status === 413 || r.status === 422) return 'invalid_request';
      return 'upstream_unavailable';
    case 'network':
      // An adapter's own time limit ends the call as a network failure; one that ended at about the limit timed out.
      return elapsedMs >= limitMs - 250 ? 'upstream_timeout' : 'upstream_unavailable';
    case 'refused':
      return 'content_rejected';
    case 'cut_short':
      return 'upstream_unavailable';
    default:
      return 'unknown_provider_error';
  }
}

// Strict: the whole answer is one JSON object (no fence, no words around it) with every key the case names.
export function jsonValidFor(text: string, keys: readonly string[] = []): boolean {
  try {
    const v = JSON.parse(text.trim());
    return v !== null && typeof v === 'object' && !Array.isArray(v) && keys.every((k) => k in v);
  } catch {
    return false;
  }
}

// The deterministic check: every listed word or number appears in the answer (case and spacing ignored).
export function checkPassedFor(text: string, mustContain: readonly string[] | undefined): boolean | null {
  if (!mustContain?.length) return null;
  const norm = (s: string) => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ');
  const answer = norm(text);
  return mustContain.every((w) => answer.includes(norm(w)));
}

export async function runLabCall(adapter: TextAdapter, apiKey: string, model: string, c: LabCase, now: () => number = Date.now): Promise<LabOutcome> {
  const began = now();
  let first: number | null = null;
  const limitMs = c.timeoutMs ?? CALL_TIMEOUT_MS;
  let r: AdapterResult;
  try {
    r = await adapter.streamText(
      {
        apiKey,
        model,
        system: c.system,
        messages: c.messages.map((m) => ({ role: m.role, content: m.content })),
        maxTokens: c.maxTokens ?? LAB_DEFAULT_MAX_TOKENS,
        ...(c.expect === 'json' ? { responseFormat: 'json' as const } : {}),
        ...(c.timeoutMs ? { timeoutMs: c.timeoutMs } : {}),
      },
      () => {
        if (first === null) first = now() - began;
      }
    );
  } catch {
    // An adapter never throws by design; if one did, it is a failure of an unknown kind.
    r = { ok: false, failure: 'bad_stream' };
  }
  const latencyMs = Math.max(0, now() - began);
  if (!r.ok) {
    return { outputText: '', latencyMs, firstTokenMs: first, tokensIn: 0, tokensOut: 0, jsonValid: null, checkPassed: null, errorClass: errorClassOf(r, latencyMs, limitMs) };
  }
  const jsonValid = c.expect === 'json' ? jsonValidFor(r.text, c.jsonKeys) : null;
  return {
    outputText: r.text.slice(0, LAB_OUTPUT_MAX),
    latencyMs,
    firstTokenMs: first,
    tokensIn: Math.max(0, Math.round(r.tokensIn)),
    tokensOut: Math.max(0, Math.round(r.tokensOut)),
    jsonValid,
    checkPassed: checkPassedFor(r.text, c.mustContain),
    errorClass: jsonValid === false ? 'output_schema_invalid' : null,
  };
}
