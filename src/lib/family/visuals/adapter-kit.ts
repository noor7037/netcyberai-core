import { RateLimited } from './limits';
import { cachedVisual as sharedCachedVisual, forgetVisualCache, type VisualKind } from './shared-cache';

// What every v21 outside source shares (3D models, animations, the new picture sources): a JSON fetch with a time limit
// that turns HTTP 429 into RateLimited (so `guarded` pauses the source), one log line per missing key, the word match
// that decides whether a title is about the search term, and the licence filter. Server only; every adapter that uses it
// is loaded with import() at answer time, so none of it reaches a phone's bundle.

export type Env = Record<string, string | undefined>;
export type Fetcher = typeof fetch;

const TIMEOUT_MS = 4000;
const UA = 'NetCyberAI-Family/1.0 (licensed visual lookup, server side)';

export async function getJson(url: string, f: Fetcher, headers: Record<string, string> = {}, init: RequestInit = {}): Promise<unknown> {
  const res = await f(url, { ...init, headers: { accept: 'application/json', 'User-Agent': UA, ...headers }, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 429) {
    const after = Number(res.headers?.get?.('retry-after'));
    throw new RateLimited(Number.isFinite(after) && after > 0 ? after : null);
  }
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const str = (v: unknown, max = 120): string | null => (typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null);

// A source whose key is not in the environment is skipped; it says so once per server process, never per answer.
const warned = new Set<string>();
export function keyOf(source: string, name: string, env: Env): string | null {
  const v = env[name];
  if (v) return v;
  if (!warned.has(source)) {
    warned.add(source);
    console.warn(`[visuals] ${source} skipped: ${name} is not set`);
  }
  return null;
}
export const forgetKeyWarnings = (): void => warned.clear();

// The content words of an English search term ("a wind turbine" -> wind, turbine), each with a simple plural form.
const STOP = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'in', 'on', 'for', 'to', 'with', 'how', 'what', 'why', 'is', 'are', 'its', 'model', '3d']);
export const wordsOf = (term: string): string[] =>
  term.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter((w) => w.length >= 2 && !STOP.has(w)).slice(0, 5);
const stem = (w: string) => w.replace(/(ies)$/, 'y').replace(/(es|s)$/, '');
// True when every content word of the term is in the text (a title, its tags): "wind turbine" is not the "Wind" satellite.
export function covers(term: string, text: string): boolean {
  const want = wordsOf(term);
  if (!want.length) return false;
  const have = new Set(wordsOf(text.replace(/[_]/g, ' ')).concat(text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)).map(stem));
  return want.every((w) => have.has(stem(w)));
}

// Free for a commercial children's product: public domain, CC0, CC BY, CC BY-SA. Never NC (non-commercial) or ND (no
// changes: the viewer re-lights and frames the model), never a store's own plain or editorial licence.
export function freeLicence(label: unknown): string | null {
  const s = String(label ?? '').toLowerCase().replace(/[_\s]+/g, '-');
  if (!s || /nc|non-?commercial|nd|no-?deriv|editorial|standard|free-st|^st$|^ed$/.test(s)) return null;
  if (/cc0|public-?domain|^pd/.test(s)) return 'CC0 1.0';
  if (/(cc-)?by-sa|attribution-share-?alike/.test(s)) return 'CC BY-SA 4.0';
  if (/^(cc-)?by(-[34]\.0)?$|^cc-attribution$|^attribution$|creative-commons-attribution$/.test(s)) return 'CC BY 4.0';
  return null;
}

// The shared answer cache (shared-cache.ts): this server's memory, then content.visual_cache when a database is in reach.
export const cachedVisual = <T extends object>(type: VisualKind, query: string, subject: string | null, classBand: string | null, fetcher: () => Promise<T | null>): Promise<T | null> =>
  sharedCachedVisual(type, query, subject, classBand ?? 'any', fetcher);
export const forgetLocalVisuals = (): void => forgetVisualCache();
