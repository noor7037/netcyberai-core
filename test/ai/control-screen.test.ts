import { describe, expect, it } from "vitest";
import {
  RECENT_MS,
  providerState,
  type ProviderStateInput,
} from "@/lib/ai/provider-state";
import {
  GAP_MS,
  groupRequests,
  median,
  promote,
  summariseByProvider,
} from "@/lib/ai/ledger-view";
import type { LedgerAttempt, ProviderHealth } from "@/lib/contracts/ai-gateway";
import { en } from "@/lib/i18n/messages/en";
import { hi } from "@/lib/i18n/messages/hi";
import { PROVIDER_STATES } from "@/lib/ai/provider-state";
import { OUTCOMES } from "@/lib/ai/gateway/taxonomy";

// G3 (C371): Control → AI's pure parts. A provider's state is derived only from what the server holds; the ledger's
// attempts are grouped into requests (Primary → Backup 1 → Backup 2) and summed per provider from measured values only.

const NOW = Date.parse("2026-10-28T10:00:00.000Z");
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

let id = 0;
const attempt = (p: Partial<LedgerAttempt>): LedgerAttempt => ({
  attemptId: String(++id),
  at: ago(5),
  day: "2026-10-28",
  profileId: "family.resolver",
  providerId: "anthropic",
  model: "m1",
  revisionId: "7",
  position: 0,
  outcome: "ok",
  latencyMs: 900,
  tokensIn: 10,
  tokensOut: 20,
  streamed: true,
  costUsd: null,
  ...p,
});
const circuit = (p: Partial<ProviderHealth>): ProviderHealth => ({
  providerId: "anthropic",
  model: "m1",
  state: "closed",
  consecutiveFailures: 0,
  openedAt: null,
  trialAt: null,
  lastOutcome: null,
  lastAt: null,
  lastProbeAt: null,
  lastProbeOk: null,
  ...p,
});
const base: ProviderStateInput = {
  enabled: true,
  needsKey: true,
  hasKey: true,
  test: null,
  health: [],
  attempts: [],
  now: NOW,
};
const state = (p: Partial<ProviderStateInput>) =>
  providerState({ ...base, ...p }).state;

describe("providerState", () => {
  it("a switched-off provider is Disabled, whatever else is on record", () => {
    expect(
      state({
        enabled: false,
        health: [circuit({ state: "open" })],
        attempts: [attempt({})],
      }),
    ).toBe("disabled");
  });

  it("no key is Not configured; a key never tested is Saved; a provider needing no key says so", () => {
    expect(state({ hasKey: false })).toBe("not_configured");
    expect(state({})).toBe("saved");
    expect(state({ needsKey: false, hasKey: false })).toBe("no_key_needed");
  });

  it("the key test decides Tested or Test failed when there is no newer live traffic", () => {
    expect(state({ test: { at: ago(10), ok: true } })).toBe("tested");
    expect(state({ test: { at: ago(10), ok: false } })).toBe("test_failed");
    // A test record with no time is not a test.
    expect(state({ test: { at: null, ok: null } })).toBe("saved");
  });

  it("an open or half-open circuit is Circuit open, with its models", () => {
    const r = providerState({
      ...base,
      health: [
        circuit({ model: "a", state: "open" }),
        circuit({ model: "b", state: "half_open" }),
        circuit({ model: "c" }),
      ],
    });
    expect(r).toEqual({ state: "circuit_open", openModels: ["a", "b"] });
  });

  it("a last real outcome of rate_limited or quota_exhausted is Quota; a skipped attempt after it does not count", () => {
    expect(
      state({
        attempts: [
          attempt({ at: ago(30) }),
          attempt({ at: ago(3), outcome: "rate_limited" }),
        ],
      }),
    ).toBe("quota");
    expect(
      state({
        attempts: [
          attempt({ at: ago(3), outcome: "quota_exhausted" }),
          attempt({ at: ago(1), outcome: "skipped_open_circuit" }),
        ],
      }),
    ).toBe("quota");
    // From the circuit's last outcome too, when it is the newest.
    expect(
      state({
        health: [circuit({ lastOutcome: "quota_exhausted", lastAt: ago(1) })],
        attempts: [attempt({ at: ago(5) })],
      }),
    ).toBe("quota");
    // An answer after the limit clears it.
    expect(
      state({
        attempts: [
          attempt({ at: ago(10), outcome: "rate_limited" }),
          attempt({ at: ago(2) }),
        ],
      }),
    ).toBe("degraded");
  });

  it("recent answers with no retryable failure are Healthy; with one, Degraded", () => {
    expect(
      state({
        attempts: [attempt({}), attempt({ outcome: "content_rejected" })],
      }),
    ).toBe("healthy");
    expect(
      state({
        attempts: [attempt({}), attempt({ outcome: "upstream_timeout" })],
      }),
    ).toBe("degraded");
    // A closed circuit that is counting failures is Degraded too.
    expect(
      state({
        health: [circuit({ consecutiveFailures: 2 })],
        attempts: [attempt({})],
      }),
    ).toBe("degraded");
  });

  it("live traffic older than the recent window, or older than the key test, says nothing", () => {
    const old = new Date(NOW - RECENT_MS - 60_000).toISOString();
    expect(state({ attempts: [attempt({ at: old })] })).toBe("saved");
    expect(
      state({
        test: { at: ago(1), ok: false },
        attempts: [attempt({ at: ago(5) })],
      }),
    ).toBe("test_failed");
    expect(
      state({
        test: { at: ago(10), ok: false },
        attempts: [attempt({ at: ago(5) })],
      }),
    ).toBe("healthy");
  });

  it("only non-retryable failures in the window fall back to the key state", () => {
    expect(
      state({
        test: { at: ago(30), ok: true },
        attempts: [attempt({ outcome: "auth_failed" })],
      }),
    ).toBe("tested");
  });
});

