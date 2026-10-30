import * as v1 from './v1';

// The family.plan prompt versions in this repository (docs/family-app/08 §7; W9-B, docs/39 §3). Control chooses the
// active version (control.ai_profiles.prompt_version); a version the code does not have falls back to the latest.
export type { PlanAsk } from './v1';
export type PlanPrompt = { version: string; system: (a: v1.PlanAsk) => string; user: (a: v1.PlanAsk) => string };

export const PLAN_PROMPTS: readonly PlanPrompt[] = [{ version: v1.PLAN_PROMPT_VERSION, system: v1.planSystem, user: v1.planUser }];

export function planPrompt(chosen: string | null): PlanPrompt {
  return PLAN_PROMPTS.find((p) => p.version === chosen) ?? PLAN_PROMPTS[PLAN_PROMPTS.length - 1];
}
