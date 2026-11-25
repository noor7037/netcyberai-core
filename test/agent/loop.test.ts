import { describe, expect, it, vi } from 'vitest';

// The school agent's turn (C546, C549). Routes written as "GET /classes" or full addresses are the catalog's; a plan
// naming unknown routes goes back to the model; no transaction is held while the model answers; the person hears only
// the last answer; earlier conversation is context, never words the model "just said"; each step is reported live; a
// fault in the app raises a ticket; an Aadhaar number is never written; links are this app's own pages only.

const state = vi.hoisted(() => ({
  depth: 0,
  answers: [] as string[],
  seenDepths: [] as number[],
  seenMessages: [] as { role: string; content: string; images?: unknown[] }[][],
  history: [] as Record<string, unknown>[],
  readStatus: 200,
  tickets: 0,
}));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  withTenantContext: async (_claims: unknown, fn: (db: unknown) => Promise<unknown>) => {
    state.depth++;
    try {
      return await fn({
        query: async (sql: string) => ({
          rows: /count\(\*\)/.test(sql) ? [{ n: 0 }] : /from schools/.test(sql) ? [{ name: 'School A' }] : /insert into agent_requests/.test(sql) ? [{ request_id: 'r1' }] : /from agent_messages/.test(sql) ? state.history : [],
          rowCount: 1,
        }),
      });
    } finally {
      state.depth--;
    }
  },
}));
vi.mock('@/lib/ai/platform', () => ({
  streamText: async (db: { query: (s: string) => Promise<unknown> }, _ctx: unknown, _p: unknown, req: { messages: { role: string; content: string }[] }) => {
    state.seenDepths.push(state.depth);
    state.seenMessages.push(req.messages.map((m) => ({ ...m })));
    await db.query('select 1'); // the platform's own reads still work, each in its own short transaction
    const text = state.answers.shift() ?? '{"say":"done"}';
    return { ok: true, text, tokensIn: 1, tokensOut: 1, provider: 'p', model: 'm' };
  },
}));
vi.mock('@/lib/agent/engine', async (original) => ({
  ...(await original<typeof import('@/lib/agent/engine')>()),
  readSteps: async (_c: unknown, steps: { endpoint: string }[]) => steps.map((s) => ({ endpoint: s.endpoint, status: state.readStatus, ok: state.readStatus < 400, answer: { classes: [] }, ...(state.readStatus >= 400 ? { error: 'boom' } : {}) })),
}));
vi.mock('@/lib/support/tickets', () => ({
  createTicket: async () => {
    state.tickets++;
    return { ok: true, value: { ref: 'T-ABCD1234', jobKey: undefined } };
  },
}));
vi.mock('@/lib/jobs/handlers', () => ({ kickJobs: async () => {} }));

import { catalogEntry, normalizeEndpoint } from '@/lib/agent/call';
import { agentTurn, asSteps, carriesAadhaar, helpText, MAX_ROUNDS, NO_SUCH_ACTION, NOT_FINISHED, NOT_MADE, safeLinks, type AgentEvent } from '@/lib/agent/loop';
import { photosFrom } from '@/lib/agent/photos';

const claims = { sub: 'u1', role: 'principal', schoolId: 's1', membershipId: 'm', tokenVersion: 0, aal: 'aal1', sessionId: 'x' } as never;
const auth = { origin: 'http://localhost', cookie: '', authorization: '' };
const reset = () => {
  state.seenDepths = [];
  state.seenMessages = [];
  state.history = [];
  state.readStatus = 200;
  state.tickets = 0;
};

describe('routes the model writes', () => {
  it('reads "GET /classes", full addresses and queries as the catalog routes', () => {
    expect(normalizeEndpoint('GET /classes')).toBe('GET classes');
    expect(normalizeEndpoint('patch /api/app/classes/{classId}')).toBe('PATCH classes/:classId');
    expect(catalogEntry('GET /classes')?.id).toBe('GET classes');
    expect(asSteps([{ endpoint: 'POST /classes', body: { name: '6-C' } }])[0].endpoint).toBe('POST classes');
    expect(normalizeEndpoint('GET https://www.netcyberai.com/api/app/classes?sessionId=1')).toBe('GET classes');
    expect(normalizeEndpoint('get http://localhost:3000/api/app/classes/{classId}')).toBe('GET classes/:classId');
    expect(catalogEntry('GET https://www.netcyberai.com/api/app/classes')?.id).toBe('GET classes');
  });
});

