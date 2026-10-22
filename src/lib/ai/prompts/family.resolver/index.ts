import * as v1 from './v1';
import * as v2 from './v2';
import * as v3 from './v3';

// The family.resolver prompt versions in this repository (docs/family-app/08 §7). Control chooses the active version
// (control.ai_profiles.prompt_version); a version the code does not have falls back to the latest. A typed question
// needs a version that names the subject (v2 and later), whatever Control chose: the server never takes the subject
// from the screen. The library is keyed by the version actually used, so a response is never served under another
// version's name.

export type { ResolverAsk, ResolverSubject } from './v3';

export type ResolverPrompt = {
  version: string;
  // Whether a typed question's subject is named by the model, on its first line.
  namesSubject: boolean;
  system: (a: v3.ResolverAsk) => string;
  user: (a: v3.ResolverAsk) => string;
};

// v1 takes the subject as given; it is never chosen for a question whose subject is still to be named.
const withSubject = (a: v3.ResolverAsk): v1.ResolverAsk => {
  if (!a.subject) throw new Error('family.resolver v1 needs the subject');
  return { ...a, subject: a.subject as v1.ResolverAsk['subject'] };
};
// v2 named only Mathematics and Science; a v3 request reaches it only when Control chose v2 for a topic or chapter.
const asV2 = (a: v3.ResolverAsk): v2.ResolverAsk => ({ ...a, subject: a.subject as v2.ResolverAsk['subject'], openSubjects: a.openSubjects as v2.ResolverAsk['openSubjects'] });

const PROMPTS: readonly ResolverPrompt[] = [
  { version: v1.RESOLVER_PROMPT_VERSION, namesSubject: false, system: (a) => v1.resolverSystem(withSubject(a)), user: (a) => v1.resolverUser(withSubject(a)) },
  { version: v2.RESOLVER_PROMPT_VERSION, namesSubject: true, system: (a) => v2.resolverSystem(asV2(a)), user: (a) => v2.resolverUser(asV2(a)) },
  { version: v3.RESOLVER_PROMPT_VERSION, namesSubject: true, system: v3.resolverSystem, user: v3.resolverUser },
];

export const LATEST_RESOLVER_PROMPT = v3.RESOLVER_PROMPT_VERSION;

export function resolverPrompt(chosen: string | null, needsSubjectNamed: boolean): ResolverPrompt {
  const latest = PROMPTS[PROMPTS.length - 1];
  const picked = PROMPTS.find((p) => p.version === chosen) ?? latest;
  return needsSubjectNamed && !picked.namesSubject ? latest : picked;
}
