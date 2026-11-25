import { describe, expect, it, vi } from 'vitest';

// The school agent's turn (C546 fixes): a route written "GET /classes" is the catalog's "GET classes"; a plan naming
// routes that do not exist goes back to the model instead of crashing; and no database transaction is held open while
// the model answers.

const state = vi.hoisted(() => ({ depth: 0, answers: [] as string[], seenDepths: [] as number[] }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  withTenantContext: async (_claims: unknown, fn: (db: unknown) => Promise<unknown>) => {
    state.depth++;
    try {
      return await fn({ query: async (sql: string) => ({ rows: /count\(\*\)/.test(sql) ? [{ n: 0 }] : /from schools/.test(sql) ? [{ name: 'School A' }] : /insert into agent_requests/.test(sql) ? [{ request_id: 'r1' }] : [], rowCount: 1 }) });
    } finally {
      state.depth--;
    }
  },
}));
vi.mock('@/lib/ai/platform', () => ({
  streamText: async (db: { query: (s: string) => Promise<unknown> }) => {
    state.seenDepths.push(state.depth);
    await db.query('select 1'); // the platform's own reads still work, each in its own short transaction
    const text = state.answers.shift() ?? '{"say":"done"}';
    return { ok: true, text, tokensIn: 1, tokensOut: 1, provider: 'p', model: 'm' };
  },
}));

import { catalogEntry, normalizeEndpoint } from '@/lib/agent/call';
import { agentTurn, asSteps } from '@/lib/agent/loop';

const claims = { sub: 'u1', role: 'principal', schoolId: 's1', membershipId: 'm', tokenVersion: 0, aal: 'aal1', sessionId: 'x' } as never;
const auth = { origin: 'http://localhost', cookie: '', authorization: '' };

describe('the agent turn', () => {
  it('reads "GET /classes" and "POST /api/app/classes/{classId}" as the catalog routes', () => {
    expect(normalizeEndpoint('GET /classes')).toBe('GET classes');
    expect(normalizeEndpoint('patch /api/app/classes/{classId}')).toBe('PATCH classes/:classId');
    expect(catalogEntry('GET /classes')?.id).toBe('GET classes');
    expect(asSteps([{ endpoint: 'POST /classes', body: { name: '6-C' } }])[0].endpoint).toBe('POST classes');
  });

  it('a plan of unknown routes goes back to the model, never a crash, and the model is called outside any transaction', async () => {
    state.answers = ['{"say":"x","plan":{"title":"t","summary":"","steps":[{"endpoint":"POST /nowhere"}]}}', '{"say":"I could not find that."}'];
    const reply = await agentTurn(claims, 'do something', auth);
    expect(reply.say).toBe('I could not find that.');
    expect(reply.requestId).toBeNull();
    expect(state.seenDepths).toEqual([0, 0]);
  });
});
