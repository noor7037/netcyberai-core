import * as v1 from './v1';

// The marking-steps suggestion's prompt versions (W14-C). It rides the exams.mark profile, whose prompt version names
// the marking prompt, so the latest here is used; a later version is added beside v1, never written over it.
export type { StepsAsk } from './v1';
export type StepsPrompt = { version: string; system: (a: v1.StepsAsk) => string; user: (a: v1.StepsAsk) => string };

const PROMPTS: readonly StepsPrompt[] = [{ version: v1.STEPS_PROMPT_VERSION, system: v1.stepsSystem, user: v1.stepsUser }];

export function stepsPrompt(chosen: string | null = null): StepsPrompt {
  return PROMPTS.find((p) => p.version === chosen) ?? PROMPTS[PROMPTS.length - 1];
}
