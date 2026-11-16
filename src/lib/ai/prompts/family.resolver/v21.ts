// Prompt v21 of the family.resolver profile (live testing, 16 Nov 2026): v20 with four changes, for every class (LKG to 12), every
// subject, every input language, free and paid alike. v19 and v20 are untouched; Control chooses v21 by name.
//   1. DEEPER STEPS. A broad topic ("energy", "light", "the Constitution") is never a simple fact. Each step is a full explanation
//      with an everyday Indian example, scaled by class, covering every aspect of the question.
//   2. CREATIVE EXTRAS after the steps: an activity at home, a fun fact, the India link, a memory trick, a "what if" question.
//   3. THE CHILD'S FIRST NAME, once or twice. The name is personal data and never goes to an AI provider, so the prompt carries
//      the literal token {{name}}, which the server swaps for the first name after the answer returns (name-token.ts).
//   4. TWO TO FIVE QUESTIONS, never fewer than two, by the size of the topic and the class; plus `q3d`, five short English search
//      terms for the 3D model of each step.
// The lines are v20's, rewritten by toV21, which throws when a line it replaces is missing.

import { resolverSystem as v20System, resolverUser as v20User, elaborationLang } from './v20';
import { isElaboration, type ResolverAsk } from './v19';
import { defaultPlan } from '@/lib/ai/teaching/plan-shape';
import { DEPTH_RULE_V20, DEPTH_V20 } from './elaboration-prompt';
import type { Band } from '@/lib/ai/teaching/plan-shape';

export const RESOLVER_PROMPT_VERSION = 'v21';
export type { ResolverAsk };
export { elaborationLang };

export const DEPTH_RULE_V21 =
  'DEPTH: A BROAD TOPIC IS NEVER A SIMPLE FACT. A bare keyword or a broad topic (energy, light, force, the Constitution, a river, a festival) is not a simple fact: explain every aspect of it. Even a true one-line fact is explained with its reason. Each step is a FULL explanation, never one line: it says what, how and why in order and gives one everyday Indian example the child knows (the kitchen, the bus, a cricket match, a festival, a village or a city street). Cover every aspect of the question across the five steps; do not leave a part out. Each "say" is the same step shortened to a spoken length, plain words.';

const DEPTH_V21: Record<Band, string> = {
  lkg_1: 'This is a very young child: every step is at most two or three short sentences of words a six-year-old knows, with one everyday example, picture-led; a level is only a few words.',
  c2_5: 'This is a young child (Classes 1 to 5): every step is a full explanation of about 3 to 4 short sentences, one idea in each, with an everyday Indian example the child sees; Basic is the clearest and the other two add one more idea each.',
  c6_8: 'This is Classes 6 to 8: every step is a full explanation of about 5 to 7 sentences with an everyday Indian example; Basic is the plain story, Intermediate the mechanism with reasons, Advanced the rule, the reason and an exception.',
  c9_10: 'This is Classes 9 and 10: every step is richer and more detailed: reasons, the rule or formula where one applies and, in words, the diagram the child would draw; at least 5 to 8 sentences a step, with an everyday Indian example; Advanced adds a worked idea or an exception.',
  c11_12: 'This is Classes 11 and 12: every step is rich and detailed: the principle, the reasoning, the formula or derivation idea, a diagram described in words, and where it breaks, at least 6 to 8 sentences a step, each with a real Indian example or application.',
};

export const QUESTIONS_RULE_V21 =
  'Write between 2 and 5 questions, NEVER fewer than 2: 2 for a small topic, 3 or 4 for a topic with several parts, 5 for a big topic, and more for a higher class; each has 2 to 4 choices and exactly one right, and each tests a different part of the answer.';

export const EXTRAS_RULE_V21 =
  'CREATIVE EXTRAS: after the steps, in "extras", give short, fresh ideas chosen for this topic and this class, in the answer language, each one or two sentences, richer and more creative for higher classes: "home" (a safe try-it-at-home activity with things found in an Indian home), "fact" (a fun fact), "india" (a real-life connection in India), "trick" (a memory trick: a rhyme, a story or a way to remember), "whatif" (a "what would happen if" question to wonder about). Never repeat a step; no markup. Leave a key "" only when nothing true and useful fits.';

export const NAME_RULE_V21 =
  'THE STUDENT\'S FIRST NAME: use it naturally once or twice in the whole answer, never more: a warm opening, a word of praise inside a step, or encouragement before the questions. Write it only as the literal token {{name}} (for example "Good thinking, {{name}}!"); never write a real name, and never put it in a title, a formula or a choice.';

export const Q3D_RULE_V21 =
  '"q3d" is five short ENGLISH search terms (2 to 4 plain words each, English letters only, for example "plant cell" or "human heart"), one for each step in order, naming a real object whose 3D model would teach that step; use "" for a step where a 3D model teaches nothing.';

const EXTRAS_SHAPE = '"extras":{"home":"try it at home","fact":"a fun fact","india":"a real-life connection in India","trick":"a memory trick","whatif":"a what-if question"},"q3d":["English term for step 1","step 2","step 3","step 4","step 5"],';

// v20's elaboration lines turned into v21's: every replaced piece must exist, so an edit of v20 never leaves v21 unchanged.
export function toV21(base: string, band: Band): string {
  let out = base;
  const swap = (a: string, b: string) => {
    if (!out.includes(a)) throw new Error(`family.resolver v21: line not found: ${a.slice(0, 40)}`);
    out = out.replace(a, () => b);
  };
  swap(DEPTH_RULE_V20, DEPTH_RULE_V21);
  swap(DEPTH_V20[band], DEPTH_V21[band]);
  swap('Write 1 for a simple fact, 2 for a process or a cause, 3 for a topic with several parts; each has 2 to 4 choices and exactly one right.', QUESTIONS_RULE_V21);
  swap('"checks":[', `${EXTRAS_SHAPE}"checks":[`);
  swap('"say":"the three levels, shortened to be spoken (about 4 to 8 sentences for a deep topic, 2 to 3 for a simple one)"', '"say":"the three levels, shortened to be spoken (about 4 to 8 sentences)"');
  return out;
}

export const resolverSystem = (a: ResolverAsk): string => {
  const base = v20System(a);
  if (!isElaboration(a)) return base;
  const band = (a.plan ?? defaultPlan({ classLevel: a.classLevel, subject: a.subject, lang: a.language === 'hi' ? 'hi' : 'en', elaborate: true }, 'medium')).band;
  const out = toV21(base, band);
  const extra = `${NAME_RULE_V21}\n${EXTRAS_RULE_V21}\n${Q3D_RULE_V21}`;
  const at = out.indexOf('\nRules: ');
  return at < 0 ? `${out}\n${extra}` : `${out.slice(0, at)}\n${extra}${out.slice(at)}`;
};

export const resolverUser = v20User;
