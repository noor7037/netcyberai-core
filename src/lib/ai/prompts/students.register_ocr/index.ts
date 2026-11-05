import * as v1 from './v1';

// The students.register_ocr prompt versions in this repository (docs/family-app/08 §7). Control chooses the active
// version; a version the code does not have falls back to the latest.
export type { RegisterOcrAsk, RegisterOcrField } from './v1';
export { REGISTER_OCR_FIELDS } from './v1';
export type RegisterOcrPrompt = { version: string; system: (a: v1.RegisterOcrAsk) => string; user: (a: v1.RegisterOcrAsk) => string };

const PROMPTS: readonly RegisterOcrPrompt[] = [{ version: v1.REGISTER_OCR_PROMPT_VERSION, system: v1.registerOcrSystem, user: v1.registerOcrUser }];

export function registerOcrPrompt(chosen: string | null): RegisterOcrPrompt {
  return PROMPTS.find((p) => p.version === chosen) ?? PROMPTS[PROMPTS.length - 1];
}
