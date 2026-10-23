import * as v1 from './v1';

// The family.syllabus_extract prompt versions in this repository (docs/family-app/08 §7). Control chooses the active
// version; a version the code does not have falls back to the latest.
export type { FamilySyllabusAsk } from './v1';
export type FamilySyllabusPrompt = { version: string; system: (a: v1.FamilySyllabusAsk) => string; user: (a: v1.FamilySyllabusAsk) => string };

const PROMPTS: readonly FamilySyllabusPrompt[] = [{ version: v1.FAMILY_SYLLABUS_PROMPT_VERSION, system: v1.familySyllabusSystem, user: v1.familySyllabusUser }];

export function familySyllabusPrompt(chosen: string | null): FamilySyllabusPrompt {
  return PROMPTS.find((p) => p.version === chosen) ?? PROMPTS[PROMPTS.length - 1];
}
