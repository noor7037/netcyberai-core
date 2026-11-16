// The NetCyberAI Elaboration Framework as prompt lines (founder, 16 Nov 2026; prompt v19). Every answer is ONE block with
// five steps in a fixed order. The server checks the shape (src/lib/family/elaboration.ts), draws the five pictures and
// sets which level leads; the model writes only the words. Kept in its own file so the older versions do not carry it.

import type { Band } from '@/lib/ai/teaching/plan-shape';

const SHAPE =
  '{"type":"elaboration","term":"the thing asked, up to 6 words","icon":"ONE emoji of the thing",' +
  '"definition":{"text":"STEP 1, what the student asked answered in ONE clear sentence","say":"the same, written to be spoken","q":"3 or 4 English words to find a photograph of this step"},' +
  '"levels":{"basic":"STEP 2 Basic","intermediate":"STEP 2 Intermediate","advanced":"STEP 2 Advanced","say":"the three levels written to be spoken","q":"3 or 4 English words for a photograph"},' +
  '"real_life":{"text":"STEP 3, one real scene the child sees every day","say":"the same, to be spoken","icon":"ONE emoji of that scene","q":"3 or 4 English words for a photograph of that scene"},' +
  '"try_it":{"question":"STEP 4, one small open task the child thinks about (no choices)","right":"the answer, in one or two lines","hint":"a clue that does not give the answer away","say":"the task, to be spoken","q":"3 or 4 English words for a photograph"},' +
  '"future":{"text":"STEP 5, where this will be useful later","say":"the same, to be spoken","icon":"ONE emoji","q":"3 or 4 English words for a photograph"},' +
  '"checks":[{"question":"a multiple-choice question about this topic","options":["2 to 4 short choices"],"answer":0,"right":"one line when right","hint":"one line when wrong: a clue, never the answer"}]}';

const DEPTH: Record<Band, string> = {
  lkg_1: 'This is a very young child: every text is ONE short sentence of words a six-year-old knows, picture-led; a level is only a few words.',
  c2_5: 'This is a young child: every text is one or two short sentences; Basic is the clearest and the other two stay short.',
  c6_8: 'Basic is two short sentences; Intermediate is the fuller explanation (three or four sentences); Advanced adds one reason or rule in two sentences.',
  c9_10: 'Basic is one plain sentence; Intermediate is the full explanation with the rule; Advanced goes deeper (a formula, a reason, an exception) in three or four sentences.',
  c11_12: 'Basic is one plain sentence; Intermediate is the standard explanation; Advanced is the full depth for this class: the principle, the formula or derivation idea, and where it breaks.',
};

export const ELABORATION_RULE =
  'THE NETCYBERAI ELABORATION FRAMEWORK. Whatever the student asked, even one bare keyword, the whole answer is the five steps below, in this order, never reordered and never skipped: ' +
  '1 Definition (what was asked, in one clear sentence, first); 2 Three levels (Basic, then Intermediate, then Advanced, so every child understands from their own level); ' +
  '3 Real life (one scene from the child\'s own day in India: the shop, the kitchen, the road, the bus, cricket, the festival); ' +
  '4 Try it (one small open task, no choices: the child thinks, taps for the hint, then sees your answer); ' +
  '5 Future line (where this is useful later in science, technology or daily life). ' +
  'Only AFTER step 5 come the "checks": multiple-choice questions, never instead of a step and never inside one. Write 1 for a simple fact, 2 for a process or a cause, 3 for a topic with several parts; each has 2 to 4 choices and exactly one right. ' +
  'Write it in the student\'s language. Every step is also spoken, so each "say" is plain words with no symbols or markup. Never repeat one step inside another. Never put a picture, link or markup in any text: the screen finds each step\'s picture itself, from the "q" words (plain English nouns of what the picture should show, never a person\'s name).';

export function elaborationLines(band: Band): string[] {
  return [`Write ONE JSON line of exactly this shape (every field required, ONE line only):`, SHAPE, DEPTH[band], 'Every choice of a check is different and only one is right. A hint never gives the answer away. A check on its own, or before the five steps, is never an answer.'];
}

