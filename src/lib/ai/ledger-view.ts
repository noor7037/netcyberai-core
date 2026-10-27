import type { LedgerAttempt } from "@/lib/contracts/ai-gateway";

// How Control → AI reads the usage ledger (G3, C371). Pure functions over the rows the server returned; every number
// they give is a count or a measured time or token count from those rows. Nothing is estimated.

// The ledger keeps no request id. One request's attempts are written together after the call, in one transaction,
// so they share the profile, the route revision and (Postgres now() is the transaction's start) the time; their
// route positions rise. Attempts are put in one request when, in the order they were written, each has the same
// profile and revision as the one before, a higher position, and a time within GAP_MS of it.
export const GAP_MS = 2000;

export type RequestGroup = {
  key: string;
  profileId: string;
  at: string;
  attempts: LedgerAttempt[];
  // The outcome of the last attempt: what the request ended with.
  outcome: string;
  fellBack: boolean;
  // The sum of the attempts' measured times, or null when one of them has none.
  latencyMs: number | null;
};

const ms = (v: string) => Date.parse(v);

export function groupRequests(
  ledger: readonly LedgerAttempt[],
): RequestGroup[] {
  const ordered = [...ledger].sort(
    (a, b) => Number(a.attemptId) - Number(b.attemptId),
  );
  const groups: LedgerAttempt[][] = [];
  for (const a of ordered) {
    const cur = groups[groups.length - 1];
    const prev = cur?.[cur.length - 1];
    const joins =
      prev &&
      prev.profileId === a.profileId &&
      prev.revisionId === a.revisionId &&
      a.position > prev.position &&
      Math.abs(ms(a.at) - ms(prev.at)) <= GAP_MS;
    if (joins) cur.push(a);
    else groups.push([a]);
  }
  return groups
    .map((g) => ({
      key: g[0].attemptId,
      profileId: g[0].profileId,
      at: g[0].at,
      attempts: g,
      outcome: g[g.length - 1].outcome,
      fellBack: g.length > 1,
      latencyMs: g.every((a) => a.latencyMs !== null)
        ? g.reduce((s, a) => s + (a.latencyMs ?? 0), 0)
        : null,
    }))
    .reverse();
}

export type ProviderSummary = {
  providerId: string;
  attempts: number;
  answered: number;
  failed: number;
  skipped: number;
  // The middle of the answered attempts' measured times; null when none was measured.
  medianMs: number | null;
  tokensIn: number;
  tokensOut: number;
  // The sum of the attempts' cost, or null (unknown) while any attempt's cost is unknown.
  costUsd: number | null;
};

const SKIPPED = new Set(["skipped_open_circuit", "skipped_deadline"]);

export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export function summariseByProvider(
  ledger: readonly LedgerAttempt[],
): ProviderSummary[] {
  const by = new Map<string, LedgerAttempt[]>();
  for (const a of ledger)
    by.set(a.providerId, [...(by.get(a.providerId) ?? []), a]);
  return [...by.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([providerId, rows]) => {
      const answered = rows.filter((r) => r.outcome === "ok");
      const skipped = rows.filter((r) => SKIPPED.has(r.outcome)).length;
      return {
        providerId,
        attempts: rows.length,
        answered: answered.length,
        failed: rows.length - answered.length - skipped,
        skipped,
        medianMs: median(
          answered.flatMap((r) => (r.latencyMs === null ? [] : [r.latencyMs])),
        ),
        tokensIn: rows.reduce((s, r) => s + r.tokensIn, 0),
        tokensOut: rows.reduce((s, r) => s + r.tokensOut, 0),
        costUsd: rows.every((r) => r.costUsd !== null)
          ? rows.reduce((s, r) => s + (r.costUsd ?? 0), 0)
          : null,
      };
    });
}

// Promote (the brief's §4.4): the slot at `index` becomes the Primary; the slots before it move down one, in order.
export type Slot = { provider: string; model: string };
export function promote(route: readonly Slot[], index: number): Slot[] {
  if (index <= 0 || index >= route.length) return [...route];
  return [route[index], ...route.slice(0, index), ...route.slice(index + 1)];
}
