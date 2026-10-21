// Small helpers the Family app's client parts share (M1-2, C248): one way to call a family API, and the message for
// its error. The words come from the server (src/lib/family/words.ts).
import type { Words } from '@/lib/family/fill';

export type ApiResult<T = Record<string, unknown>> = { ok: true; data: T } | { ok: false; status: number; error: string; data: Record<string, unknown> };

export async function familyApi<T = Record<string, unknown>>(path: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) return { ok: true, data: data as T };
    return { ok: false, status: res.status, error: typeof data.error === 'string' ? data.error : 'network', data };
  } catch {
    return { ok: false, status: 0, error: 'network', data: {} };
  }
}

// The words for an API error, falling back to the general one.
export function errorWords(w: Words, error: string, params: Record<string, string | number> = {}): string {
  const text = w[`fam.err.${error}`] ?? w['fam.err.network'] ?? '';
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}
