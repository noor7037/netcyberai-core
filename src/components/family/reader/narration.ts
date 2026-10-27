import type { NarrationLine } from '@/lib/family/blocks';

// Pure helpers of the chapter reader's narration (S1, C374), kept apart from the component so they are tested alone.

export const SPEEDS = [0.75, 1, 1.25, 1.5] as const;
export type Speed = (typeof SPEEDS)[number];
// The phone's speech rate for a speed: 1× is the slightly slower pace the app already uses for children (speech.ts).
export const rateOf = (speed: Speed) => Math.round(0.9 * speed * 100) / 100;

// The word a speech engine's boundary event points at: from its character index to the next space. null when the
// index is outside the text or on a space. Only a real boundary event calls this; a word is never guessed from time.
export function wordAt(text: string, charIndex: number): { start: number; end: number } | null {
  if (!Number.isInteger(charIndex) || charIndex < 0 || charIndex >= text.length || /\s/.test(text[charIndex])) return null;
  const rest = text.slice(charIndex).search(/\s/);
  return { start: charIndex, end: rest < 0 ? text.length : charIndex + rest };
}

// Which repeat of the same sentence in the same block this line is (0 for the first), so the highlight finds the
// right one when a block says the same sentence twice.
export function occurrence(script: readonly NarrationLine[], index: number): number {
  const line = script[index];
  if (!line) return 0;
  let n = 0;
  for (let i = 0; i < index; i++) if (script[i].blockId === line.blockId && script[i].text === line.text) n++;
  return n;
}

// Reading progress, as a whole percent of the narration's sentences reached (the line being read counts).
export const progressPercent = (index: number, total: number) => (total <= 0 ? 0 : Math.min(100, Math.round(((index + 1) / total) * 100)));