describe('the agent turn', () => {
  it('a plan of unknown routes goes back to the model, never a crash, and the model is called outside any transaction', async () => {
    reset();
    state.answers = ['{"say":"x","plan":{"title":"t","summary":"","steps":[{"endpoint":"POST /nowhere"}]}}', '{"say":"I could not find that."}'];
    const reply = await agentTurn(claims, 'do something', auth);
    expect(reply.say).toBe('I could not find that.');
    expect(reply.requestId).toBeNull();
    expect(state.seenDepths).toEqual([0, 0]);
  });

  it('never repeats an earlier round’s words: an unknown route then a silent answer says plainly nothing was changed', async () => {
    reset();
    state.answers = ['{"say":"Ready.","plan":{"title":"t","summary":"","steps":[{"endpoint":"POST /nowhere"}]}}', '{}'];
    const reply = await agentTurn(claims, 'do something', auth);
    expect(reply.say).toBe(NO_SUCH_ACTION);
  });

  it('a turn that runs out of rounds says it did not finish, not a half-way sentence', async () => {
    reset();
    state.answers = Array.from({ length: MAX_ROUNDS }, () => '{"say":"Let me look at the classes.","modules":["classes"]}');
    expect((await agentTurn(claims, 'do something', auth)).say).toBe(NOT_FINISHED);
  });

  it('earlier conversation is context in the person’s message, never an answer the model just gave', async () => {
    reset();
    state.history = [
      { role: 'agent', body: 'I cannot reach Sunrise Public School.', names: [] },
      { role: 'person', body: 'Show Sunrise Public School classes', names: [] },
    ];
    state.answers = ['{"say":"6-A has 4 students."}'];
    await agentTurn(claims, 'How many students in each class?', auth);
    const first = state.seenMessages[0];
    expect(first).toHaveLength(1);
    expect(first[0].role).toBe('user');
    expect(first[0].content).toMatch(/EARLIER IN THIS CONVERSATION[\s\S]*never repeat an earlier answer[\s\S]*You: I cannot reach Sunrise[\s\S]*NOW THE PERSON ASKS:\nHow many students in each class\?/);
  });

  it('reports each step as it works', async () => {
    reset();
    const events: AgentEvent[] = [];
    state.answers = ['{"modules":["classes"]}', '{"reads":[{"endpoint":"GET classes"}]}', '{"say":"done"}'];
    await agentTurn(claims, 'count', auth, { onEvent: (e) => events.push(e) });
    expect(events.map((e) => e.key)).toEqual(['thinking', 'routes', 'thinking', 'reading', 'thinking', 'saving']);
  });

  it('a fault in the app raises a ticket with NetCyberAI and says so with its number', async () => {
    reset();
    state.readStatus = 500;
    state.answers = ['{"reads":[{"endpoint":"GET classes"}]}', '{"say":"I could not read the classes."}'];
    const reply = await agentTurn(claims, 'count', auth);
    expect(state.tickets).toBe(1);
    expect(reply.ticket).toBe('T-ABCD1234');
    expect(reply.say).toContain('raised ticket T-ABCD1234 with the NetCyberAI team');
  });

  it('a refusal by a route (4xx) is the person’s matter, not a ticket', async () => {
    reset();
    state.readStatus = 403;
    state.answers = ['{"reads":[{"endpoint":"GET classes"}]}', '{"say":"You cannot see that."}'];
    expect((await agentTurn(claims, 'count', auth)).ticket).toBeNull();
    expect(state.tickets).toBe(0);
  });

  it('a "how do I" question is answered from the app’s own guides, with the page as a link', async () => {
    reset();
    state.answers = ['{"help":"fee structure"}', '{"say":"Open Fees, then …"}'];
    const reply = await agentTurn(claims, 'How do I set fees?', auth);
    expect(state.seenMessages[1].at(-1)!.content).toMatch(/^GUIDES:/);
    expect(reply.links!.every((l) => l.href.startsWith('/app'))).toBe(true);
    expect(helpText('fee structure').text).toContain('GUIDE');
  });

  it('photos go to the model with the message, and a plan writing an Aadhaar number is sent back', async () => {
    reset();
    state.answers = ['{"plan":{"title":"Admit","summary":"","steps":[{"endpoint":"POST students","body":{"name":"[S1]","aadhaar":"1234 5678 9012"}}]}}', '{"say":"I left the Aadhaar number out."}'];
    const reply = await agentTurn(claims, 'Admit this student', auth, { images: [{ mediaType: 'image/jpeg', base64: 'AAAA' }] });
    expect(state.seenMessages[0][0].images).toHaveLength(1);
    expect(state.seenMessages[1].at(-1)!.content).toMatch(/^REFUSED: .*Aadhaar/);
    expect(reply.say).toBe('I left the Aadhaar number out.');
  });
});

