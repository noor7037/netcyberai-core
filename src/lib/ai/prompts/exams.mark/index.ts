import * as v1 from './v1';

// The exams.mark prompt versions in this repository (docs/family-app/08 §7). Control chooses the active version; a
// version the code does not have falls back to the latest.
export type { MarkAsk, MarkQuestion } from './v1';
export type MarkPrompt = { version: string; system: (a: v1.MarkAsk) => string; user: (a: v1.MarkAsk) => string };

const PROMPTS: readonly MarkPrompt[] = [{ version: v1.MARK_PROMPT_VERSION, system: v1.markSystem, user: v1.markUser }];

export function markPrompt(chosen: string | null): MarkPrompt {
  return PROMPTS.find((p) => p.version === chosen) ?? PROMPTS[PROMPTS.length - 1];
}
