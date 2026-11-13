// Prompt v15 of the family.resolver profile (C509): v14, word for word, with four changes from the founder's live test of
// 12 Nov (a Class 1 child, v14, a paid fast model).
//   1. The youngest children (LKG to Class 2) get an answer built to be HEARD and SEEN: the drawing board FIRST (3 to 5
//      short spoken steps), one explanation of at most 40 words written to be read aloud, and one check whose 2 or 3
//      options are single words or numbers, so a child who cannot read yet can tap after hearing it. No worked example,
//      key points or practice. Classes 3 to 5 get the lighter form: the board first in Mathematics, EVS or Science and an
//      explanation of at most 90 words. The server's plan for the youngest names the board (plan-shape.ts, visualFirst).
//   2. The memory refers back ONLY when the question continues the same topic: no "Earlier we saw" for a new topic, and
//      no mention of earlier turns at all when the subject differs. The memory text itself is unchanged.
//   3. Variety: never the same opening words as the last answer, and the example from the child's own world.
//   4. An honest book line for a question typed with no chapter open that nothing matched: "not from your book" only
//      when the class has a published book for the subject, and nothing about a book otherwise.
// v14 is untouched; Control chooses v15 by name.

import { BAND_LINES, planOf, REFER_BACK_LINE, type ResolverAsk } from './v8';
import { boardLines, BOARD_LINE } from './v9';
import { resolverSystem as v14System, resolverUser as v14User } from './v14';
import { isYoungVisual, YOUNG_VISUAL_BLOCKS, type Plan } from '@/lib/ai/teaching/plan-shape';

export const RESOLVER_PROMPT_VERSION = 'v15';
export type { ResolverAsk };

// ---- 1. the youngest children: heard and seen ----------------------------------------------------------------------

export const YOUNG_BAND_LINE =
  'HEARD AND SEEN: this student is in LKG to Class 2 and may not read yet. The answer is read aloud and drawn, like a one-to-one teacher at a board: short spoken sentences of everyday words, no brackets (not even for an English word in Hindi), no symbols, no numbered lists. The board comes first and shows the idea; the explanation says it in a few words; the check is answered by a tap after hearing it.';
export const MIDDLE_BAND_LINE =
  'This student is in Classes 3 to 5: write to be heard and seen: short spoken sentences of everyday words, the explanation at most 90 words, told as a short story or an everyday example, with one check; the whole answer is at most 150 words.';

export const YOUNG_EXPLANATION_LINE =
  '{"type":"explanation","title":"up to 5 words","idea":"the idea in one short spoken sentence","paragraphs":["one short paragraph"],"example":"one thing from the child\'s own world: home, school, the playground, food or animals","steps":["2 very short spoken steps"],"terms":[]}. The idea, paragraph, example and steps together are at most 40 words, in everyday words, written to be read aloud: no brackets, no symbols, no numbers in a list.';
export const YOUNG_ITEM_EXAMPLE =
  '{"id":"c1","question":"Which one is a fruit?","options":["brick","mango","spoon"],"answer":1,"hint":"Which one grows on a tree?","why":"A mango grows on a mango tree.","wrong":["A brick is made of clay. It does not grow.","","A spoon is made by people. It does not grow."]}';
export const YOUNG_CHECK_LINES = [
  `{"type":"check","items":[exactly 1 item]} asked in one short spoken sentence, so a child who cannot read yet answers it by a tap after hearing it. Write the item exactly like this one: ${YOUNG_ITEM_EXAMPLE}`,
  '   "options" has 2 or 3 choices, each a single word or a number, never a sentence; "answer" is the number of the right option, and the right option is not always the first; "hint" nudges without giving the answer away; "why" says in one short sentence why the right option is right; "wrong" has one short line for EVERY option saying why it is wrong, and an empty string for the right one.',
];

export const YOUNG_BOARD_LINES = [
  `Block 1, the board, is drawn step by step in time with the words, and it is ALWAYS written for this student: ${BOARD_LINE}`,
  '   It has 3 to 5 steps, numbered 1, 2, 3 in order. Each step\'s "say" is one short spoken sentence of at most 12 words, and its commands draw simple shapes and labels that show what that sentence says, each thing in its own colour. For a question about numbers, draw the things to count (one circle or shape for each), so the child can count them on the board. The commands:',
];
export const YOUNG_BOARD_LAST = 'The board is block 1 above: write it first, and write no figure of the same drawing.';

export const MIDDLE_BOARD_FIRST: Record<'known' | 'named', string> = {
  known: 'Draw first: write the board block FIRST, before the explanation, with 3 to 5 steps whose "say" lines are short spoken sentences, and let the explanation then say the same idea in words.',
  named: 'Draw first: if the subject you named is Mathematics, EVS or Science, write the board block FIRST, before the explanation, with 3 to 5 steps whose "say" lines are short spoken sentences, and let the explanation then say the same idea in words.',
};
const DRAW_FIRST_SUBJECTS = /^(mathematics|evs|science)$/;

const MIDDLE_EXPLANATION = 'together are at most 150 words for the whole answer.';
const MIDDLE_EXPLANATION_V15 = 'together are at most 90 words, written to be read aloud.';

// The plan v15 writes from: the youngest children's is always the board, the explanation and the check.
export function v15Plan(a: ResolverAsk): Plan {
  const plan = planOf(a);
  return isYoungVisual(a.classLevel, true) ? { ...plan, blocks: [...YOUNG_VISUAL_BLOCKS] } : plan;
}

