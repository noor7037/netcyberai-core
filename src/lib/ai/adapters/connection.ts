import { CALL_TIMEOUT_MS, type ConnectionTest } from './types';

// A key's free check (G5, C373): one GET to the vendor's model list, which answers only for a working key and costs
// nothing. "Test the key" in Control and the 15-minute health probe both use it. The key goes in a header, never in the
// address. G6 (C379): the same answer also gives the provider's model ids, for Control's and the Lab's model pickers:
// only ids that pass the model rule are kept (at most MODEL_LIST_MAX), nothing else the vendor sends.

// The same rule Control and the Lab hold a model name to (control.ts, lab/store.ts; the database's check).
export const MODEL_ID = /^@?[A-Za-z0-9._:/-]{1,80}$/;
export const MODEL_LIST_MAX = 300;

// The ids from a list answer, cleaned: strings that pass the rule, once each, sorted, capped.
export function modelIds(raw: unknown[]): string[] {
  const ids = raw.filter((v): v is string => typeof v === 'string' && MODEL_ID.test(v));
  return [...new Set(ids)].sort().slice(0, MODEL_LIST_MAX);
}

// `read`: how to find the ids in this vendor's answer; without it only the status is read.
export async function freeCheck(url: string, headers: Record<string, string>, read?: (body: unknown) => unknown[]): Promise<ConnectionTest> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
  } catch {
    return { ok: false, failure: 'network' };
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    return { ok: false, failure: 'http', status: res.status };
  }
  if (!read) {
    await res.body?.cancel().catch(() => {});
    return { ok: true };
  }
  // A list that cannot be read still means the key works: the picker then says the list is unavailable.
  const body = await res.json().catch(() => null);
  let raw: unknown[] = [];
  try {
    raw = body ? read(body) : [];
  } catch {
    raw = [];
  }
  return body ? { ok: true, models: modelIds(raw) } : { ok: true };
}

// The usual list shapes: { data: [{ id }] } (OpenAI, Anthropic, OpenAI-compatible services).
export const dataIds = (b: unknown) => ((b as { data?: { id?: unknown }[] }).data ?? []).map((m) => m?.id);
