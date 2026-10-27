import * as v2 from './v2';

// The exams.read_pages prompt versions in this repository (docs/family-app/08 §7). Control chooses the active version;
// a version the code does not have falls back to the latest. v1 is gone (C230-AG): it did not ask whether a page is
// an answer page or an identity document, so a page could be read as a child's first page from a card's name. A
// Control row still naming v1 gets v2.
export type { ReadPagesAsk } from './v2';
export type ReadPagesPrompt = { version: string; system: (a: v2.ReadPagesAsk) => string; user: (a: v2.ReadPagesAsk) => string };

const PROMPTS: readonly ReadPagesPrompt[] = [{ version: v2.READ_PAGES_PROMPT_VERSION, system: v2.readPagesSystem, user: v2.readPagesUser }];

export function readPagesPrompt(chosen: string | null): ReadPagesPrompt {
  return PROMPTS.find((p) => p.version === chosen) ?? PROMPTS[PROMPTS.length - 1];
}
