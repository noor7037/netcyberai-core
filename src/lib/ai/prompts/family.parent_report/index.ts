import * as v1 from './v1';

// The family.parent_report prompt versions in this repository (docs/family-app/08 §7). Control chooses the active
// version; a version the code does not have falls back to the latest.
export type { ParentReportAsk } from './v1';
export type ParentReportPrompt = { version: string; system: (lang: 'en' | 'hi') => string; user: (a: v1.ParentReportAsk) => string };

const PROMPTS: readonly ParentReportPrompt[] = [{ version: v1.PARENT_REPORT_PROMPT_VERSION, system: v1.parentReportSystem, user: v1.parentReportUser }];

export function parentReportPrompt(chosen: string | null): ParentReportPrompt {
  return PROMPTS.find((p) => p.version === chosen) ?? PROMPTS[PROMPTS.length - 1];
}
