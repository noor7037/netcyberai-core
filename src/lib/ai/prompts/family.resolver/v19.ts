// Prompt v19 of the family.resolver profile (tutor overhaul, 16 Nov 2026): v18 with five changes. Chosen by Control by
// name, after the PR is merged; v10 stays the code-only fallback and v15 is untouched.
//   1. ONE STAGE: the answer lands as one clear board (the explanation with a few steps and one example, one visual, one
//      check), not a wall of cards. The server shapes the plan to match (plan-shape.ts oneBoardBlocks), so a block the
//      prompt does not ask for is never counted as missing.
//   2. VISUALS: the chapter's own animated diagram (the server adds it as a `showcase`) is never redrawn; a figure only
//      for a real schematic; numbers go to a chart; astronomy and physics to a scene or 3D model; no free drawing of
//      people or animals by coordinates.
//   3. TERMS: a term's `local` is written only when it differs from the English word (no "addition - addition").
//   4. HONEST GROUNDING: when a chapter of the child's book is open, the answer is taught from it and never says it is
//      "not from your chapter or book".
//   5. LABS: a lab on offer is named whenever one fits (the server now offers labs for a free question too).
// Language of the question (v17's rule), `{{name}}`, the labs list and v15's conditional memory (MEMORY_RULE) come with v18.
//
// The lines are added to v18's finished prompt before its closing rules, and the one replaced line throws if it is not
// found, so a later edit of an older version can never leave v19 silently unchanged.

import { resolverSystem as v18System, resolverUser as v18User, type ResolverAsk } from './v18';
import { V8_GENERAL_LINE } from './v15';

export const RESOLVER_PROMPT_VERSION = 'v19';
export type { ResolverAsk };

export const ONE_BOARD_LINE =
  'ONE STAGE: write the answer as one clear board, never a wall of cards. In order: a short title and the answer in one or two plain sentences; about three short steps or bullets; ONE example from the student\'s own world; ONE visual; ONE check. A worked example only when the question needs a calculation. Keep it short: the student listens while it is shown.';
export const VISUAL_RULE =
  'VISUALS: when the student\'s chapter has its own diagram it is already shown above your blocks: draw no board or figure of your own. Use a figure only for a real schematic (a cell, an orbit, layers, a circle or ring). Numbers, percentages and comparisons go in a chart; astronomy and physics in a scene or a 3D model when one is listed; a counting question for the youngest in a board of simple shapes. Never draw a person or an animal from coordinates.';
export const TERMS_RULE =
  'TERMS: in each term, write "local" only when the word is different in the explanation language; when it is the same word, repeat the English word as it is.';
export const GROUNDED_LINE =
  "The student's own book chapter is open: teach this from it, and never say that the answer is not from their chapter or book.";
export const LAB_RULE = 'LABS: when a lab on offer fits the question, name it in one lab block.';

export const resolverSystem = (a: ResolverAsk): string => {
  let base = v18System(a);
  // An open chapter (the question says it was asked while reading) or a scope: no "general answer" line.
  const grounded = Boolean(a.scope) || /\(asked while reading:/.test(a.question ?? '') || Boolean(a.chapter || a.topic) || (a.passages?.length ?? 0) > 0;
  if (grounded && base.includes(V8_GENERAL_LINE)) base = base.replace(V8_GENERAL_LINE, GROUNDED_LINE);
  const extra = [ONE_BOARD_LINE, VISUAL_RULE, TERMS_RULE, ...(a.labs && a.labs.length > 0 ? [LAB_RULE] : [])].join('\n');
  const at = base.indexOf('\nRules: ');
  if (at < 0) return `${base}\n${extra}`;
  return `${base.slice(0, at)}\n${extra}${base.slice(at)}`;
};

export const resolverUser = v18User;
