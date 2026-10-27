import type { Sql } from '@/lib/jobs/types';
import type { CircuitState, ProviderHealth } from '@/lib/contracts/ai-gateway';

// The circuit breaker (G2, C370; the brief's §5.2 step 11), per provider and model, kept in control.ai_provider_health.
// After CIRCUIT_OPEN_AFTER retryable failures in a row (src/lib/ai/gateway/taxonomy.ts) the circuit opens: for
// CIRCUIT_COOLDOWN_SECONDS the provider is skipped (each skip is a ledger row), so a route goes straight to its backup
// instead of waiting on a provider that is down. After the cool-down one request is let through as the half-open trial:
// an answer closes the circuit, a retryable failure opens it again for another cool-down. No health request is made on
// a user's request: the trial is a real call.

// Five failures in a row: one or two are a provider's ordinary noise; five in a row, with nothing answered between
// them, are an outage worth routing round. The database holds it between 1 and 20.
export const CIRCUIT_OPEN_AFTER = 5;
// A minute: long enough that a provider that is down is not asked again on every request, short enough that a provider
// back up serves again within about a minute. The database holds it between 5 seconds and an hour.
export const CIRCUIT_COOLDOWN_SECONDS = 60;

// 'closed': try it. 'trial': try it, as the one half-open trial (taken now). 'open': skip it.
export type Admission = 'closed' | 'trial' | 'open';

// In the caller's prepare transaction, before the call goes out.
export async function admit(db: Sql, provider: string, model: string): Promise<Admission> {
  const { rows } = await db.query(`select control.ai_circuit_admit($1, $2, $3::int) as gate`, [provider, model, CIRCUIT_COOLDOWN_SECONDS]);
  const gate = rows[0]?.gate;
  return gate === 'trial' || gate === 'open' ? gate : 'closed';
}

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

// Control's view (the platform role): every provider and model with a circuit on record.
export async function loadProviderHealth(db: Sql): Promise<ProviderHealth[]> {
  const { rows } = await db.query(
    `select provider_id, model, state, consecutive_failures, opened_at, trial_at, last_outcome, last_at, last_probe_at, last_probe_ok
       from control.ai_provider_health order by provider_id, model`
  );
  return rows.map((r) => ({
    providerId: String(r.provider_id),
    model: String(r.model),
    state: r.state as CircuitState,
    consecutiveFailures: Number(r.consecutive_failures ?? 0),
    openedAt: iso(r.opened_at),
    trialAt: iso(r.trial_at),
    lastOutcome: r.last_outcome ?? null,
    lastAt: iso(r.last_at),
    lastProbeAt: iso(r.last_probe_at),
    lastProbeOk: typeof r.last_probe_ok === 'boolean' ? r.last_probe_ok : null,
  }));
}
