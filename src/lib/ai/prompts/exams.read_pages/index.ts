import * as v1 from './v1';

// The exams.read_pages prompt versions in this repository (docs/family-app/08 §7). Control chooses the active version;
// a version the code does not have falls back to the latest.
export type { ReadPagesAsk } from './v1';
export type ReadPagesPrompt = { version: string; system: (a: v1.ReadPagesAsk) => string; user: (a: v1.ReadPagesAsk) => string };

const PROMPTS: readonly ReadPagesPrompt[] = [{ version: v1.READ_PAGES_PROMPT_VERSION, system: v1.readPagesSystem, user: v1.readPagesUser }];

export function readPagesPrompt(chosen: string | null): ReadPagesPrompt {
  return PROMPTS.find((p) => p.version === chosen) ?? PROMPTS[PROMPTS.length - 1];
}
