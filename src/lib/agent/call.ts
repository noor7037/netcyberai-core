import { NextRequest } from 'next/server';
import { CATALOG, ROUTE_MODULES } from './catalog.generated';
import type { CatalogEntry, Step, StepResult } from './types';

// Calls one school-app route in-process, exactly as the person's own screen would: the same handler, the same
// session cookie, so the route's own sign-in, role and module checks, validation and audit rows decide (C546).

export type Auth = { origin: string; cookie: string; authorization: string };
const BY_ID = new Map(CATALOG.map((e) => [e.id, e]));
// Models often write a route as "GET /classes" or "POST /api/app/classes"; the catalog's form is "GET classes".
export function normalizeEndpoint(id: string): string {
  const m = /^\s*(GET|POST|PUT|PATCH|DELETE)\s+(.+?)\s*$/i.exec(id);
  if (!m) return id.trim();
  const path = m[2].replace(/^\/+/, '').replace(/^api\/app\//, '').replace(/\/+$/, '').replace(/\{(\w+)\}|\[(\w+)\]/g, (_x, a, b) => `:${a ?? b}`);
  return `${m[1].toUpperCase()} ${path}`;
}
export const catalogEntry = (id: string): CatalogEntry | null => BY_ID.get(id) ?? BY_ID.get(normalizeEndpoint(id)) ?? null;

// A dollar sign, a step number and fields (step two's class.class_id) name an earlier answer; anything else is as written.
const REF = /^\$(\d+)((?:\.[A-Za-z0-9_]+)*)$/;
export function resolveRefs(value: unknown, answers: readonly unknown[]): unknown {
  if (typeof value === 'string') {
    const m = REF.exec(value.trim());
    if (!m) return value;
    let cur: unknown = answers[Number(m[1]) - 1];
    for (const key of m[2].split('.').filter(Boolean)) {
      if (Array.isArray(cur) && /^\d+$/.test(key)) cur = cur[Number(key)];
      else if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[key];
      else return undefined;
    }
    return cur;
  }
  if (Array.isArray(value)) return value.map((v) => resolveRefs(v, answers));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveRefs(v, answers)]));
  return value;
}

export function routeUrl(entry: CatalogEntry, params: Record<string, string>, query: Record<string, string>, origin: string): string | null {
  let path = entry.path;
  for (const p of entry.params) {
    const v = params[p];
    if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(v)) return null;
    path = path.replace(`:${p}`, encodeURIComponent(v));
  }
  const url = new URL(`/api/app/${path}`, origin);
  for (const [k, v] of Object.entries(query)) if (entry.query.includes(k)) url.searchParams.set(k, String(v));
  return url.toString();
}

export async function callStep(step: Step, answers: readonly unknown[], auth: Auth, allowWrite: boolean): Promise<StepResult> {
  const entry = catalogEntry(step.endpoint);
  const fail = (error: string, status = 400): StepResult => ({ endpoint: step.endpoint, status, ok: false, answer: null, error });
  if (!entry) return fail('unknown endpoint');
  if (entry.method !== 'GET' && !allowWrite) return fail('a change goes into a change request, not a read');
  const params = resolveRefs(step.params ?? {}, answers) as Record<string, string>;
  const query = resolveRefs(step.query ?? {}, answers) as Record<string, string>;
  const url = routeUrl(entry, params ?? {}, query ?? {}, auth.origin);
  if (!url) return fail('missing or malformed path value');
  const sentBody = entry.method === 'GET' ? null : resolveRefs(step.body ?? {}, answers);
  const sent = { params, query, body: sentBody };
  const body = sentBody === null ? undefined : JSON.stringify(sentBody);
  const headers = new Headers({ 'content-type': 'application/json', origin: auth.origin, 'x-nca-agent': '1' });
  if (auth.cookie) headers.set('cookie', auth.cookie);
  if (auth.authorization) headers.set('authorization', auth.authorization);
  const mod = await ROUTE_MODULES[entry.file]();
  const handler = mod[entry.method];
  if (!handler) return fail('unknown endpoint');
  try {
    const res = await handler(new NextRequest(url, { method: entry.method, headers, body }), { params });
    const text = await res.text();
    let answer: unknown = text;
    try {
      answer = JSON.parse(text);
    } catch {
      answer = text.slice(0, 500);
    }
    const ok = res.status < 400;
    const error = ok ? undefined : typeof answer === 'object' && answer ? String((answer as Record<string, unknown>).error ?? (answer as Record<string, unknown>).message ?? res.status) : String(res.status);
    return { endpoint: step.endpoint, status: res.status, ok, answer, sent, ...(error ? { error } : {}) };
  } catch (err) {
    const name = err instanceof Error ? err.message : 'error';
    return { ...fail(name.startsWith('agent_tx_escape') ? 'this action reaches outside the school app, so the agent cannot do it' : 'the action failed', 500), sent };
  }
}
