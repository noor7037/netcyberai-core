import { currentDb, currentNow, trackSkips, type WithDb } from './limits';
import { CACHE_HIT_S, CACHE_MISS_S } from './source-limits';

// One cache for the tutor's outside visuals (v21): step photographs, 3D models, later animations and simulation
// lookups. Keyed by kind, the normalised English search words, the subject and the class band. Two levels: this
// server's memory, then the shared table content.visual_cache (a found visual for 24 hours, a miss for an hour). The
// same words asked at once share one search: here by one promise per key, across servers by the table's claim (a
// second server sees 'pending' and waits briefly for the first one's answer). A miss while a source was skipped for a
// passing reason (a 429 pause, a limit, the answer's cap) is not remembered, so the next answer asks again. Server only.

export type VisualKind = 'photo' | 'model3d' | 'animation' | 'sim';
export type CacheOptions = { withDb?: WithDb; waitMs?: number; waits?: number };

const MEM_MAX = 500;
const mem = new Map<string, { at: number; value: unknown }>();
const flight = new Map<string, Promise<unknown>>();

export const normalQuery = (q: string): string => q.toLowerCase().normalize('NFC').replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim().slice(0, 120).trim();
const safe = (v: string | null | undefined, re: RegExp): string => (v && re.test(v) ? v : '');

// The class band a cached visual is shared within: LKG to Class 2, 3 to 5, 6 to 8, 9 to 10, 11 to 12 ('' when unknown).
export function classBand(classLevel: number | null | undefined): string {
  if (typeof classLevel !== 'number' || !Number.isFinite(classLevel)) return '';
  return classLevel <= 2 ? 'early' : classLevel <= 5 ? 'primary' : classLevel <= 8 ? 'middle' : classLevel <= 10 ? 'secondary' : 'senior';
}

export const forgetVisualCache = (): void => {
  mem.clear();
  flight.clear();
};

const remember = (key: string, value: unknown) => {
  mem.delete(key);
  if (mem.size >= MEM_MAX) mem.delete(mem.keys().next().value as string);
  mem.set(key, { at: currentNow(), value });
};

type Lookup = { state: string; value: unknown };
const lookup = (db: WithDb, a: unknown[]): Promise<Lookup> =>
  db(async (c) => {
    const r = (await c.query(`select state, value from content.visual_lookup($1, $2, $3, $4, $5, $6)`, [...a, CACHE_HIT_S, CACHE_MISS_S])).rows[0];
    return { state: String(r?.state ?? 'claimed'), value: r?.value ?? null };
  });

// The visual for these words, from the cache or from `fetcher` (which asks the sources through limits.ts `guarded`).
export async function cachedVisual<T extends object>(kind: VisualKind, query: string, subject: string | null, band: string, fetcher: () => Promise<T | null>, o: CacheOptions = {}): Promise<T | null> {
  const q = normalQuery(query);
  if (!q) return null;
  const subj = safe(subject, /^[a-z_]{1,40}$/);
  const cls = safe(band, /^[a-z0-9-]{1,12}$/);
  const key = `${kind}|${q}|${subj}|${cls}`;
  const kept = mem.get(key);
  if (kept && currentNow() - kept.at < (kept.value ? CACHE_HIT_S : CACHE_MISS_S) * 1000) return kept.value as T | null;
  const running = flight.get(key);
  if (running) return running as Promise<T | null>;
  const p = (async (): Promise<T | null> => {
    const db = o.withDb ?? currentDb();
    const args = [kind, q, subj, cls];
    if (db) {
      let l: Lookup = await lookup(db, args).catch(() => ({ state: 'claimed', value: null }));
      for (let i = 0; l.state === 'pending' && !l.value && i < (o.waits ?? 3); i++) {
        await new Promise((r) => setTimeout(r, o.waitMs ?? 700));
        l = await lookup(db, args).catch(() => ({ state: 'pending', value: null }));
      }
      if (l.state === 'hit' || l.state === 'miss') {
        remember(key, l.value ?? null);
        return (l.value ?? null) as T | null;
      }
      // Another server is still searching: its stale answer, or nothing this time (nothing remembered).
      if (l.state === 'pending') return (l.value ?? null) as T | null;
    }
    const { value, skipped } = await trackSkips(() => fetcher().catch(() => null)).catch(() => ({ value: null, skipped: 1 }));
    if (value || !skipped) {
      remember(key, value ?? null);
      if (db) await db((c) => c.query(`select content.visual_save($1, $2, $3, $4, $5::jsonb)`, [...args, value ? JSON.stringify(value) : null])).catch(() => {});
    } else if (db) await db((c) => c.query(`select content.visual_release($1, $2, $3, $4)`, args)).catch(() => {});
    return value ?? null;
  })();
  flight.set(key, p);
  try {
    return await p;
  } finally {
    flight.delete(key);
  }
}
