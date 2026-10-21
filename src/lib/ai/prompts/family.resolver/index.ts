import * as v1 from './v1';
import * as v2 from './v2';

// The family.resolver prompt versions in this repository (docs/family-app/08 §7). Control chooses the active version
// (control.ai_profiles.prompt_version); a version the code does not have falls back to the latest. A typed question
// needs a version that names the subject (v2 and later), whatever Control chose: the server never takes the subject
// from the screen. The library is keyed by the version actually used, so a response is never served under another
// version's name.

export type { ResolverAsk, ResolverSubject } from './v2';

export type ResolverPrompt = {
  version: string;
  // Whether a typed question's subject is named by the model, on its first line.
  namesSubject: boolean;
  system: (a: v2.ResolverAsk) => string;
  user: (a: v2.ResolverAsk) => string;
};

// v1 takes the subject as given; it is never chosen for a question whose subject is still to be named.
const withSubject = (a: v2.ResolverAsk): v1.ResolverAsk => {
  if (!a.subject) throw new Error('family.resolver v1 needs the subject');
  return { ...a, subject: a.subject };
};

const PROMPTS: readonly ResolverPrompt[] = [
  { version: v1.RESOLVER_PROMPT_VERSION, namesSubject: false, system: (a) => v1.resolverSystem(withSubject(a)), user: (a) => v1.resolverUser(withSubject(a)) },
  { version: v2.RESOLVER_PROMPT_VERSION, namesSubject: true, system: v2.resolverSystem, user: v2.resolverUser },
];

export const LATEST_RESOLVER_PROMPT = v2.RESOLVER_PROMPT_VERSION;

export function resolverPrompt(chosen: string | null, needsSubjectNamed: boolean): ResolverPrompt {
  const latest = PROMPTS[PROMPTS.length - 1];
  const picked = PROMPTS.find((p) => p.version === chosen) ?? latest;
  return needsSubjectNamed && !picked.namesSubject ? latest : picked;
}
