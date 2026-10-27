import type { LedgerAttempt, ProviderHealth } from "@/lib/contracts/ai-gateway";

// A provider's state on Control → AI (G3, C371; the brief's §4.1), derived only from what the server holds: the
// provider's switch, its saved key and the key test's outcome, its circuits (control.ai_provider_health) and its latest
// attempts in the usage ledger. Nothing is guessed: with no evidence for a state, the state with less is shown.
//
// Order, first match wins:
//   disabled        the provider is switched off (control.ai_providers.enabled = false)
//   not_configured  it needs a key and has none
//   circuit_open    a circuit of one of its models is open (or half-open: its one trial is under way)
//   quota           its last real outcome (ledger or circuit) was a rate limit or an exhausted quota
//   degraded        live traffic newer than the key test: a retryable failure in the recent window, or a circuit
//                   closed but counting failures
//   healthy         live traffic newer than the key test: an answer in the recent window and no retryable failure
//   test_failed     the last key test did not work
//   tested          the last key test worked
//   saved           a key is saved and was never tested (and no live traffic says more)
//   no_key_needed   a provider that needs no key, with nothing else on record

export const PROVIDER_STATES = [
  "disabled",
  "not_configured",
  "circuit_open",
  "quota",
  "degraded",
  "healthy",
  "test_failed",
  "tested",
  "saved",
  "no_key_needed",
] as const;
export type ProviderState = (typeof PROVIDER_STATES)[number];

// "Recent" for live traffic: an hour. Long enough to cover a quiet school hour, short enough that a failure from the
// morning does not still mark the provider degraded in the evening.
export const RECENT_MS = 60 * 60 * 1000;

// The outcomes that count against a provider's circuit (gateway/taxonomy.ts: circuit 'failure').
const RETRYABLE = new Set([
  "upstream_timeout",
  "upstream_unavailable",
  "rate_limited",
  "quota_exhausted",
  "model_unavailable",
]);
const QUOTA = new Set(["rate_limited", "quota_exhausted"]);
// A skipped attempt says nothing new about the provider: the circuit decided it, not the provider.
const SKIPPED = new Set(["skipped_open_circuit", "skipped_deadline"]);

export type ProviderStateInput = {
  enabled: boolean;
  needsKey: boolean;
  hasKey: boolean;
  test: { at: string | null; ok: boolean | null } | null;
  // This provider's circuits (one per model) and its ledger attempts (any order).
  health: readonly ProviderHealth[];
  attempts: readonly LedgerAttempt[];
  now: number;
};

export type ProviderStateResult = {
  state: ProviderState;
  openModels: string[];
};

const ms = (v: string | null | undefined) => (v ? Date.parse(v) : NaN);

export function providerState(i: ProviderStateInput): ProviderStateResult {
  const none: string[] = [];
  if (!i.enabled) return { state: "disabled", openModels: none };
  if (i.needsKey && !i.hasKey)
    return { state: "not_configured", openModels: none };

  const openModels = i.health
    .filter((h) => h.state !== "closed")
    .map((h) => h.model);
  if (openModels.length) return { state: "circuit_open", openModels };

  // The last real outcome: the newest of the ledger's real attempts and the circuits' last outcomes.
  const real = i.attempts.filter((a) => !SKIPPED.has(a.outcome));
  const outcomes = [
    ...real.map((a) => ({ at: ms(a.at), outcome: a.outcome })),
    ...i.health
      .filter((h) => h.lastOutcome && !SKIPPED.has(h.lastOutcome))
      .map((h) => ({ at: ms(h.lastAt), outcome: h.lastOutcome as string })),
  ].filter((o) => Number.isFinite(o.at));
  const last = outcomes.reduce<{ at: number; outcome: string } | null>(
    (a, b) => (a === null || b.at > a.at ? b : a),
    null,
  );
  if (last && QUOTA.has(last.outcome))
    return { state: "quota", openModels: none };

  const testAt = ms(i.test?.at);
  const recent = real.filter(
    (a) => i.now - ms(a.at) <= RECENT_MS && ms(a.at) <= i.now + 60_000,
  );
  const liveAt = recent.reduce((m, a) => Math.max(m, ms(a.at)), -Infinity);
  const liveIsNewer =
    recent.length > 0 && (!Number.isFinite(testAt) || liveAt > testAt);
  if (liveIsNewer) {
    const counting = i.health.some((h) => h.consecutiveFailures > 0);
    if (recent.some((a) => RETRYABLE.has(a.outcome)) || counting)
      return { state: "degraded", openModels: none };
    if (recent.some((a) => a.outcome === "ok"))
      return { state: "healthy", openModels: none };
  }

  if (i.hasKey && i.test?.at && i.test.ok === false)
    return { state: "test_failed", openModels: none };
  if (i.hasKey && i.test?.at && i.test.ok === true)
    return { state: "tested", openModels: none };
  if (i.hasKey) return { state: "saved", openModels: none };
  return { state: "no_key_needed", openModels: none };
}
