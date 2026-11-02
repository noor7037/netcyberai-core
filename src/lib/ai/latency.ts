import type { Sql } from '@/lib/jobs/types';
import { PROFILES, type AiProfile } from './platform';

// Latency targets on the Control AI dashboard (W16-A5; the proposal's M11 and the measurement half of M4): for each
// family profile, the middle (p50) and the slow end (p95) of the time to the first words and to the whole answer over
// the last 24 hours, against the profile's target. One query, no new table.
//
// Where the times come from. The whole-answer time is the usage ledger's latency of the attempts that answered
// (control.ai_usage_ledger, outcome ok): it keeps one time an attempt, not the first words. The first-words time is kept
// by the quality check (control.ai_qc_results.first_text_ms, written by recordQc for each checked answer), so a profile
// shows it once its answers are checked. Counts and times only; nothing a child wrote or read.

export type Spread = { p50: number; p95: number; n: number };
export type LatencyStatus = 'ok' | 'slow' | 'over' | 'none';
export type LatencyMetric = { spread: Spread | null; targetMs: number | null; status: LatencyStatus };
export type LatencyTile = { profileId: string; firstText: LatencyMetric; whole: LatencyMetric; status: LatencyStatus };

// The resolver's answer should end within this; the other profiles with a time of their own (callMs) are held to it.
export const RESOLVER_WHOLE_TARGET_MS = 20_000;
export type TargetOverride = { firstTextMs?: number | null; wholeMs?: number | null };

export function targetsOf(profile: AiProfile, extra: Record<string, TargetOverride> = {}): { firstTextMs: number | null; wholeMs: number | null } {
  const o = extra[profile.id] ?? {};
  return {
    firstTextMs: o.firstTextMs !== undefined ? o.firstTextMs : profile.firstTextMs ?? null,
    wholeMs: o.wholeMs !== undefined ? o.wholeMs : profile.id === 'family.resolver' ? RESOLVER_WHOLE_TARGET_MS : profile.callMs ?? null,
  };
}

// On target when the slow end meets it; slow when only the middle does; over when even the middle misses; none without
// answers or without a target.
export function statusOf(spread: Spread | null, targetMs: number | null): LatencyStatus {
  if (!spread || targetMs === null) return 'none';
  if (spread.p95 <= targetMs) return 'ok';
  return spread.p50 <= targetMs ? 'slow' : 'over';
}
const RANK: Record<LatencyStatus, number> = { none: 0, ok: 1, slow: 2, over: 3 };
const worst = (a: LatencyStatus, b: LatencyStatus): LatencyStatus => (RANK[a] >= RANK[b] ? a : b);

type Row = { profile_id: unknown; kind: unknown; n: unknown; p50: unknown; p95: unknown };

// The family profiles' tiles. A profile with no answers in the window still gets its tile (empty), so the screen shows
// every service it watches.
export async function loadLatencyTiles(db: Sql, extra: Record<string, TargetOverride> = {}): Promise<LatencyTile[]> {
  const hasQc = (await db.query(`select to_regclass('control.ai_qc_results') as t`)).rows[0]?.t != null;
  const whole = `select profile_id, 'whole' as kind, count(*)::int as n,
                        percentile_cont(0.5) within group (order by latency_ms) as p50, percentile_cont(0.95) within group (order by latency_ms) as p95
                   from control.ai_usage_ledger
                  where at > now() - interval '24 hours' and outcome = 'ok' and latency_ms is not null group by profile_id`;
  const first = `select profile_id, 'first' as kind, count(*)::int as n,
                        percentile_cont(0.5) within group (order by first_text_ms) as p50, percentile_cont(0.95) within group (order by first_text_ms) as p95
                   from control.ai_qc_results
                  where at > now() - interval '24 hours' and first_text_ms is not null group by profile_id`;
  const { rows } = await db.query(hasQc ? `${whole} union all ${first}` : whole);
  const by = new Map<string, { first?: Spread; whole?: Spread }>();
  for (const r of rows as Row[]) {
    const spread: Spread = { p50: Math.round(Number(r.p50)), p95: Math.round(Number(r.p95)), n: Number(r.n) };
    const entry = by.get(String(r.profile_id)) ?? {};
    if (r.kind === 'first') entry.first = spread;
    else entry.whole = spread;
    by.set(String(r.profile_id), entry);
  }
  return PROFILES.filter((p) => p.audience === 'family').map((p) => {
    const t = targetsOf(p, extra);
    const got = by.get(p.id);
    const firstText: LatencyMetric = { spread: got?.first ?? null, targetMs: t.firstTextMs, status: statusOf(got?.first ?? null, t.firstTextMs) };
    const wholeMetric: LatencyMetric = { spread: got?.whole ?? null, targetMs: t.wholeMs, status: statusOf(got?.whole ?? null, t.wholeMs) };
    return { profileId: p.id, firstText, whole: wholeMetric, status: worst(firstText.status, wholeMetric.status) };
  });
}
