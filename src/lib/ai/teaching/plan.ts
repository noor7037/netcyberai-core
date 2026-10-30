// The teaching planner (W9-B, docs/39 §2 "Teaching engine", §3 "Plan"): ONE short call on the family.plan workload
// before the answer, which says how to teach this question (its type, the depth, the blocks and the visuals). The
// answer's prompt (family.resolver v8) is written from the plan.
//
// Two steps, like every gateway call (F1-3: no database connection held while a model answers): preparePlan() in the
// caller's transaction (the profile's checks; no daily place of its own, it runs beside the answer's call), then
// planAnswer() with no connection, then the call's metering is written with the answer's in the caller's next
// transaction. The planner never blocks an answer: no route, a refused or failed call, or a plan that fails a check
// (src/lib/ai/teaching/plan-shape.ts) all give the class band's default plan.

import { activePromptVersion, prepareText, type AiContext, type PreparedText, type SentText } from '@/lib/ai/platform';
import { planPrompt } from '@/lib/ai/prompts/family.plan';
import { log } from '@/lib/observability/log';
import { bandOf, checkPlan, defaultPlan, type Plan, type PlanContext } from './plan-shape';

type Db = Parameters<typeof prepareText>[0];

export type PlanAskContext = PlanContext & { board: string; chapter: string | null; passageTitles: string[] };

// W10: 600, with the compact answer (family.plan v1's short keys): at 300 a model's plan arrived cut (297 of 300).
export const PLAN_MAX_TOKENS = 600;

// In the caller's transaction: the planning call ready to send, or null when the workload cannot run now (no route,
// switched off, a provider not cleared for children's words): the default plan is used then.
export async function preparePlan(db: Db, ai: AiContext, ctx: PlanAskContext, question: string): Promise<PreparedText | null> {
  const prompt = planPrompt(await activePromptVersion(db, 'family.plan'));
  const ask = { board: ctx.board, classLevel: ctx.classLevel, band: bandOf(ctx.classLevel), subject: ctx.subject, chapter: ctx.chapter, question, passageTitles: ctx.passageTitles };
  const prepared = await prepareText(db, ai, 'family.plan', { system: prompt.system(ask), messages: [{ role: 'user', content: prompt.user(ask) }], maxTokens: PLAN_MAX_TOKENS, responseFormat: 'json' });
  return prepared.ok ? prepared.text : null;
}

export type Planned = { plan: Plan; fromModel: boolean; sent: SentText | null };

// The plan, from the one call prepared above (no database connection held). Never throws.
export async function planAnswer(ctx: PlanContext, call: PreparedText | null): Promise<Planned> {
  if (!call) return { plan: defaultPlan(ctx), fromModel: false, sent: null };
  let sent: SentText | null = null;
  try {
    sent = await call.send();
  } catch {
    // The platform's send never throws by design; if it did, the answer still comes, on the default plan.
  }
  if (!sent?.result.ok) return { plan: defaultPlan(ctx), fromModel: false, sent };
  return { ...checkPlan(sent.result.text, ctx), sent };
}

// One structured log line per planned answer (no ledger field holds it): the question's type, the band, the depth,
// whether the model's plan was kept and whether a chapter passage was found. Never the question or the answer.
export function logPlan(p: Planned, passagesFound: boolean): void {
  log('info', 'family.plan', { questionType: p.plan.questionType, band: p.plan.band, depth: p.plan.depth, fromModel: p.fromModel, passages: passagesFound });
}
