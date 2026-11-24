import type { PoolClient } from 'pg';
import type { SessionClaims } from '@/lib/auth/types';
import { agentTx } from './ctx';
import { callStep, type Auth } from './call';
import type { Step } from './types';

// "See it live" (C546): withTenantContext calls this when the person has a change request open in Preview. The request
// is replayed as this person in this request's own transaction, then the screen's work runs, and the caller rolls back.
// Both run inside the agent's transaction, so nothing on the screen can send, kick a job or write elsewhere either.
// A request that is not this person's to see, or no longer ready, is simply not replayed.

export async function previewSteps(client: PoolClient, claims: SessionClaims, requestId: string): Promise<Step[] | null> {
  const { rows } = await client.query(`select steps from agent_requests where request_id = $1 and school_id = $2 and status = 'ready'`, [requestId, claims.schoolId]);
  return rows[0] ? (rows[0].steps as Step[]) : null;
}

async function requestAuth(): Promise<Auth | null> {
  try {
    const { headers } = await import('next/headers');
    const h = headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    if (!host) return null;
    return { origin: `${h.get('x-forwarded-proto') ?? 'https'}://${host}`, cookie: h.get('cookie') ?? '', authorization: h.get('authorization') ?? '' };
  } catch {
    return null;
  }
}

export async function replayForPreview<T>(client: PoolClient, claims: SessionClaims, steps: Step[] | null, fn: () => Promise<T>): Promise<T> {
  const auth = steps ? await requestAuth() : null;
  return agentTx.run({ client, userId: claims.sub, schoolId: claims.schoolId as string, mode: 'preview', savepoints: 0 }, async () => {
    if (steps && auth) {
      const answers: unknown[] = [];
      for (const s of steps) {
        const r = await callStep(s, answers, auth, true);
        answers.push(r.answer);
        if (!r.ok) break;
      }
    }
    return fn();
  });
}
