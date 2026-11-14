import * as v1 from './v1';
import * as v2 from './v2';
import * as v3 from './v3';
import * as v4 from './v4';
import * as v5 from './v5';
import * as v6 from './v6';
import * as v7 from './v7';
import * as v8 from './v8';
import * as v9 from './v9';
import * as v10 from './v10';
import * as v11 from './v11';
import * as v12 from './v12';
import * as v13 from './v13';
import * as v14 from './v14';
import * as v15 from './v15';
import * as v16 from './v16';
import * as v17 from './v17';

// The family.resolver prompt versions in this repository (docs/family-app/08 §7). Control chooses the active version
// (control.ai_profiles.prompt_version); a version the code does not have falls back to the default (v10 since W18-P2, v9 since W16). A typed
// question needs a version that names the subject (v2 and later), whatever Control chose: the server never takes the
// subject from the screen. The library is keyed by the version actually used, so a response is never served under
// another version's name.
//
// v4 (M2-8, C282: the interactive blocks) is registered but opt-in: it is used only when Control chooses it by name,
// never as the fallback, so adding it changes nothing until then.

// v8's request is v3's with the optional plan, passages and chat memory; earlier versions read only v3's fields.
export type { ResolverSubject, ChatMemory } from './v8';
// v10's request is v8's with the optional `sketch` flag (the student sent a drawing of their own).
export type { ResolverAsk } from './v10';
export type { ResolverMemory } from './v3';

export type ResolverPrompt = {
  version: string;
  // Whether a typed question's subject is named by the model, on its first line.
  namesSubject: boolean;
  // Whether the prompt is written from a teaching plan (v8 on, W9-B): the server plans the answer and keeps an
  // interactive block only where the plan names one.
  usesPlan?: boolean;
  // C509: the youngest children's answer is drawn first (v15): their plan names the board before the explanation.
  visualFirst?: boolean;
  // C521: the answer follows the question's language (v17): the server sets the ask's replyLang and motherTongue.
  readsLanguage?: boolean;
  system: (a: v10.ResolverAsk) => string;
  user: (a: v10.ResolverAsk) => string;
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
// interactive block for Mathematics or Science, a check whose every wrong option says why, practice). Chosen by Control
// by name since W9-B.
const V7: ResolverPrompt = { version: v7.RESOLVER_PROMPT_VERSION, namesSubject: true, system: v7.resolverSystem, user: v7.resolverUser };
// v8 (W9-B, docs/39 §3): the planned answer: only the blocks the teaching plan names, in the class band's length, the
// chapter's passages quoted, and the chat's earlier turns when given. The default.
const V8: ResolverPrompt = { version: v8.RESOLVER_PROMPT_VERSION, namesSubject: true, usesPlan: true, system: v8.resolverSystem, user: v8.resolverUser };
// v9 (W16-A2, docs/39 §6): v8 with the drawing board, the citation (one sources block naming the chapter when passages
// were given, none otherwise) and the Class 8 Science simulations. The default since W16.
const V9: ResolverPrompt = { version: v9.RESOLVER_PROMPT_VERSION, namesSubject: true, usesPlan: true, system: v9.resolverSystem, user: v9.resolverUser };

// v10 (W18-P2): v9 with the simulations for Science in Classes 6 to 10 (four new ones on electricity and magnets) and the
// sketch rule, only when the ask is a sketch. Control keeps v9 until the founder switches, so v10 is the "code-only
// fallback": the version used when the database row names no version the code has. No migration sets it.
const V10: ResolverPrompt = { version: v10.RESOLVER_PROMPT_VERSION, namesSubject: true, usesPlan: true, system: v10.resolverSystem, user: v10.resolverUser };
// v11 (W19-D): v10 with the 3D models line for Science (the catalogue's model keys and their parts). Chosen by Control by
// name; v10 stays the code-only fallback until the founder switches.
const V11: ResolverPrompt = { version: v11.RESOLVER_PROMPT_VERSION, namesSubject: true, usesPlan: true, system: v11.resolverSystem, user: v11.resolverUser };

// v12 (W22-S3): v11 with one line: address the learner by the literal token {{name}}, which the server swaps for the
// child's first name after the answer returns (the name never reaches a provider). Chosen by Control by name.
const V12: ResolverPrompt = { version: v12.RESOLVER_PROMPT_VERSION, namesSubject: true, usesPlan: true, system: v12.resolverSystem, user: v12.resolverUser };

// v13 (W23-C): v12 with the ready-built labs: a short list that fits where the child is, and one optional `lab` block naming
// an id from it. Code only: Control chooses it by name; v10 stays the code-only fallback.
const V13: ResolverPrompt = { version: v13.RESOLVER_PROMPT_VERSION, namesSubject: true, usesPlan: true, system: v13.resolverSystem, user: v13.resolverUser };

// v14 (C503): v13 with the subject decided with the open tab, the nearest subject instead of "other", and curiosity
// taught, not refused. Code only: Control chooses it by name; v10 stays the code-only fallback.
const V14: ResolverPrompt = { version: v14.RESOLVER_PROMPT_VERSION, namesSubject: true, usesPlan: true, system: v14.resolverSystem, user: v14.resolverUser };

// v15 (C509): v14 with the youngest children's answer drawn first and built to be heard (board, a 40-word explanation, a
// check of single-word options), a memory that refers back only on the same topic, varied openings, and an honest book
// line. Code only: Control chooses it by name; v10 stays the code-only fallback.
const V15: ResolverPrompt = { version: v15.RESOLVER_PROMPT_VERSION, namesSubject: true, usesPlan: true, visualFirst: true, system: v15.resolverSystem, user: v15.resolverUser };
// v16 (C516): v15 with a one-or-two-sentence answer first (a key_points block) for Classes 3 and up, so the first words
// show sooner. Opt-in by name.
const V16: ResolverPrompt = { version: v16.RESOLVER_PROMPT_VERSION, namesSubject: true, usesPlan: true, visualFirst: true, system: v16.resolverSystem, user: v16.resolverUser };
// v17 (C521): v16 with the photo question named, shown in one fitting visual and taught as answer, why, worked example
// and check, and the answer in the language the question was asked in. Opt-in by name.
const V17: ResolverPrompt = { version: v17.RESOLVER_PROMPT_VERSION, namesSubject: true, usesPlan: true, visualFirst: true, readsLanguage: true, system: v17.resolverSystem, user: v17.resolverUser };

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
  V8,
  V9,
  V10,
  V11,
  V12,
  V13,
  V14,
  V15,
  V16,
  V17,
];

// The fallback for a version the code does not have, and for a typed question under a version that cannot name the
// subject: v10 since W18-P2 (v9 since W16, v8 since W9-B, v7 since W8-AI; it was v3).
export const LATEST_RESOLVER_PROMPT = V10.version;

export function resolverPrompt(chosen: string | null, needsSubjectNamed: boolean): ResolverPrompt {
  const picked = RESOLVER_PROMPTS.find((p) => p.version === chosen) ?? V10;
  return needsSubjectNamed && !picked.namesSubject ? V10 : picked;
}
