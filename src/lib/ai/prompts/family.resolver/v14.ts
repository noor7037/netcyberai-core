// Prompt v14 of the family.resolver profile (C503): v13, word for word, with the three lines that made the tutor refuse
// a learning question changed. The founder's report: "it denies, this is not related to your subject, even though it is".
//   1. The subject was decided from the question alone; the tab the child typed in was never told. v14 names the tab and
//      takes it when the question is short or could sit in more than one subject.
//   2. Any subject outside the class list was "other" and got no answer. v14 asks for the nearest subject on the list
//      (a Class 2 "why do plants need water" is taught, not refused); "other" is left for a question no subject is near.
//   3. "Not about school study" refused curiosity. v14 teaches anything a student can learn from and refuses only what is
//      not a learning question at all. The safety check on the question and on every block is unchanged.
// v13 is untouched; Control chooses v14 by name.

import { resolverSystem as v13System, resolverUser as v13User, type ResolverAsk } from './v13';

export const RESOLVER_PROMPT_VERSION = 'v14';
export type { ResolverAsk };

const ALONE = 'decided from the question alone';
const ONLY_LINE = ' If the subject is not one of these, write only the subject line and nothing else.';
const NOT_STUDY = 'If it is not about school study, output only {"type":"refuse"}.';

export const NEAREST_LINE =
  ' A question about a subject that is not on the list, or a general-knowledge or curiosity question (why, how, what is), still gets the NEAREST subject on the list and a full answer, the way a class teacher answers a curious student. Write "other" only when no subject on the list is near, and then write only the subject line and nothing else.';
export const LEARNING_LINE =
  'Teach anything a student can learn from. Output only {"type":"refuse"} when it is not a learning question at all (gossip, personal chat, a request to do something that is not learning).';

export function tabWords(a: Pick<ResolverAsk, 'tab' | 'classSubjects'>): string {
  const tab = a.tab && a.classSubjects.includes(a.tab as never) ? a.tab : null;
  return tab
    ? `decided from the question, and when the question is short or could belong to more than one subject, the subject the student has open (${tab})`
    : 'decided from the question';
}

export function resolverSystem(a: ResolverAsk): string {
  return v13System(a).replace(ALONE, tabWords(a)).replace(ONLY_LINE, NEAREST_LINE);
}

export function resolverUser(a: ResolverAsk): string {
  return v13User(a).replace(NOT_STUDY, LEARNING_LINE);
}
