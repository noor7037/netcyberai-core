// The AI gateway's routing records as Control's screens read them (G2, C370; G3 builds the screens). Types only.
// No key, prompt, answer or child's words is in any of them.

// One activation of a profile's route: Primary (providerId + model), then Backup 1 and Backup 2 (fallback).
export type RouteRevision = {
  revisionId: string;
  profileId: string;
  providerId: string | null;
  model: string | null;
  fallback: { provider: string; model: string }[];
  promptVersion: string;
  enabled: boolean;
  activation: 'baseline' | 'set' | 'undo' | 'rollback';
  rollbackOf: string | null;
  activatedAt: string;
  activatedByName: string | null;
  // The revision the profile runs now.
  active: boolean;
};

export type CircuitState = 'closed' | 'open' | 'half_open';
export type ProviderHealth = {
  providerId: string;
  model: string;
  state: CircuitState;
  consecutiveFailures: number;
  openedAt: string | null;
  trialAt: string | null;
  lastOutcome: string | null;
  lastAt: string | null;
  lastProbeAt: string | null;
  lastProbeOk: boolean | null;
};

export type LedgerAttempt = {
  attemptId: string;
  at: string;
  day: string;
  profileId: string;
  providerId: string;
  model: string;
  revisionId: string | null;
  // 0 Primary, 1 Backup 1, 2 Backup 2.
  position: number;
  outcome: string;
  latencyMs: number | null;
  tokensIn: number;
  tokensOut: number;
  streamed: boolean;
  // Null: unknown (no price is configured).
  costUsd: number | null;
};
