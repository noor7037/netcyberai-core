import * as v1 from './v1';

// The exams.write_questions prompt versions in this repository (docs/family-app/08 §7). Control chooses the active
// version; a version the code does not have falls back to the latest.
export type { WriteAsk, WriteSlot } from './v1';
export type WritePrompt = { version: string; system: (a: v1.WriteAsk) => string; user: (a: v1.WriteAsk) => string };

const PROMPTS: readonly WritePrompt[] = [{ version: v1.WRITE_PROMPT_VERSION, system: v1.writeSystem, user: v1.writeUser }];

export function writeQuestionsPrompt(chosen: string | null): WritePrompt {
  return PROMPTS.find((p) => p.version === chosen) ?? PROMPTS[PROMPTS.length - 1];
}
