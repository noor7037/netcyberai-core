import * as v1 from './v1';
import * as v2 from './v2';
import * as v3 from './v3';
import * as v4 from './v4';
import * as v5 from './v5';
import * as v6 from './v6';
import * as v7 from './v7';

// The family.resolver prompt versions in this repository (docs/family-app/08 §7). Control chooses the active version
// (control.ai_profiles.prompt_version); a version the code does not have falls back to the default (v7 since W8-AI). A typed
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
// v7 (W8-AI): v6's rules with the full answer (longer explanation, worked example, diagram or mind map, key points, one
// interactive block for Mathematics or Science, a check whose every wrong option says why, practice). The default.
const V7: ResolverPrompt = { version: v7.RESOLVER_PROMPT_VERSION, namesSubject: true, system: v7.resolverSystem, user: v7.resolverUser };

export const RESOLVER_PROMPTS: readonly ResolverPrompt[] = [
  { version: v1.RESOLVER_PROMPT_VERSION, namesSubject: false, system: (a) => v1.resolverSystem(withSubject(a)), user: (a) => v1.resolverUser(withSubject(a)) },
  { version: v2.RESOLVER_PROMPT_VERSION, namesSubject: true, system: (a) => v2.resolverSystem(asV2(a)), user: (a) => v2.resolverUser(asV2(a)) },
  V3,
  { version: v4.RESOLVER_PROMPT_VERSION, namesSubject: true, system: v4.resolverSystem, user: v4.resolverUser },
  // v5 (C323): v3 with the required blocks first, for open models; chosen by Control by name, like v4.
  { version: v5.RESOLVER_PROMPT_VERSION, namesSubject: true, system: v5.resolverSystem, user: v5.resolverUser },
  // v6 (C334): v5 with no double quotation mark inside a text value; chosen by Control by name.
  { version: v6.RESOLVER_PROMPT_VERSION, namesSubject: true, system: v6.resolverSystem, user: v6.resolverUser },
  V7,
];

// The fallback for a version the code does not have, and for a typed question under a version that cannot name the
// subject: v7 since W8-AI (it was v3).
export const LATEST_RESOLVER_PROMPT = V7.version;

export function resolverPrompt(chosen: string | null, needsSubjectNamed: boolean): ResolverPrompt {
  const picked = RESOLVER_PROMPTS.find((p) => p.version === chosen) ?? V7;
  return needsSubjectNamed && !picked.namesSubject ? V7 : picked;
}
