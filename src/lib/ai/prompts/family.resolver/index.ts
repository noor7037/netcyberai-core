import * as v1 from './v1';
import * as v2 from './v2';
import * as v3 from './v3';
import * as v4 from './v4';

// The family.resolver prompt versions in this repository (docs/family-app/08 §7). Control chooses the active version
// (control.ai_profiles.prompt_version); a version the code does not have falls back to the default (v3). A typed
// question needs a version that names the subject (v2 and later), whatever Control chose: the server never takes the
// subject from the screen. The library is keyed by the version actually used, so a response is never served under
// another version's name.
//
// v4 (M2-8, C282: the interactive blocks) is registered but opt-in: it is used only when Control chooses it by name,
// never as the fallback, so adding it changes nothing until then.

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

const V3: ResolverPrompt = { version: v3.RESOLVER_PROMPT_VERSION, namesSubject: true, system: v3.resolverSystem, user: v3.resolverUser };

export const RESOLVER_PROMPTS: readonly ResolverPrompt[] = [
  { version: v1.RESOLVER_PROMPT_VERSION, namesSubject: false, system: (a) => v1.resolverSystem(withSubject(a)), user: (a) => v1.resolverUser(withSubject(a)) },
  { version: v2.RESOLVER_PROMPT_VERSION, namesSubject: true, system: (a) => v2.resolverSystem(asV2(a)), user: (a) => v2.resolverUser(asV2(a)) },
  V3,
  { version: v4.RESOLVER_PROMPT_VERSION, namesSubject: true, system: v4.resolverSystem, user: v4.resolverUser },
];

// The fallback for a version the code does not have, and for a typed question under a version that cannot name the
// subject. Moving it to v4 is a decision for after v4 has run live by Control's choice.
export const LATEST_RESOLVER_PROMPT = V3.version;

export function resolverPrompt(chosen: string | null, needsSubjectNamed: boolean): ResolverPrompt {
  const picked = RESOLVER_PROMPTS.find((p) => p.version === chosen) ?? V3;
  return needsSubjectNamed && !picked.namesSubject ? V3 : picked;
}
