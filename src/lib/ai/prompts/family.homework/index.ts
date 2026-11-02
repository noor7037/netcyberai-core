import * as v1 from './v1';
import * as v2 from './v2';

// The family.homework prompt versions in this repository (docs/family-app/08 §7). Control chooses the active version;
// a version the code does not have falls back to the latest.
// W16-B2: v2 is v1 for the hint ladder and adds "Check my work" (a photo of the child's own working read line by line
// and marked step by step). The check functions are v2's whatever version Control chose: v1 has no such mode. v1 stays
// registered and unchanged.
export type { HomeworkAsk, CheckAsk } from './v2';
export type HomeworkPrompt = { version: string; system: (a: v2.HomeworkAsk) => string; user: () => string };
export { checkMarkSystem, checkMarkUser, checkReadSystem, checkReadUser, questionOfReading, CHECK_UNREADABLE } from './v2';

export const HOMEWORK_PROMPTS: readonly HomeworkPrompt[] = [
  { version: v1.HOMEWORK_PROMPT_VERSION, system: v1.homeworkSystem, user: v1.homeworkUser },
  { version: v2.HOMEWORK_PROMPT_VERSION, system: v2.homeworkSystem, user: v2.homeworkUser },
];
export const LATEST_HOMEWORK_PROMPT = HOMEWORK_PROMPTS[HOMEWORK_PROMPTS.length - 1].version;

export function homeworkPrompt(chosen: string | null): HomeworkPrompt {
  return HOMEWORK_PROMPTS.find((p) => p.version === chosen) ?? HOMEWORK_PROMPTS[HOMEWORK_PROMPTS.length - 1];
}
