import { AsyncLocalStorage } from 'node:async_hooks';
import type { PoolClient } from 'pg';

// The school agent's transaction (C546). While a change request is checked, previewed or made live, every route the
// agent calls runs inside ONE transaction that the engine opened as the asking person: withTenantContext joins it
// (a savepoint per call) instead of opening and committing its own. A check or a preview then rolls the whole thing
// back, and going live commits it once, all or nothing.
//
// Inside it nothing may leave the transaction: a context that opens its own connection or reaches the network throws
// (assertNoAgentTx), so a route that would write elsewhere or send something simply fails in the check.
export type AgentTx = { client: PoolClient; userId: string; schoolId: string; mode: 'check' | 'preview' | 'apply'; savepoints: number };
export const agentTx = new AsyncLocalStorage<AgentTx>();

export class AgentTxEscape extends Error {
  constructor(what: string) {
    super(`agent_tx_escape:${what}`);
  }
}

export function assertNoAgentTx(what: string): void {
  if (agentTx.getStore()) throw new AgentTxEscape(what);
}

export async function inSavepoint<T>(tx: AgentTx, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const name = `agent_sp_${++tx.savepoints}`;
  await tx.client.query(`savepoint ${name}`);
  try {
    const out = await fn(tx.client);
    await tx.client.query(`release savepoint ${name}`);
    return out;
  } catch (err) {
    await tx.client.query(`rollback to savepoint ${name}`).catch(() => {});
    throw err;
  }
}

// No network from inside the agent's transaction: a direct send, a job kick or an AI call made by a route there is
// refused, so a check or preview can never reach anyone. Installed once; outside the transaction fetch is unchanged.
const FETCH_GUARD = Symbol.for('nca.agent.fetchGuard');
const g = globalThis as unknown as Record<symbol, boolean> & { fetch: typeof fetch };
if (!g[FETCH_GUARD] && typeof g.fetch === 'function') {
  const original = g.fetch.bind(globalThis);
  g.fetch = ((...args: Parameters<typeof fetch>) => {
    if (agentTx.getStore()) return Promise.reject(new AgentTxEscape('network'));
    return original(...args);
  }) as typeof fetch;
  g[FETCH_GUARD] = true;
}

// The agent's own work never runs inside someone's Preview: its checks and its going live start from the live school.
export const agentNoPreview = new AsyncLocalStorage<true>();
