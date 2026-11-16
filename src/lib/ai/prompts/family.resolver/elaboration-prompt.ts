// The NetCyberAI Elaboration Framework as prompt lines (founder, 16 Nov 2026; prompt v19). Every answer is ONE block with
// five steps in a fixed order. The server checks the shape (src/lib/family/elaboration.ts), draws the five pictures and
// sets which level leads; the model writes only the words. Kept in its own file so the older versions do not carry it.

import type { Band } from '@/lib/ai/teaching/plan-shape';

const SHAPE =
  '{"type":"elaboration","term":"the thing asked, up to 6 words","icon":"ONE emoji of the thing",' +
  '"definition":{"text":"STEP 1, what the student asked answered in ONE clear sentence","say":"the same, written to be spoken"},' +
  '"levels":{"basic":"STEP 2 Basic","intermediate":"STEP 2 Intermediate","advanced":"STEP 2 Advanced","say":"the three levels written to be spoken"},' +
  '"real_life":{"text":"STEP 3, one real scene the child sees every day","say":"the same, to be spoken","icon":"ONE emoji of that scene"},' +
  '"try_it":{"question":"STEP 4, one small question the child works out","options":["2 to 4 short choices"],"answer":0,"right":"one line when the choice is right","hint":"one line when it is wrong: a clue, never the answer","say":"the question, to be spoken"},' +
  '"future":{"text":"STEP 5, where this will be useful later","say":"the same, to be spoken","icon":"ONE emoji"}}';

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
  '4 Try it (one small question with 2 to 4 choices, exactly one right; the child works it out and the screen answers at once); ' +
  '5 Future line (where this is useful later in science, technology or daily life). ' +
  'Write it in the student\'s language. Every step is also spoken, so each "say" is plain words with no symbols or markup. Never repeat one step inside another. Never put a picture, link or markup in any text: the screen draws each step\'s picture itself.';

export function elaborationLines(band: Band): string[] {
  return [`Write ONE JSON line of exactly this shape (every field required, ONE line only):`, SHAPE, DEPTH[band], 'Every option is different and only one is right. The hint never gives the answer away.'];
}
