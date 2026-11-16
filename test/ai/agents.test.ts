import { existsSync } from 'fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../db/pglite-harness';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { PROFILES, capableAdapter, profileNeeds } from '@/lib/ai/platform';
import { AGENTS, TURN_STEPS, type AgentId } from '@/lib/ai/agents/registry';
import { clearHandoffs, recentHandoffs, recordHandoff, RING_SIZE } from '@/lib/ai/agents/events';
import { AI_OPS_DAILY_JOB, TUTOR_PARENT_REPORT_JOB, TUTOR_QUIZ_JOB } from '@/lib/ai/agents/jobs';
import { quizJob, tutorTurn, type QualityRule, type TurnDeps, type Validator } from '@/lib/ai/agents/orchestrator';
import { quizJobHandler } from '@/lib/family/quiz';
import { productionHandlers } from '@/lib/jobs/handlers';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import { LONG_JOB_TYPES, runJobs } from '@/lib/jobs/runner';
import type { JobQueue } from '@/lib/jobs/types';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

// W16-A1: the Tutor's agent registry, the orchestrator's handoffs and the slow job types (the proposal's M2 and M3).

const CHAT = 'c16a1000-0000-4000-8000-000000000001';
const DAY = '2026-11-02';

describe('the agent registry', () => {
  it('names the ten agents once each', () => {
    const ids: AgentId[] = ['ingestion', 'orchestrator', 'voice', 'drawing', 'simulation', 'quiz', 'photo_doubt', 'parent_report', 'quality_check', 'ops'];
    expect(AGENTS.map((a) => a.id).sort()).toEqual([...ids].sort());
    for (const a of AGENTS) {
      expect(a.role.length).toBeGreaterThan(10);
      expect(a.inputs.length).toBeGreaterThan(0);
      expect(a.outputs.length).toBeGreaterThan(0);
    }
  });

  it('every profileId is a gateway profile, and the four new ones are shaped as the plan says', () => {
    const ids = new Set(PROFILES.map((p) => p.id));
    for (const a of AGENTS) if (a.profileId !== null) expect(ids.has(a.profileId), a.id).toBe(true);
    const of = (id: string) => PROFILES.find((p) => p.id === id);
    expect(of('family.quiz')).toMatchObject({ capability: 'text', carriesChildWords: true, callMs: 45_000, firstTextMs: 10_000 });
    expect(of('family.parent_report')).toMatchObject({ capability: 'text', carriesChildWords: false, callMs: 30_000 });
    expect(of('family.qc')).toMatchObject({ capability: 'text', carriesChildWords: true, callMs: 10_000 });
    expect(of('family.voice_call')).toMatchObject({ capability: 'realtime', carriesChildWords: true });
    // The realtime call is a slot: no provider has an adapter for it, so none can be saved for it in Control.
    // W16-A4 gave the slot its first adapter (OpenAI's realtime); every other provider still has none.
    for (const provider of ['google', 'nvidia', 'workers-ai', 'anthropic']) expect(capableAdapter('family.voice_call', provider)).toBeNull();
    expect(profileNeeds(of('family.voice_call')!)).toEqual(['realtime']);
  });

  it('every job agent’s jobType has a handler on the job runner; the parent report is a long job', () => {
    const handled = new Set(Object.keys(productionHandlers()));
    const jobs = AGENTS.filter((a) => a.mode === 'job');
    expect(jobs.map((a) => a.id).sort()).toEqual(['ingestion', 'ops', 'parent_report', 'quiz']);
    for (const a of jobs) if (a.mode === 'job') expect(handled.has(a.jobType), a.jobType).toBe(true);
    expect(agentJob('ingestion')).toBe('content.prepare');
    expect([agentJob('quiz'), agentJob('parent_report'), agentJob('ops')]).toEqual([TUTOR_QUIZ_JOB, TUTOR_PARENT_REPORT_JOB, AI_OPS_DAILY_JOB]);
    expect(LONG_JOB_TYPES).toContain(TUTOR_PARENT_REPORT_JOB);
    expect(LONG_JOB_TYPES).not.toContain(TUTOR_QUIZ_JOB);
  });

  it('what does the work today is a file in the repository, or pending with its wave', () => {
    for (const a of AGENTS) {
      if (a.implementedBy === 'pending') expect('wave' in a && /^W16-[AB]\d$/.test(a.wave), a.id).toBe(true);
      else expect(existsSync(a.implementedBy), a.implementedBy).toBe(true);
    }
    for (const s of TURN_STEPS) expect(existsSync(s.implementedBy), s.implementedBy).toBe(true);
  });
});

type B = { type: string };
type G = { kept: B[]; stopped: boolean; error: unknown };