describe("groupRequests", () => {
  it("puts one request’s attempts together, Primary first, newest request first", () => {
    const t = ago(20);
    const later = ago(2);
    const ledger = [
      attempt({
        attemptId: "11",
        at: t,
        position: 0,
        outcome: "upstream_timeout",
        latencyMs: 20000,
      }),
      attempt({
        attemptId: "12",
        at: t,
        position: 1,
        providerId: "openai",
        outcome: "ok",
        latencyMs: 1500,
      }),
      attempt({
        attemptId: "13",
        at: later,
        position: 0,
        outcome: "ok",
        latencyMs: 800,
      }),
    ].reverse();
    const g = groupRequests(ledger);
    expect(g.map((x) => x.attempts.map((a) => a.attemptId))).toEqual([
      ["13"],
      ["11", "12"],
    ]);
    expect(g[1]).toMatchObject({
      fellBack: true,
      outcome: "ok",
      latencyMs: 21500,
      profileId: "family.resolver",
    });
    expect(g[0]).toMatchObject({ fellBack: false, latencyMs: 800 });
  });

  it("starts a new request on another profile, another revision, a position that does not rise, or a gap in time", () => {
    const t = ago(10);
    const apart = new Date(Date.parse(t) + GAP_MS + 1).toISOString();
    const ledger = [
      attempt({ attemptId: "21", at: t, position: 0 }),
      attempt({
        attemptId: "22",
        at: t,
        position: 1,
        profileId: "copilot.draft",
      }),
      attempt({
        attemptId: "23",
        at: t,
        position: 0,
        profileId: "copilot.draft",
      }),
      attempt({
        attemptId: "24",
        at: t,
        position: 1,
        profileId: "copilot.draft",
        revisionId: "8",
      }),
      attempt({ attemptId: "25", at: t, position: 0 }),
      attempt({ attemptId: "26", at: apart, position: 1 }),
    ];
    expect(groupRequests(ledger).map((x) => x.attempts.length)).toEqual([
      1, 1, 1, 1, 1, 1,
    ]);
  });

  it("a request with an unmeasured attempt has no total time", () => {
    const t = ago(1);
    const g = groupRequests([
      attempt({
        attemptId: "31",
        at: t,
        outcome: "skipped_open_circuit",
        latencyMs: null,
      }),
      attempt({ attemptId: "32", at: t, position: 1 }),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].latencyMs).toBeNull();
  });

  it("no attempts, no requests", () => {
    expect(groupRequests([])).toEqual([]);
  });
});

describe("summariseByProvider", () => {
  it("counts, the middle answered time and tokens; cost unknown while any cost is unknown", () => {
    const s = summariseByProvider([
      attempt({ latencyMs: 100 }),
      attempt({ latencyMs: 300 }),
      attempt({ latencyMs: 200, costUsd: 0.01 }),
      attempt({ outcome: "upstream_unavailable", latencyMs: 5000 }),
      attempt({
        outcome: "skipped_open_circuit",
        latencyMs: null,
        tokensIn: 0,
        tokensOut: 0,
      }),
      attempt({ providerId: "openai", costUsd: 0.5 }),
    ]);
    expect(s.map((x) => x.providerId)).toEqual(["anthropic", "openai"]);
    expect(s[0]).toMatchObject({
      attempts: 5,
      answered: 3,
      failed: 1,
      skipped: 1,
      medianMs: 200,
      tokensIn: 40,
      tokensOut: 80,
      costUsd: null,
    });
    expect(s[1]).toMatchObject({ attempts: 1, answered: 1, costUsd: 0.5 });
  });

  it("the median of an even count is the mean of the middle two; of none, null", () => {
    expect(median([1, 4, 2, 3])).toBe(3);
    expect(median([])).toBeNull();
  });
});

describe("promote", () => {
  const route = [
    { provider: "a", model: "1" },
    { provider: "b", model: "2" },
    { provider: "c", model: "3" },
  ];
  it("makes the chosen backup the Primary and moves the ones before it down, in order", () => {
    expect(promote(route, 1).map((s) => s.provider)).toEqual(["b", "a", "c"]);
    expect(promote(route, 2).map((s) => s.provider)).toEqual(["c", "a", "b"]);
  });
  it("leaves the route as it is for the Primary or a slot that does not exist", () => {
    expect(promote(route, 0)).toEqual(route);
    expect(promote(route, 5)).toEqual(route);
  });
});

describe("the words", () => {
  it("every state and every outcome class has words in English and Hindi", () => {
    const keys = [
      ...PROVIDER_STATES.flatMap((s) => [
        `control.ai.state.${s}`,
        `control.ai.state.why.${s}`,
      ]),
      ...OUTCOMES.map((o) => `control.ai.outcome.${o}`),
    ];
    for (const k of keys) {
      expect((en as Record<string, string>)[k], k).toBeTruthy();
      expect((hi as Record<string, string>)[k], k).toBeTruthy();
    }
  });
});
