import { CALL_SPOKEN_MAX, callSpeech, splitSpeech } from './call';
import type { PublicBlock, ResolverEvent } from './resolver';
import { sealCallLine } from './voice-out';
import { cleanTranscript } from './voice';

// The sentences of a checked block, sealed for the speak route (W16-A4). The understand route runs this on each block it
// sends while answering a call: the block is already checked (the safety check ran before it was shown), the server cuts
// the speakable text into sentences, takes any Aadhaar-like number out, and seals each sentence for this account and
// child. The phone gets the words (for captions and for its own voice) and a seal (for the server voice); it can neither
// make a seal nor change the words the server voice reads. Server only.

export type SayBudget = { used: number };
export type SayEvent = Extract<ResolverEvent, { t: 'say' }>;

export function sayEvent(block: PublicBlock, ctx: { accountId: string; childId: string }, budget: SayBudget, now = Date.now()): SayEvent | null {
  const lines: SayEvent['lines'] = [];
  for (const text of callSpeech(block)) {
    for (const piece of splitSpeech(text)) {
      const clean = cleanTranscript(piece);
      if (!clean) continue;
      // The answer's spoken part has a limit; what is left stays on the board to read.
      if (budget.used + clean.length > CALL_SPOKEN_MAX) return lines.length > 0 ? { t: 'say', lines } : null;
      budget.used += clean.length;
      lines.push({ text: clean, token: sealCallLine(ctx, clean, now) });
    }
  }
  return lines.length > 0 ? { t: 'say', lines } : null;
}
