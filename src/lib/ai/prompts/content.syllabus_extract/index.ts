import * as v1 from './v1';

// The content.syllabus_extract prompt versions in this repository (docs/family-app/08 §7). Control chooses the active
// version; a version the code does not have falls back to the latest.
export type { SyllabusExtractAsk } from './v1';
export type SyllabusExtractPrompt = { version: string; system: (a: v1.SyllabusExtractAsk) => string; user: (a: v1.SyllabusExtractAsk) => string };

const PROMPTS: readonly SyllabusExtractPrompt[] = [{ version: v1.SYLLABUS_EXTRACT_PROMPT_VERSION, system: v1.syllabusExtractSystem, user: v1.syllabusExtractUser }];

export function syllabusExtractPrompt(chosen: string | null): SyllabusExtractPrompt {
  return PROMPTS.find((p) => p.version === chosen) ?? PROMPTS[PROMPTS.length - 1];
}