// ---- prompt v20 (live testing, 16 Nov 2026): the depth adapts to the topic -----------------------------------------------
// v19 forced ONE sentence per step. v20 keeps the five steps and the class band, and lets a process, a cause or a why
// question take 3 to 5 sentences per step. Written as replacements of v19's lines, so v19 stays as it was.
const REPLACE_SHAPE: [string, string][] = [
  ['"term":"the thing asked, up to 6 words"', '"term":"the thing asked, up to 6 words, in the answer language","topic_en":"the topic as a plain English search phrase of 2 to 4 words, always English letters (waste management)","topic_local":"the same topic in the answer language and its own script (कचरा प्रबंधन); the same as topic_en when the answer is in English"'],
  ['"text":"STEP 1, what the student asked answered in ONE clear sentence"', '"text":"STEP 1, what the student asked answered clearly (see DEPTH)"'],
  ['"say":"the three levels written to be spoken"', '"say":"the three levels, shortened to be spoken (about 4 to 8 sentences for a deep topic, 2 to 3 for a simple one)"'],
  ['"text":"STEP 3, one real scene the child sees every day"', '"text":"STEP 3, one real scene the child sees every day (see DEPTH)"'],
  ['"right":"the answer, in one or two lines"', '"right":"the answer (one or two lines for a simple fact, a short paragraph for a process or a why)"'],
  ['"text":"STEP 5, where this will be useful later"', '"text":"STEP 5, where this will be useful later (see DEPTH)"'],
];
export const DEPTH_RULE_V20 =
  'DEPTH ADAPTS TO THE TOPIC. A simple fact or definition (what is a noun, the capital of a state): each step is 1 to 2 sentences. A process, a cause or a why question (photosynthesis, why trees die, how rain forms, why the seasons change): each step is 3 to 5 whole sentences that explain the how and the why in order, and Intermediate and Advanced are richer than Basic (Basic the plain story, Intermediate the mechanism, Advanced the reason, the rule or an exception). Each "say" is the same step shortened to a spoken length of 2 to 4 sentences, plain words, never longer than the text. The class band below still sets how hard the words are.';
export const DEPTH_V20: Record<Band, string> = {
  lkg_1: 'This is a very young child: even for a why question every text is at most TWO short sentences of words a six-year-old knows, picture-led; a level is only a few words.',
  c2_5: 'This is a young child: a simple fact is one or two short sentences; a process or a why takes 3 or 4 short sentences, each with one idea in words the child uses; Basic is the clearest and the other two add one more idea each.',
  c6_8: 'Basic is two short sentences for a fact (3 for a process); Intermediate is the fuller explanation (four or five sentences for a process or a why); Advanced adds the reason or rule in three or four sentences.',
  c9_10: 'Basic is one plain sentence for a fact (3 for a process); Intermediate is the full explanation with the rule (4 or 5 sentences for a process or a why); Advanced goes deeper (a formula, a reason, an exception) in four or five sentences.',
  c11_12: 'Basic is one plain sentence for a fact (3 for a process); Intermediate is the standard explanation (4 or 5 sentences); Advanced is the full depth for this class in 4 or 5 sentences: the principle, the formula or derivation idea, and where it breaks.',
};
const RULE_TAIL = 'Write it in the student\'s language. Every step is also spoken, so each "say" is plain words with no symbols or markup.';

// v19's elaboration lines turned into v20's: the replaced pieces must exist, so an edit of v19 never leaves v20 unchanged.
export function toV20(base: string, band: Band): string {
  let out = base;
  const swap = (a: string, b: string) => {
    if (!out.includes(a)) throw new Error(`family.resolver v20: line not found: ${a.slice(0, 40)}`);
    out = out.replace(a, () => b);
  };
  for (const [a, b] of REPLACE_SHAPE) swap(a, b);
  swap(DEPTH[band], DEPTH_V20[band]);
  swap('1 Definition (what was asked, in one clear sentence, first);', '1 Definition (what was asked, answered clearly, first);');
  swap(RULE_TAIL, `${DEPTH_RULE_V20} ${RULE_TAIL}`);
  return out;
}