// A mocked turn: each step records itself, so the order the orchestrator calls them in is visible.
function mockTurn(calls: string[], over: Partial<TurnDeps<{ id: string }, G, string, B>> = {}): TurnDeps<{ id: string }, G, string, B> {
  return {
    prepare: async () => {
      calls.push('prepare');
      return { id: 'p' };
    },
    prepared: () => ({ passages: 2, planAsked: true }),
    answer: async () => {
      calls.push('answer');
      return { kept: [{ type: 'explanation' }, { type: 'board' }, { type: 'check' }], stopped: false, error: null };
    },
    keep: async () => {
      calls.push('keep');
      return 'done';
    },
    ...over,
  };
}

describe('the orchestrator', () => {
  beforeEach(() => clearHandoffs());

  it('hands off in order: retrieve, plan, answer, validators, quality, enqueue; logs one line each, never the words', async () => {
    const calls: string[] = [];
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const validators: Validator<B>[] = [
      {
        id: 'board',
        check: (blocks) => {
          calls.push('validator');
          return { keep: blocks.filter((b) => b.type !== 'board'), problems: ['bad_command'] };
        },
      },
    ];
    const quality: QualityRule<B>[] = [
      {
        id: 'citation',
        check: ({ blocks, passages }) => {
          calls.push(`quality:${blocks.length}:${passages}`);
          return [];
        },
      },
    ];
    const enqueue = vi.fn(async () => {
      calls.push('enqueue');
      return { jobId: 'j', created: true };
    });
    const r = await tutorTurn(mockTurn(calls, { validators, quality, queue: { enqueue } }), { conversationId: CHAT, day: DAY, endsSession: true });
    expect(calls).toEqual(['prepare', 'answer', 'validator', 'quality:2:2', 'keep', 'enqueue']);
    expect(r).toMatchObject({ last: 'done', problems: ['board:bad_command'], enqueued: [TUTOR_QUIZ_JOB] });
    expect(r!.generated.kept.map((b) => b.type)).toEqual(['explanation', 'check']);
    expect(enqueue).toHaveBeenCalledWith(quizJob(CHAT, DAY));
    expect(quizJob(CHAT, DAY)).toMatchObject({ idempotencyKey: `tutor.quiz:${CHAT}:${DAY}`, payload: { conversationId: CHAT, day: DAY } });

    const steps = recentHandoffs().reverse();
    expect(steps.map((e) => e.step)).toEqual(['retrieve', 'plan', 'answer', 'visual_check', 'quality_check', 'enqueue']);
    expect(steps.map((e) => e.step)).toEqual(TURN_STEPS.map((s) => s.step));
    expect(new Set(steps.map((e) => e.turn)).size).toBe(1);
    expect(steps[0].facts).toEqual({ found: 2 });
    expect(steps[3].facts).toMatchObject({ validators: 1, dropped: 1, problems: 1 });
    const lines = info.mock.calls.map(([l]) => JSON.parse(String(l))).filter((l) => l.event === 'tutor.handoff');
    expect(lines.map((l) => l.step)).toEqual(steps.map((e) => e.step));
    info.mockRestore();
  });

  it('defaults to no validators and no rules, and enqueues nothing without a queue or a session end', async () => {
    const calls: string[] = [];
    const r = await tutorTurn(mockTurn(calls), { conversationId: CHAT, day: DAY, endsSession: true });
    expect(r!.generated.kept).toHaveLength(3);
    expect(r!.enqueued).toEqual([]);
    const enqueue = vi.fn(async () => ({ jobId: 'j', created: true }));
    await tutorTurn(mockTurn([], { queue: { enqueue } }), { conversationId: CHAT, day: DAY, endsSession: false });
    await tutorTurn(mockTurn([], { queue: { enqueue } }), { conversationId: null, day: DAY, endsSession: true });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('a refused first step asks nothing more; a stopped answer skips the checks and the quiz; a failed enqueue never fails the turn', async () => {
    const calls: string[] = [];
    expect(await tutorTurn(mockTurn(calls, { prepare: async () => null }), { conversationId: CHAT, day: DAY, endsSession: true })).toBeNull();
    expect(calls).toEqual([]);

    const check = vi.fn(() => ({ keep: [], problems: [] }));
    const enqueue = vi.fn(async () => ({ jobId: 'j', created: true }));
    const stopped = await tutorTurn(mockTurn([], { answer: async () => ({ kept: [{ type: 'explanation' }], stopped: true, error: null }), validators: [{ id: 'v', check }], queue: { enqueue } }), { conversationId: CHAT, day: DAY, endsSession: true });
    expect(check).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(stopped!.generated.kept).toHaveLength(1);

    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failing = { enqueue: async () => Promise.reject(new Error('db down')) };
    const ok = await tutorTurn(mockTurn([], { queue: failing }), { conversationId: CHAT, day: DAY, endsSession: true });
    expect(ok).toMatchObject({ last: 'done', enqueued: [] });
    vi.restoreAllMocks();
  });

  it('the ring keeps the newest 50', () => {
    for (let i = 0; i < RING_SIZE + 5; i++) recordHandoff({ turn: `t${i}`, step: 'answer', agent: 'orchestrator', at: '', ms: i, facts: {} });
    const all = recentHandoffs();
    expect(all).toHaveLength(RING_SIZE);
    expect(all[0].turn).toBe(`t${RING_SIZE + 4}`);
  });
});

describe('the slow jobs on the one queue', () => {
  let db: TestDb;
  let queue: JobQueue;
  beforeEach(async () => {
    db = await createTestDb();
    queue = createPgJobQueue((fn) => db.platform(fn as never));
  });

  it('a quiz enqueued by a turn is a row the sweeper (/api/jobs/run) claims and runs; the same chat and day is one job', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const bound = { enqueue: (spec: Parameters<JobQueue['enqueue']>[1]) => db.platform((q) => queue.enqueue(q, spec)) };
    await tutorTurn(mockTurn([], { queue: bound }), { conversationId: CHAT, day: DAY, endsSession: true });
    await tutorTurn(mockTurn([], { queue: bound }), { conversationId: CHAT, day: DAY, endsSession: true });
    expect((await db.query(`select type, status, payload from jobs where type = $1`, [TUTOR_QUIZ_JOB])).rows).toEqual([{ type: TUTOR_QUIZ_JOB, status: 'pending', payload: { conversationId: CHAT, day: DAY } }]);

    await db.platform((q) => queue.enqueue(q, { type: TUTOR_PARENT_REPORT_JOB, payload: { childId: CHAT, week: DAY }, idempotencyKey: `report:${CHAT}` }));
    // W16-B1: the quiz job asks the family database whose conversation it is; this schema has none (and no such
    // conversation), so it ends with nothing made.
    const handlers = { ...productionHandlers(), [TUTOR_QUIZ_JOB]: quizJobHandler({ platform: (async () => ({ rows: [] })) as never }) };
    // A request's kick never starts the long parent report; the sweeper does.
    await runJobs({ handlers, queue, onlyKeys: [`report:${CHAT}`], limit: 1, budgetMs: 8_000 });
    expect((await db.query(`select status from jobs where type = $1`, [TUTOR_PARENT_REPORT_JOB])).rows[0].status).toBe('pending');
    const summary = await runJobs({ handlers, queue, longJobs: true });
    expect(summary).toMatchObject({ claimed: 2, succeeded: 2, dead: 0 });
    expect((await db.query(`select type, status from jobs where type like 'tutor.%' order by type`)).rows).toEqual([
      { type: TUTOR_PARENT_REPORT_JOB, status: 'succeeded' },
      { type: TUTOR_QUIZ_JOB, status: 'succeeded' },
    ]);
    vi.restoreAllMocks();
  });
});

describe('the migration', () => {
  let h: { pg: { query: (sql: string) => Promise<{ rows: unknown[] }> }; stop: () => Promise<void> };
  beforeAll(async () => {
    h = await startHarnessDb({ port: 0 });
  }, 120_000);
  afterAll(async () => h?.stop());

  it('the four new workloads have their Control rows, with no provider yet', async () => {
    const rows = (await h.pg.query(`select profile_id, provider_id, carries_child_words from control.ai_profiles where profile_id in ('family.quiz', 'family.parent_report', 'family.qc', 'family.voice_call') order by profile_id`)).rows;
    expect(rows).toEqual([
      { profile_id: 'family.parent_report', provider_id: null, carries_child_words: false },
      { profile_id: 'family.qc', provider_id: null, carries_child_words: true },
      { profile_id: 'family.quiz', provider_id: null, carries_child_words: true },
      { profile_id: 'family.voice_call', provider_id: null, carries_child_words: true },
    ]);
  });
});

describe('the development graph page', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is 404 in production and lists the handoffs in development', async () => {
    const { default: TutorGraph } = await import('@/app/(dev)/tutor-graph/page');
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => TutorGraph()).toThrow('NEXT_NOT_FOUND');
    vi.stubEnv('NODE_ENV', 'development');
    expect(TutorGraph()).toBeTruthy();
  });
});

function agentJob(id: AgentId): string | null {
  const a = AGENTS.find((x) => x.id === id);
  return a && a.mode === 'job' ? a.jobType : null;
}
