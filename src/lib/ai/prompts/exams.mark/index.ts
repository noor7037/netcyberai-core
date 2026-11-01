import * as v1 from './v1';
import * as v2 from './v2';

// The exams.mark prompt versions in this repository (docs/family-app/08 §7). Control chooses the active version; a
// version the code does not have falls back to the latest (v2 since W14-C: full marks for a correct answer when no
// steps are given, the same marks for the same answer, an unreadable answer said to be unreadable, the words read
// restated in the reason, and steps that add up to the marks). Both take the same request and give the same JSON.
export type { MarkAsk, MarkQuestion } from './v1';
export type MarkPrompt = { version: string; system: (a: v1.MarkAsk) => string; user: (a: v1.MarkAsk) => string };

const PROMPTS: readonly MarkPrompt[] = [
  { version: v1.MARK_PROMPT_VERSION, system: v1.markSystem, user: v1.markUser },
  { version: v2.MARK_PROMPT_VERSION, system: v2.markSystem, user: v2.markUser },
];

export function markPrompt(chosen: string | null): MarkPrompt {
  return PROMPTS.find((p) => p.version === chosen) ?? PROMPTS[PROMPTS.length - 1];
}
