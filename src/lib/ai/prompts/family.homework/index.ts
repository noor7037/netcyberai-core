import * as v1 from './v1';

// The family.homework prompt versions in this repository (docs/family-app/08 §7). Control chooses the active version;
// a version the code does not have falls back to the latest.
export type { HomeworkAsk } from './v1';
export type HomeworkPrompt = { version: string; system: (a: v1.HomeworkAsk) => string; user: () => string };

const PROMPTS: readonly HomeworkPrompt[] = [{ version: v1.HOMEWORK_PROMPT_VERSION, system: v1.homeworkSystem, user: v1.homeworkUser }];

export function homeworkPrompt(chosen: string | null): HomeworkPrompt {
  return PROMPTS.find((p) => p.version === chosen) ?? PROMPTS[PROMPTS.length - 1];
}
