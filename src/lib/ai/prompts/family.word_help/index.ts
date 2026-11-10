import * as v1 from './v1';

// The family.word_help prompt versions in this repository (docs/family-app/08 §7). Control chooses the active version; a
// version the code does not have falls back to the latest.
export type { WordHelpAsk } from './v1';
export type WordHelpPrompt = { version: string; system: () => string; user: (a: v1.WordHelpAsk) => string };

const PROMPTS: readonly WordHelpPrompt[] = [{ version: v1.WORD_HELP_PROMPT_VERSION, system: v1.wordHelpSystem, user: v1.wordHelpUser }];

export function wordHelpPrompt(chosen: string | null): WordHelpPrompt {
  return PROMPTS.find((p) => p.version === chosen) ?? PROMPTS[PROMPTS.length - 1];
}
