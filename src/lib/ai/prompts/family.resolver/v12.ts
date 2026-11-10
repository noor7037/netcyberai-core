// Prompt v12 of the family.resolver profile (W22-S3): v11, word for word, plus one line about the learner's name. A
// teacher uses a child's name now and then to engage ("Good try, {{name}}, ..."), but the child's name is personal data and
// never goes to an AI provider. So the prompt carries only the literal token {{name}}; our server swaps it for the child's
// first name after the answer comes back and before it is shown or kept (src/lib/family/name-token.ts), and strips it when
// there is no name. Registered next to v11 and chosen by Control by name; v10 stays the code-only fallback.

import { resolverSystem as v11System, resolverUser as v11User, type ResolverAsk } from './v11';

export const RESOLVER_PROMPT_VERSION = 'v12';
export type { ResolverAsk };

export const NAME_LINE = 'Where it feels natural, and at most once or twice in the whole answer (never in every sentence, never in a title, a formula or a quiz option), address the learner by writing the literal token {{name}} where their name would go, for example "Good try, {{name}}, ...". Never write a real name.';

export function resolverSystem(a: ResolverAsk): string {
  const base = v11System(a);
  // With the other lines, before the closing rules, as v11 does.
  const at = base.indexOf('\nRules: ');
  return at < 0 ? `${base}\n${NAME_LINE}` : `${base.slice(0, at)}\n${NAME_LINE}${base.slice(at)}`;
}

export const resolverUser = v11User;
