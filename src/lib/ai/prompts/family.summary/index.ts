import * as v1 from './v1';

// The family.summary prompt versions in this repository (docs/family-app/08 §7). Control chooses the active version; a
// version the code does not have falls back to the latest.
export type { SummaryAsk } from './v1';
export { SUMMARY_MAX } from './v1';
export type SummaryPrompt = { version: string; system: () => string; user: (a: v1.SummaryAsk) => string };

const PROMPTS: readonly SummaryPrompt[] = [{ version: v1.SUMMARY_PROMPT_VERSION, system: v1.summarySystem, user: v1.summaryUser }];

export function summaryPrompt(chosen: string | null): SummaryPrompt {
  return PROMPTS.find((p) => p.version === chosen) ?? PROMPTS[PROMPTS.length - 1];
}
