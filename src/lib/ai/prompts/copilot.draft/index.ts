import type { DraftRequest } from '../../provider';
import * as v1 from './v1';

// The copilot.draft and parent_ai.home_help prompt versions in this repository (docs/family-app/08 §7). Control chooses
// the active version; a version the code does not have falls back to the latest.
export type DraftPrompt = { version: string; system: (r: DraftRequest) => string; user: (r: DraftRequest) => string };
const PROMPTS: readonly DraftPrompt[] = [{ version: v1.DRAFT_PROMPT_VERSION, system: v1.draftSystem, user: v1.draftUser }];

export function draftPrompt(chosen: string | null): DraftPrompt {
  return PROMPTS.find((p) => p.version === chosen) ?? PROMPTS[PROMPTS.length - 1];
}