function youngLines(base: string, band: Plan['band']): string {
  let s = base.replace(BAND_LINES[band], YOUNG_BAND_LINE);
  s = s.replace(/^(\d+)\. \{"type":"explanation".*$/m, (_m, n: string) => `${n}. ${YOUNG_EXPLANATION_LINE}`);
  s = s.replace(/^(\d+)\. \{"type":"check".*\n {3}"options" has 4 choices.*$/m, (_m, n: string) => `${n}. ${YOUNG_CHECK_LINES[0]}\n${YOUNG_CHECK_LINES[1]}`);
  const v9Board = boardLines();
  s = s.replace(v9Board[0], YOUNG_BOARD_LINES[0]).replace(v9Board[1], YOUNG_BOARD_LINES[1]).replace(v9Board[v9Board.length - 1], YOUNG_BOARD_LAST);
  return s;
}

function middleLines(base: string, a: ResolverAsk): { text: string; extra: string[] } {
  const text = base.replace(BAND_LINES.c2_5, MIDDLE_BAND_LINE).replace(BAND_LINES.lkg_1, MIDDLE_BAND_LINE).replace(MIDDLE_EXPLANATION, MIDDLE_EXPLANATION_V15);
  const extra = a.subject === null ? [MIDDLE_BOARD_FIRST.named] : DRAW_FIRST_SUBJECTS.test(a.subject) ? [MIDDLE_BOARD_FIRST.known] : [];
  return { text, extra };
}

// ---- 2. memory: refer back only on the same topic ------------------------------------------------------------------

// v8's two lines after the memory text (the second is REFER_BACK_LINE), replaced by MEMORY_RULE.
export const V8_MEMORY_FOLLOW_LINE =
  "Answer the new question with this in view: a short follow-up (such as 'and why is that?') refers to what was said above; refer back to what was already explained instead of repeating it.";
export const MEMORY_RULE =
  "Use the earlier turns ONLY when this question continues the same topic (a short follow-up such as 'and why is that?' or 'show another example'): then refer back to what was already explained instead of repeating it, and the explanation's first sentence may name it in your own words. When this question is about a new topic, answer it on its own: never begin with 'Earlier we saw', 'पहले हमने देखा' or 'Pehle humne dekha', and never say the topics are linked when they are not. When its subject differs from the earlier turns, do not mention the earlier turns at all.";

// ---- 3. variety -----------------------------------------------------------------------------------------------------

export const VARIETY_LINE =
  "Variety: never begin this answer with the same opening words as the tutor's last answer, and never reuse its title. Take the example from the child's own world: home, school, the playground, food or animals.";

// ---- 4. the honest book line ----------------------------------------------------------------------------------------

export const V8_GENERAL_LINE =
  "No chapter of the student's library matched this question: in one short sentence of the explanation, say that this is a general answer, not from their chapter.";
export const NOT_FROM_BOOK_LINE =
  "Nothing in the student's book matched this question: in one short sentence of the explanation, say plainly that this is not from their book (in English 'This is not in your book.', in Hindi 'यह आपकी किताब में नहीं है।', in Hinglish 'Yeh tumhari kitaab mein nahin hai.').";
export const NO_BOOK_LINE =
  'This class has no book in this subject in the app: say nothing about a book, a chapter or where the answer comes from; just teach it.';
export const namedBookLine = (subjects: readonly string[]): string =>
  `If the subject you named is one of ${subjects.join(', ')} (the subjects with a book in the app), say in one short sentence of the explanation that this is not from their book (in English 'This is not in your book.', in Hindi 'यह आपकी किताब में नहीं है।'); for any other subject, say nothing about a book, a chapter or where the answer comes from.`;

// The book line for a question typed with no chapter open that no passage matched; null: v14's line stands (a chapter or
// topic open, or the request did not say which subjects have a book).
export function bookLine(a: ResolverAsk): string | null {
  if (!a.question || a.chapter || a.topic || a.scope || (a.passages && a.passages.length > 0) || !a.bookSubjects) return null;
  const withBook = a.bookSubjects.filter((s) => a.classSubjects.includes(s as never));
  if (a.subject !== null) return withBook.includes(a.subject) ? NOT_FROM_BOOK_LINE : NO_BOOK_LINE;
  return withBook.length > 0 ? namedBookLine(withBook) : NO_BOOK_LINE;
}

// ---- the prompt -------------------------------------------------------------------------------------------------------

export function resolverSystem(a: ResolverAsk): string {
  const plan = v15Plan(a);
  const ask: ResolverAsk = { ...a, plan };
  let base = v14System(ask);
  const extra: string[] = [];
  if (isYoungVisual(a.classLevel, true)) base = youngLines(base, plan.band);
  else if (a.classLevel <= 5) {
    const m = middleLines(base, a);
    base = m.text;
    extra.push(...m.extra);
  }
  base = base.replace(`${V8_MEMORY_FOLLOW_LINE}\n${REFER_BACK_LINE}`, MEMORY_RULE);
  const book = bookLine(a);
  if (book) base = base.replace(V8_GENERAL_LINE, book);
  extra.push(VARIETY_LINE);
  // With the other lines, before the closing rules, as v12 and v13 do.
  const at = base.indexOf('\nRules: ');
  const add = extra.join('\n');
  return at < 0 ? `${base}\n${add}` : `${base.slice(0, at)}\n${add}${base.slice(at)}`;
}

export const resolverUser = v14User;
