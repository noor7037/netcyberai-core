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
import { agentTurn, asSteps, MAX_ROUNDS, NO_SUCH_ACTION, NOT_FINISHED } from '@/lib/agent/loop';

const claims = { sub: 'u1', role: 'principal', schoolId: 's1', membershipId: 'm', tokenVersion: 0, aal: 'aal1', sessionId: 'x' } as never;
const auth = { origin: 'http://localhost', cookie: '', authorization: '' };

describe('the agent turn', () => {
  it('reads "GET /classes" and "POST /api/app/classes/{classId}" as the catalog routes', () => {
    expect(normalizeEndpoint('GET /classes')).toBe('GET classes');
    expect(normalizeEndpoint('patch /api/app/classes/{classId}')).toBe('PATCH classes/:classId');
    expect(catalogEntry('GET /classes')?.id).toBe('GET classes');
    expect(asSteps([{ endpoint: 'POST /classes', body: { name: '6-C' } }])[0].endpoint).toBe('POST classes');
    // A full address, with or without a query, is the same route.
    expect(normalizeEndpoint('GET https://www.netcyberai.com/api/app/classes?sessionId=1')).toBe('GET classes');
    expect(normalizeEndpoint('get http://localhost:3000/api/app/classes/{classId}')).toBe('GET classes/:classId');
    expect(catalogEntry('GET https://www.netcyberai.com/api/app/classes')?.id).toBe('GET classes');
  });

  it('a plan of unknown routes goes back to the model, never a crash, and the model is called outside any transaction', async () => {
    state.answers = ['{"say":"x","plan":{"title":"t","summary":"","steps":[{"endpoint":"POST /nowhere"}]}}', '{"say":"I could not find that."}'];
    const reply = await agentTurn(claims, 'do something', auth);
    expect(reply.say).toBe('I could not find that.');
    expect(reply.requestId).toBeNull();
    expect(state.seenDepths).toEqual([0, 0]);
  });

  it('never repeats an earlier round’s words: an unknown route then a silent answer says plainly nothing was changed', async () => {
    state.answers = ['{"say":"Ready.","plan":{"title":"t","summary":"","steps":[{"endpoint":"POST /nowhere"}]}}', '{}'];
    const reply = await agentTurn(claims, 'do something', auth);
    expect(reply.say).toBe(NO_SUCH_ACTION);
    expect(reply.say).not.toContain('Ready');
    expect(reply.requestId).toBeNull();
  });

  it('a turn that runs out of rounds says it did not finish, not a half-way sentence', async () => {
    state.answers = Array.from({ length: MAX_ROUNDS }, () => '{"say":"Let me look at the classes.","modules":["classes"]}');
    const reply = await agentTurn(claims, 'do something', auth);
    expect(reply.say).toBe(NOT_FINISHED);
  });
});
