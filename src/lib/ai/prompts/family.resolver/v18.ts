// Prompt v18 of the family.resolver profile (founder, 15 Nov 2026): v17, word for word, with ONE change. When a question
// is not a learning question at all, the tutor no longer outputs a bare {"type":"refuse"} (which showed the child one
// cold line and nothing to do next). It outputs a redirect: the same "refuse" block, now carrying the school topic nearest
// to what the child asked about and two short questions the child can tap to learn it. The app (src/lib/family/redirect.ts,
// resolver.ts, UnderstandView) shows one friendly line with that topic and the two questions as buttons.
//
// The change is made on v17's finished user prompt by replacing one exact line, and the replacement THROWS if the line is
// not found, so a later edit of an older version can never leave v18 silently unchanged (test/family/future-tutor-v18.test.ts
// builds the final prompt for every class and reads it). v17 is untouched; Control chooses v18 by name.

import { LEARNING_LINE } from './v14';
import { resolverSystem as v17System, resolverUser as v17User, type ResolverAsk } from './v17';

export const RESOLVER_PROMPT_VERSION = 'v18';
export type { ResolverAsk };

export const REDIRECT_LINE =
  'Teach anything a student can learn from. When it is not a learning question at all (gossip, personal chat, a request to do something that is not learning), do not just refuse: output only {"type":"refuse","nearest":"<the school topic closest to what the student asked about, at most 8 words>","examples":["<a short question about that topic the student can tap>","<a second short question about that topic>"]}. ' +
  'Pick the nearest topic from this student\'s own class and subjects. Each example is one question of at most 14 words, in the language the student wrote in, that you could answer in a lesson. Be kind: no scolding, no mention of rules, no personal details.';

export const resolverSystem = v17System;

export function resolverUser(a: ResolverAsk): string {
  const built = v17User(a);
  if (!built.includes(LEARNING_LINE)) {
    // Questions only: a lesson or chapter ask has no such line and needs no redirect.
    if (a.question) throw new Error('prompt v18: the refuse line it replaces was not found in v17');
    return built;
  }
  return built.replace(LEARNING_LINE, REDIRECT_LINE);
}
