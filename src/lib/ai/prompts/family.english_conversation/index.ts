import * as v1 from './v1';

// The family.english_conversation prompt versions in this repository (docs/family-app/08 §7). Control chooses the
// active version; a version the code does not have falls back to the latest.
export type { EnglishConversationAsk, EnglishTrack } from './v1';
export type EnglishConversationPrompt = { version: string; reply: (a: v1.EnglishConversationAsk) => string; summary: () => string; recap: () => string };

const PROMPTS: readonly EnglishConversationPrompt[] = [
  { version: v1.ENGLISH_CONVERSATION_PROMPT_VERSION, reply: v1.englishReplySystem, summary: v1.englishSummarySystem, recap: v1.englishRecapSystem },
];

export function englishConversationPrompt(chosen: string | null): EnglishConversationPrompt {
  return PROMPTS.find((p) => p.version === chosen) ?? PROMPTS[PROMPTS.length - 1];
}
