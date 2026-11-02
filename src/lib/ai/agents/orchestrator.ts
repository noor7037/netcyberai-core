import { randomUUID } from 'crypto';
import { log } from '@/lib/observability/log';
import type { EnqueueResult, JobSpec } from '@/lib/jobs/types';
import { recordHandoff } from './events';
import { TUTOR_QUIZ_JOB } from './jobs';
import { TURN_STEPS, type TurnStep } from './registry';

// The orchestrator (W16-A1, the proposal's M3): the live tutor turn as the registry's handoffs (./registry.ts
// TURN_STEPS), with thin calls into the code that already does each step (decision 1: no agent framework).
//
//   retrieve + plan  deps.prepare(): the first short transaction. Today the resolver (src/lib/family/resolver.ts
//                    prepareResolve) reads the chapter's passages, then prepares the planning call with their titles,
//                    and takes the gateway's checks and the family's daily place.
//   answer           deps.answer(): the streamed answer with no database connection held (the resolver's generate;
//                    the planning call is sent just before it, so its time is counted here).
//   visual check     `validators`, run in order on the kept blocks of a turn that finished: each returns the blocks
//                    to keep and its problem codes (W16-A2's board validator). Default none.
//   quality check    `quality`, rules that read the kept blocks and return problem codes (W16-A5). Default none.
//   keep             deps.keep(): the second short transaction (metering, the library line).
//   enqueue          the slow work after the turn: a quiz when the turn ends a session, on the one job queue,
//                    idempotent on the conversation and the day. A turn never fails for its enqueue.
//
// This file knows no family code (scripts/check_family_boundary.py): the caller hands in the steps. Every handoff writes
// one structured log line (event 'tutor.handoff') and one entry in the development ring (./events.ts), with the step,
// its agent, its time and counts. Never the child's words, a name or a person's id: the turn has its own random id.

export type Answered<B> = { kept: B[]; stopped: boolean; error: unknown };
export type ValidatorResult<B> = { keep: B[]; problems: string[] };
export type Validator<B> = { id: string; check: (blocks: readonly B[]) => ValidatorResult<B> };
export type QualityRule<B> = { id: string; check: (turn: { blocks: readonly B[]; passages: number }) => string[] };

export type TurnDeps<P, G extends Answered<B>, L, B> = {
  prepare: () => Promise<P | null>;
  // What the first transaction found, as counts: the passages read and whether the planner will be asked.
  prepared: (p: P) => { passages: number; planAsked: boolean };
  answer: (p: P) => Promise<G>;
  keep: (p: P, g: G) => Promise<L>;
  validators?: readonly Validator<B>[];
  quality?: readonly QualityRule<B>[];
  // Bound by the caller to the session that may enqueue (the platform's); absent, nothing is enqueued.
  queue?: { enqueue: (spec: JobSpec) => Promise<EnqueueResult> };
  now?: () => number;
};

// `conversationId`: the tutor chat the turn belongs to (null outside a chat). `endsSession`: this turn closes the
// session (the caller decides), so its quiz is made.
export type TurnInput = { conversationId: string | null; day: string; endsSession: boolean };
export type TurnResult<P, G, L> = { pending: P; generated: G; last: L; problems: string[]; enqueued: string[] };

const AGENT_OF = new Map(TURN_STEPS.map((s) => [s.step, s.agent]));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function quizJob(conversationId: string, day: string): JobSpec {
  return { type: TUTOR_QUIZ_JOB, payload: { conversationId, day }, idempotencyKey: `${TUTOR_QUIZ_JOB}:${conversationId}:${day}`, maxAttempts: 3 };
}

// null: the first transaction answered the turn itself (a refusal, or the library's response), and nothing was asked.
export async function tutorTurn<P, G extends Answered<B>, L, B>(deps: TurnDeps<P, G, L, B>, input: TurnInput): Promise<TurnResult<P, G, L> | null> {
  const now = deps.now ?? Date.now;
  const turn = randomUUID();
  const handoff = (step: TurnStep, ms: number, facts: Record<string, number | boolean | string>) => {
    const agent = AGENT_OF.get(step)!;
    log('info', 'tutor.handoff', { turn, step, agent, ms, ...facts });
    recordHandoff({ turn, step, agent, at: new Date().toISOString(), ms, facts });
  };

  let t = now();
  const pending = await deps.prepare();
  if (pending === null) return null;
  const found = deps.prepared(pending);
  // 'found', not 'passages': the log's redaction hides any key that begins with "pass".
  handoff('retrieve', now() - t, { found: found.passages });
  handoff('plan', 0, { asked: found.planAsked });

  t = now();
  const generated = await deps.answer(pending);
  const finished = !generated.stopped && generated.error === null;
  handoff('answer', now() - t, { blocks: generated.kept.length, stopped: generated.stopped, failed: generated.error !== null });

  const problems: string[] = [];
  t = now();
  const before = generated.kept.length;
  if (finished) {
    for (const v of deps.validators ?? []) {
      try {
        const r = v.check(generated.kept);
        generated.kept = r.keep;
        problems.push(...r.problems.map((p) => `${v.id}:${p}`));
      } catch {
        problems.push(`${v.id}:error`);
      }
    }
  }
  handoff('visual_check', now() - t, { validators: deps.validators?.length ?? 0, dropped: before - generated.kept.length, problems: problems.length, skipped: !finished });

  t = now();
  const seen = problems.length;
  if (finished) {
    for (const rule of deps.quality ?? []) {
      try {
        problems.push(...rule.check({ blocks: generated.kept, passages: found.passages }).map((p) => `${rule.id}:${p}`));
      } catch {
        problems.push(`${rule.id}:error`);
      }
    }
  }
  handoff('quality_check', now() - t, { rules: deps.quality?.length ?? 0, problems: problems.length - seen, skipped: !finished });

  const last = await deps.keep(pending, generated);

  t = now();
  const enqueued: string[] = [];
  if (deps.queue && finished && input.endsSession && input.conversationId && UUID.test(input.conversationId) && DAY.test(input.day)) {
    const spec = quizJob(input.conversationId, input.day);
    try {
      await deps.queue.enqueue(spec);
      enqueued.push(spec.type);
    } catch (err) {
      log('warn', 'tutor.enqueue_failed', { turn, type: spec.type, error: err instanceof Error ? err.name : 'error' });
    }
  }
  handoff('enqueue', now() - t, { jobs: enqueued.length, endsSession: input.endsSession });

  return { pending, generated, last, problems, enqueued };
}
