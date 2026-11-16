import { AsyncLocalStorage } from 'node:async_hooks';
import { ANSWER_CALL_CAP, PAUSE_DEFAULT_S, PAUSE_MAX_S, bucketOf, limitFor, type SourceLimit } from './source-limits';

// The one gate every outside picture, 3D, animation and simulation source goes through (v21). Per call of `guarded`:
// a source whose key is not set is skipped (logged once per server); the answer's cap on outside calls
// (ANSWER_CALL_CAP); a pause after a 429, shared by every server (content.visual_source_pauses) and held here too; and
// the source's free limits (source-limits.ts), counted in the shared table content.visual_source_usage, skipped BEFORE a
// limit is reached. Without a database (a test, a script, or the database failing) the same limits are counted in this
// server's memory. Nothing here retries: a skipped or failed source is simply null and the caller asks the next one.
// Server only (node:async_hooks).

export class RateLimited extends Error {
  constructor(public retryAfterS: number | null = null) {
    super('rate_limited');
  }
}

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
export type WithDb = <T>(fn: (db: Db) => Promise<T>) => Promise<T>;
type Env = Record<string, string | undefined>;
type Tally = { calls: number; hits: number; skips: number; pauses: number };
type Answer = { calls: number; cap: number; capLogged: boolean; tally: Map<string, Tally> };
type Frame = { withDb?: WithDb; env?: Env; now: () => number; answer: Answer; skipped: { n: number } };

const als = new AsyncLocalStorage<Frame>();
const newAnswer = (cap: number): Answer => ({ calls: 0, cap, capLogged: false, tally: new Map() });
const frame = (): Frame => als.getStore() ?? { now: Date.now, answer: newAnswer(Number.POSITIVE_INFINITY), skipped: { n: 0 } };

// The database and settings of the answer being filled, for the gate and the shared cache (shared-cache.ts).
export const currentDb = (): WithDb | undefined => als.getStore()?.withDb;
export const currentNow = (): number => frame().now();

// Runs one answer's picture work: its calls share one cap, its database and clock; a structured log line at the end
// gives each source's calls, hits, skips and pauses (Control also reads content.visual_source_summary).
export async function runVisualAnswer<T>(o: { withDb?: WithDb; env?: Env; now?: () => number; cap?: number }, fn: () => Promise<T>): Promise<T> {
  const f: Frame = { withDb: o.withDb, env: o.env, now: o.now ?? Date.now, answer: newAnswer(o.cap ?? ANSWER_CALL_CAP), skipped: { n: 0 } };
  try {
    return await als.run(f, fn);
  } finally {
    if (f.answer.tally.size) console.info('[visuals] sources', JSON.stringify({ calls: f.answer.calls, cap: f.answer.cap, sources: Object.fromEntries(f.answer.tally) }));
  }
}

// Runs one search inside the answer and says how many sources were skipped for a passing reason (a pause, a limit, the
// cap): a miss with skips is not remembered as a miss (shared-cache.ts).
export async function trackSkips<T>(fn: () => Promise<T>): Promise<{ value: T; skipped: number }> {
  const parent = frame();
  const f: Frame = { ...parent, skipped: { n: 0 } };
  const value = await als.run(f, fn);
  return { value, skipped: f.skipped.n };
}

// Runs fn with these environment values for the gate's key check (a caller that was handed its env, as searchSources).
export function withEnv<T>(env: Env, fn: () => Promise<T>): Promise<T> {
  return als.run({ ...frame(), env }, fn);
}

// Logged once per server per reason (a missing key, a pause, a limit), never per call.
const logged = new Set<string>();
const logOnce = (key: string, text: string) => {
  if (logged.has(key)) return;
  if (logged.size > 1000) logged.clear();
  logged.add(key);
  console.info(`[visuals] ${text}`);
};

// This server's own counters and pauses (the fallback, and the pause kept even when the shared write fails).
const PERIODS = ['minute', 'hour', 'day', 'month'] as const;
type Period = (typeof PERIODS)[number];
const SPAN: Record<Exclude<Period, 'month'>, number> = { minute: 60_000, hour: 3_600_000, day: 86_400_000 };
const windowOf = (p: Period, t: number): { start: number; prev: number; end: number } => {
  if (p === 'month') {
    const d = new Date(t);
    const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    return { start, prev: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1), end: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) };
  }
  const start = Math.floor(t / SPAN[p]) * SPAN[p];
  return { start, prev: start - SPAN[p], end: start + SPAN[p] };
};
const limitsOf = (l: SourceLimit): (number | null)[] => [l.perMinute ?? null, l.perHour ?? null, l.perDay ?? null, l.perMonth ?? null];
const counts = new Map<string, number>();
const pausedUntil = new Map<string, number>();

