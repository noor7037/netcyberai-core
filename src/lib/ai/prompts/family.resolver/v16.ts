// Prompt v16 of the family.resolver profile (C516): v15, word for word, with one change for the wait (13 Nov). The
// Control usage log showed the answer call itself is the slow part (about 8.5 s on the paid model), and a child sees
// nothing until the first whole block has been written, which for Classes 3 and up was a long explanation. v16 asks for
// a short block FIRST: the direct answer in two plain sentences, as a key_points block (which takes 2 to 8 points), so the first words show
// within a second or two of the answer starting; the explanation and the rest follow as before. The youngest children
// (LKG to Class 2) keep v15's board first. v15 is untouched; Control chooses v16 by name.

import { isYoungVisual } from '@/lib/ai/teaching/plan-shape';
import { resolverSystem as v15System, resolverUser as v15User, type ResolverAsk } from './v15';

export const RESOLVER_PROMPT_VERSION = 'v16';
export type { ResolverAsk };

export const QUICK_ANSWER_LINE =
  'QUICK ANSWER FIRST: before every other block, write {"type":"key_points","points":["the direct answer to the question in one short, plain sentence","one more short sentence that makes it clear"]} on its own line, so the student reads the answer at once while the rest is written. It answers the question itself (not "Let us learn about..."), with no greeting and no heading. Then write the other blocks in their usual order; do not write a second key_points block.';

export function resolverSystem(a: ResolverAsk): string {
  const base = v15System(a);
  if (isYoungVisual(a.classLevel, true)) return base;
  const at = base.indexOf('\nRules: ');
  return at < 0 ? `${base}\n${QUICK_ANSWER_LINE}` : `${base.slice(0, at)}\n${QUICK_ANSWER_LINE}${base.slice(at)}`;
}

export const resolverUser = v15User;
