import * as v1 from './v1';

// The family.quiz prompt versions in this repository (docs/family-app/08 §7). Control chooses the active version; a
// version the code does not have falls back to the latest.
export type { QuizAsk } from './v1';
export { QUIZ_ITEMS } from './v1';
export type QuizPrompt = { version: string; system: () => string; user: (a: v1.QuizAsk) => string };

const PROMPTS: readonly QuizPrompt[] = [{ version: v1.QUIZ_PROMPT_VERSION, system: v1.quizSystem, user: v1.quizUser }];

export function quizPrompt(chosen: string | null): QuizPrompt {
  return PROMPTS.find((p) => p.version === chosen) ?? PROMPTS[PROMPTS.length - 1];
}