function localTake(bucket: string, l: SourceLimit, t: number): 'ok' | 'paused' | 'limit' {
  if ((pausedUntil.get(bucket) ?? 0) > t) return 'paused';
  const lims = limitsOf(l);
  for (let i = 0; i < PERIODS.length; i++) {
    const lim = lims[i];
    if (lim === null) continue;
    const w = windowOf(PERIODS[i], t);
    const cur = counts.get(`${bucket}|${PERIODS[i]}|${w.start}`) ?? 0;
    const prev = counts.get(`${bucket}|${PERIODS[i]}|${w.prev}`) ?? 0;
    if (cur + prev * (1 - (t - w.start) / (w.end - w.start)) + 1 > lim) return 'limit';
  }
  if (counts.size > 5000) counts.clear();
  for (let i = 0; i < PERIODS.length; i++) {
    if (lims[i] === null) continue;
    const k = `${bucket}|${PERIODS[i]}|${windowOf(PERIODS[i], t).start}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return 'ok';
}

// For tests: forget this server's counters, pauses and log marks.
export function resetLimits(): void {
  counts.clear();
  pausedUntil.clear();
  logged.clear();
}

const tallyOf = (a: Answer, source: string): Tally => {
  let t = a.tally.get(source);
  if (!t) a.tally.set(source, (t = { calls: 0, hits: 0, skips: 0, pauses: 0 }));
  return t;
};

// Whether a source can be asked at all in this environment (its key, when it needs one, is set).
export function hasKey(source: string, env: Env = (als.getStore()?.env ?? process.env) as Env): boolean {
  const keys = limitFor(source).keys;
  return !keys || keys.some((k) => !!env[k]);
}

// Runs `fn` for source `source` ("commons", "unsplash", "sketchfab", ...). Returns null when the source is skipped
// (paused, at its hourly limit, key missing) or when fn throws; throw RateLimited from fn on HTTP 429 to pause it.
export async function guarded<T>(source: string, fn: () => Promise<T>): Promise<T | null> {
  const f = frame();
  if (!hasKey(source, (f.env ?? process.env) as Env)) {
    logOnce(`key:${source}`, `${source} skipped: its key is not set`);
    return null;
  }
  const tally = tallyOf(f.answer, source);
  const skip = (why: string): null => {
    tally.skips++;
    f.skipped.n++;
    logOnce(`${why}:${source}:${Math.floor(f.now() / 3_600_000)}`, `${source} skipped: ${why}`);
    return null;
  };
  if (f.answer.calls >= f.answer.cap) {
    if (!f.answer.capLogged) console.info(`[visuals] the answer reached its ${f.answer.cap} outside calls`);
    f.answer.capLogged = true;
    tally.skips++;
    f.skipped.n++;
    return null;
  }
  const bucket = bucketOf(source);
  const limit = limitFor(source);
  const t = f.now();
  if ((pausedUntil.get(bucket) ?? 0) > t) return skip('paused');
  let verdict: string;
  if (f.withDb) {
    verdict = await f
      .withDb(async (db) => String((await db.query(`select content.take_visual_call($1, $2, $3::int[]) as v`, [bucket, source, limitsOf(limit)])).rows[0]?.v ?? 'ok'))
      .catch(() => localTake(bucket, limit, t));
  } else verdict = localTake(bucket, limit, t);
  if (verdict === 'paused') return skip('paused');
  if (verdict !== 'ok') return skip('at its limit');
  f.answer.calls++;
  tally.calls++;
  try {
    const value = await fn();
    if (value !== null && value !== undefined) {
      tally.hits++;
      if (f.withDb) await f.withDb((db) => db.query(`select content.note_visual_hit($1)`, [source])).catch(() => {});
    }
    return value;
  } catch (e) {
    if (e instanceof RateLimited) {
      const s = Math.min(PAUSE_MAX_S, Math.max(1, Math.ceil(e.retryAfterS ?? PAUSE_DEFAULT_S)));
      pausedUntil.set(bucket, f.now() + s * 1000);
      tally.pauses++;
      logOnce(`pause:${bucket}:${pausedUntil.get(bucket)}`, `${source} answered 429: paused ${s} s`);
      if (f.withDb) await f.withDb((db) => db.query(`select content.pause_visual_source($1, $2, $3, $4)`, [bucket, source, s, 'rate limited'])).catch(() => {});
    }
    return null;
  }
}

// A Retry-After header as seconds (a number or an HTTP date), or null.
export function retryAfterS(v: string | null, now: number = Date.now()): number | null {
  if (!v) return null;
  if (/^\d+$/.test(v.trim())) return Number(v.trim());
  const at = Date.parse(v);
  return Number.isFinite(at) ? Math.max(1, Math.ceil((at - now) / 1000)) : null;
}
