import type { Sql } from '@/lib/jobs/types';
import type { LedgerAttempt } from '@/lib/contracts/ai-gateway';
import { CIRCUIT_OPEN_AFTER } from './circuit';
import type { CircuitEffect, Outcome } from './taxonomy';

// The usage ledger (G2, C370): one row per attempt in control.ai_usage_ledger, written after the call in the caller's
// own transaction, through control.record_ai_attempt (which also moves the provider's circuit). What a row holds is
// below: ids, the outcome class, time and token counts. Never the prompt, the answer, a child's words or a key. The
// cost stays null (unknown): no price is configured, so none is invented.

export type Attempt = {
  provider: string;
  model: string;
  // 0 Primary, 1 Backup 1, 2 Backup 2.
  position: number;
  outcome: Outcome;
  circuit: CircuitEffect;
  latencyMs: number | null;
  tokensIn: number;
  tokensOut: number;
  streamed: boolean;
};

export async function recordAttempts(db: Sql, a: { day: string; profileId: string; revisionId: string | null }, attempts: readonly Attempt[]): Promise<void> {
  for (const t of attempts) {
    await db.query(
      `select control.record_ai_attempt($1::date, $2::text, $3::text, $4::text, $5::bigint, $6::int, $7::text, $8::int, $9::bigint, $10::bigint, $11::boolean, $12::text, $13::int)`,
      [
        a.day,
        a.profileId,
        t.provider,
        t.model,
        a.revisionId,
        t.position,
        t.outcome,
        t.latencyMs === null ? null : Math.max(0, Math.round(t.latencyMs)),
        Math.max(0, Math.round(t.tokensIn)),
        Math.max(0, Math.round(t.tokensOut)),
        t.streamed,
        t.circuit,
        CIRCUIT_OPEN_AFTER,
      ]
    );
  }
}

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// Control's view (the platform role): the latest attempts, newest first, for one day and one profile when asked.
export async function loadUsageLedger(db: Sql, f: { day?: string; profileId?: string; limit?: number } = {}): Promise<LedgerAttempt[]> {
  const limit = Math.min(500, Math.max(1, Math.floor(f.limit ?? 100)));
  const { rows } = await db.query(
    `select attempt_id, at, day::text as day, profile_id, provider_id, model, revision_id, route_position, outcome, latency_ms, tokens_in, tokens_out, streamed, cost_usd
       from control.ai_usage_ledger
      where ($1::date is null or day = $1::date) and ($2::text is null or profile_id = $2)
      order by attempt_id desc limit $3`,
    [f.day && DAY.test(f.day) ? f.day : null, f.profileId ?? null, limit]
  );
  return rows.map((r) => ({
    attemptId: String(r.attempt_id),
    at: iso(r.at) as string,
    day: String(r.day),
    profileId: String(r.profile_id),
    providerId: String(r.provider_id),
    model: String(r.model),
    revisionId: r.revision_id === null || r.revision_id === undefined ? null : String(r.revision_id),
    position: Number(r.route_position),
    outcome: String(r.outcome),
    latencyMs: r.latency_ms === null || r.latency_ms === undefined ? null : Number(r.latency_ms),
    tokensIn: Number(r.tokens_in ?? 0),
    tokensOut: Number(r.tokens_out ?? 0),
    streamed: r.streamed === true,
    costUsd: r.cost_usd === null || r.cost_usd === undefined ? null : Number(r.cost_usd),
  }));
}