describe('a change is never claimed without a plan', () => {
  it('"Created class 10-Z" with no plan is sent back, and the plan that follows is used', async () => {
    reset();
    state.answers = ['{"say":"Created class 10-Z."}', '{"say":"Ready to check: class 10-Z.","plan":{"title":"Make 10-Z","summary":"","steps":[{"endpoint":"POST nowhere-yet"}]}}', '{"say":"There is no action for that, so nothing was changed."}'];
    await agentTurn(claims, 'Create class 10-Z', auth);
    expect(state.seenMessages[1].at(-1)!.content).toMatch(/^NO PLAN SENT/);
  });
  it('a model that keeps claiming it is done is not believed', async () => {
    reset();
    state.answers = ['{"say":"Created class 10-Z."}', '{"say":"Done, class 10-Z was added."}', '{"say":"I have created it."}'];
    const reply = await agentTurn(claims, 'Create class 10-Z', auth);
    expect(reply.say).toBe(NOT_MADE);
    expect(reply.requestId).toBeNull();
  });
  it('a plain answer to a question is not mistaken for a claim', async () => {
    reset();
    state.answers = ['{"say":"6-A has 4 students and 7-A has 3."}'];
    expect((await agentTurn(claims, 'How many students?', auth)).say).toBe('6-A has 4 students and 7-A has 3.');
  });
});

describe('small rules', () => {
  it('only this app’s own pages and files are links', () => {
    expect(safeLinks([{ label: 'TC', href: '/api/app/documents/certificates/x/file' }, { label: 'x', href: 'https://evil.example' }, { label: 'y', href: '/app/../x' }, { label: '', href: '/app/fees' }])).toEqual([{ label: 'TC', href: '/api/app/documents/certificates/x/file' }]);
  });
  it('spots an Aadhaar-shaped number in any field', () => {
    expect(carriesAadhaar([{ endpoint: 'POST students', body: { note: 'id 123456789012' } }])).toBe(true);
    expect(carriesAadhaar([{ endpoint: 'POST students', body: { rollNo: '12', phone: '98765' } }])).toBe(false);
  });
  it('takes up to 3 JPEG, PNG or WebP photos and nothing else', () => {
    expect(photosFrom(undefined)).toEqual([]);
    expect(photosFrom([{ mediaType: 'image/png', base64: 'AAAA' }])).toHaveLength(1);
    expect(photosFrom([{ mediaType: 'application/pdf', base64: 'AAAA' }])).toBeNull();
    expect(photosFrom(Array.from({ length: 4 }, () => ({ mediaType: 'image/png', base64: 'AAAA' })))).toBeNull();
    expect(photosFrom([{ mediaType: 'image/png', base64: '<script>' }])).toBeNull();
  });
});
