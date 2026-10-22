// Prompt v4 of the family.resolver profile (docs/family-app/08 §7; M2-8, C282). One change from v3: the model may add
// ONE interactive block (a graph, a number line, a fraction model, a geometry construction or an in-house simulation)
// where it materially helps a Mathematics or Science topic. The model fills fields only: a choice from a fixed set and
// bounded numbers. Our code (src/lib/family/blocks.ts, interactive.ts) checks every field and computes every value the
// child sees; a value out of range drops the block.
//
// Before: v3 offered explanation, worked_example, diagram, key_points, check, practice, english_moment, sources.
// After:  v4 offers the same, word for word, plus the five interactive blocks below, after the diagram line.
// Before-and-after example responses: test/m2/fixtures/resolver-v3-before.jsonl and resolver-v4-after.jsonl.
//
// Registered, not active: Control chooses v4 (control.ai_profiles.prompt_version) for it to go live.

import * as v3 from './v3';

export const RESOLVER_PROMPT_VERSION = 'v4';

export type { ResolverAsk, ResolverSubject } from './v3';

export const INTERACTIVE_LINES: readonly string[] = [
  'At most ONE of the following interactive blocks, and only for a Mathematics or Science topic where moving a value or seeing the shape materially helps the idea; otherwise none. Give numbers only, inside the stated ranges; never write the values the app works out (a period, a range, a current, an angle) anywhere: the app computes and shows them.',
  '{"type":"graph","title":"...","fn":"linear or quadratic or inverse","params":{"m":2,"c":1},"sliders":[{"param":"m","min":-5,"max":5,"step":0.5}],"xFrom":-10,"xTo":10} for y = m*x + c (params m, c), y = a*x^2 + b*x + c (params a, b, c; a not 0) or y = k/x (param k; k not 0). Every parameter and slider end between -20 and 20; 0 to 2 sliders, each on a different parameter whose starting value lies between its min and max; xFrom and xTo are optional, between -20 and 20.',
  '{"type":"number_line","title":"...","from":-5,"to":5,"step":1,"marks":[{"value":-2,"label":"A"}],"interval":{"from":-2,"to":3,"closedFrom":true,"closedTo":false}} with from and to between -1000 and 1000, at most 40 steps, up to 6 marks inside the line (label up to 12 characters, optional), and an optional interval whose ends say whether each end is included.',
  '{"type":"fraction_model","title":"...","shape":"bar or circle","fractions":[{"n":2,"d":3},{"n":3,"d":5}]} with 1 or 2 fractions of whole numbers, n from 0 to d, d from 1 to 24. With two fractions the app shows which is larger.',
  '{"type":"geometry","title":"...","shape":{"kind":"angle","degrees":60},"labels":["A","B","C"]} where shape is {"kind":"angle","degrees":between 1 and 359} or {"kind":"triangle","sides":[3,4,5]} (three lengths up to 1000 that can form a triangle) or {"kind":"circle","radius":5,"chord":6} (radius up to 1000; chord optional, at most 2 times the radius); labels optional, up to 3, each up to 12 characters.',
  '{"type":"simulation","title":"...","sim":"pendulum","values":{"length":1}} where sim and values are one of: pendulum {"length": 0.1 to 5 metres}; projectile {"speed": 1 to 50 m/s, "angle": 5 to 85 degrees}; ohms_law {"voltage": 1 to 24 volts, "resistance": 1 to 1000 ohms}; refraction {"n1": 1.0 to 2.5, "n2": 1.0 to 2.5, "incidence": 0 to 89 degrees}.',
];

// v3's lines with the interactive lines after the diagram line; nothing of v3 is changed or left out.
export function resolverSystem(a: v3.ResolverAsk): string {
  const lines = v3.resolverSystem(a).split('\n');
  const at = lines.findIndex((l) => l.startsWith('When a structure or process helps:'));
  if (at < 0) throw new Error('family.resolver v4: the v3 diagram line moved');
  return [...lines.slice(0, at + 1), ...INTERACTIVE_LINES, ...lines.slice(at + 1)].join('\n');
}

export const resolverUser = v3.resolverUser;
