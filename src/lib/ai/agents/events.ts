import type { AgentId, TurnStep } from './registry';

// The last handoffs of the tutor turn, for the development graph (src/app/(dev)/tutor-graph, W16-A1). One server
// instance's memory, the newest 50, lost on restart: a picture for a developer, never a record. An event holds the step,
// its agent, how long it took and counts, never a child's words, a name or an id of a person.
export type HandoffEvent = {
  turn: string;
  step: TurnStep;
  agent: AgentId;
  at: string;
  ms: number;
  // Counts and flags only (passages found, blocks kept, problems seen, jobs enqueued).
  facts: Record<string, number | boolean | string>;
};

export const RING_SIZE = 50;
// On globalThis, so the route that records and the page that reads share one ring however the server bundles them.
const holder = globalThis as typeof globalThis & { __ncaTutorHandoffs?: HandoffEvent[] };
const ring: HandoffEvent[] = (holder.__ncaTutorHandoffs ??= []);

export function recordHandoff(e: HandoffEvent): void {
  ring.push(e);
  if (ring.length > RING_SIZE) ring.splice(0, ring.length - RING_SIZE);
}

// Newest first.
export function recentHandoffs(): HandoffEvent[] {
  return [...ring].reverse();
}

export function clearHandoffs(): void {
  ring.length = 0;
}
