// Prompt v9 of the family.resolver profile (W16-A2, docs/39 §6): v8, word for word, plus three things.
//   - The live drawing board: when a drawing helps (geometry, a physics setup, a cell, a circuit, a graph, a map of
//     ideas), one `board` block of 3 to 8 steps whose say lines are the explanation's sentences, in order; never a
//     figure and a board of the same thing.
//   - The citation: exactly one `sources` block naming the chapter whenever the library's passages were given, and
//     none when they were not (the phone's chip then says the answer is general knowledge).
//   - The Class 8 Science simulations (pressure in liquids, friction, sound), named by key in a scene block, when the
//     plan asks for a scene and the question is one of them.
// v8's JSON shape, plan, bands and rules are unchanged; the new lines come after v8's block list.

import { resolverSystem as v8System, resolverUser as v8User, type ResolverAsk } from './v8';

export const RESOLVER_PROMPT_VERSION = 'v9';
export type { ResolverAsk };

export const BOARD_LINE = '{"type":"board","title":"≤60","width":"wide|tall (optional)","steps":[{"n":1,"say":"one sentence of the explanation","commands":[commands]}]}';
// The commands, one example each, on a 100 by 100 grid: x from the left, y from the top.
export const BOARD_COMMANDS: readonly string[] = [
  '{"kind":"shape","shape":"rect","at":[10,20],"w":30,"h":20} (at: the top left corner)',
  '{"kind":"shape","shape":"circle","at":[50,50],"r":12}',
  '{"kind":"shape","shape":"ellipse","at":[50,50],"rx":20,"ry":10}',
  '{"kind":"shape","shape":"triangle","points":[[20,80],[80,80],[50,30]]}',
  '{"kind":"shape","shape":"line","from":[10,90],"to":[90,90],"dashed":true}',
  '{"kind":"arrow","from":[20,50],"to":[45,50]}',
  '{"kind":"label","at":[60,30],"text":"≤40, a name on the drawing"}',
  '{"kind":"text","at":[5,8],"text":"≤160, a short note","size":"small|big (optional)"}',
  '{"kind":"equation","at":[10,92],"text":"≤80, plain text maths such as P = F / A or a² + b² = c²"}',
  '{"kind":"axis","id":"ax","at":[15,85],"w":70,"h":60,"x":[0,10],"y":[0,100],"xLabel":"≤20","yLabel":"≤20"} (at: the origin, bottom left)',
  '{"kind":"graph","axis":"ax","points":[[0,0],[5,50],[10,100]]} (points in the axis\' own numbers; "dots":true for points only)',
  '{"kind":"point","at":[40,40],"label":"≤20"}',
  '{"kind":"highlight","target":"id of an earlier command"} or {"kind":"highlight","at":[x,y],"w":20,"h":10}',
  '{"kind":"erase","target":"id of an earlier command"}',
  '{"kind":"group","id":"g1","commands":[commands drawn together]}',
];
export const BOARD_RULES =
  'Any command may carry "id" (letters and digits, to highlight or erase it later) and "colour" (ink, saffron, teal or plum; ink when absent); a shape may carry "fill":true. At most 60 commands in all. Draw only what the sentence says, with the real names of the parts; never a made-up number.';

// The scene's three simulations (src/lib/family/visuals/sims.ts): our code draws them and computes every number.
export const SIM_LINE = '{"type":"scene","title":"≤60","sim":"pressure_depth|friction_surface|sound_wave"}';

export function boardLines(): string[] {
  return [
    `When a drawing helps the idea (geometry, a physics setup, a cell, a circuit, a graph, a map of ideas), also write ONE board block, right after the explanation, drawn step by step in time with the words: ${BOARD_LINE}`,
    '   It has 3 to 8 steps, numbered 1, 2, 3 in order. Each step\'s "say" is one sentence of the explanation, copied in the same order as the explanation says them, and its commands draw what that sentence says. The commands:',
    ...BOARD_COMMANDS.map((c) => `   ${c}`),
    `   ${BOARD_RULES}`,
    'Never a figure and a board of the same thing: if you write a board, leave out a figure of the same drawing. When no drawing helps, write no board.',
  ];
}

const SCIENCE = /^(science|physics)$/;
export function simLines(a: ResolverAsk): string[] {
  const science = a.subject === null || SCIENCE.test(a.subject);
  if (a.classLevel !== 8 || !science) return [];
  return [
    `For Class 8 Science, when the scene is about pressure in liquids, friction on surfaces or sound (pitch and loudness), write the scene as a simulation instead of parts: ${SIM_LINE} (pressure_depth: pressure and depth in a liquid; friction_surface: the surface and how soon a moving thing stops; sound_wave: frequency and pitch, amplitude and loudness). Our code draws it and works out every number.`,
  ];
}

export function sourcesLines(a: ResolverAsk): string[] {
  if (!a.passages || a.passages.length === 0) return ['Write no sources block: no chapter of the student\'s library matched this question.'];
  return [
    'Write exactly ONE sources block naming the chapter you taught from, as the first block after the subject line: {"type":"sources","chapter":"the chapter title exactly as given above, after its number","unit":"the part of the chapter, up to 60 characters, only if the passage names it"}. No links in it.',
  ];
}

// A sum asked is a sum answered (browser test of 2 Nov 2026: "12 x 15" got its steps and never the 180).
export const SUM_LINE =
  'When the question is a sum or a calculation to work out (12 × 15, 3/4 + 1/8, 20 N over 4 m²), the steps end by stating the result plainly, as "12 × 15 = 180": never leave the answer for the student to finish.';

export function resolverSystem(a: ResolverAsk): string {
  const base = v8System(a);
  // After v8's block list and before its closing rules, so the block list still reads as the answer's order.
  const at = base.indexOf('\nRules: ');
  const extra = ['Besides those blocks, only these:', ...boardLines(), ...simLines(a), ...sourcesLines(a), SUM_LINE].join('\n');
  return at < 0 ? `${base}\n${extra}` : `${base.slice(0, at)}\n${extra}${base.slice(at)}`;
}

export const resolverUser = v8User;
