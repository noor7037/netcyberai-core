// Prompt v10 of the family.resolver profile (W18-P2): v9, word for word, except two things.
//   - The simulations: v9 offered the Class 8 Science ones (pressure, friction, sound) only. v10 offers them for Science
//     in Classes 6 to 10, each with a one-line "when" (the chapter topics it fits), now including four on electricity and
//     magnets (circuit, dc_motor, electromagnet, magnet_field; src/lib/family/visuals/sims.ts). The model only picks a
//     key where the topic matches; our code draws the simulation and works out every number, and simFits-style gating
//     (src/lib/family/interactive.ts, sceneSimFits) drops a simulation the question is not about.
//   - The sketch rule: when the student sends a drawing of their own, the answer is a board that annotates it. Included
//     only when the ask says so (`sketch: true`).
// v9's JSON shape, plan, bands, board, sources and sum rules are reused as they are; v9 itself is untouched.
//
// Control keeps v9 as the active version until the founder switches it (no migration: control.ai_profiles is unchanged).
// v10 is the code-only fallback the founder asked for: the version used when the database row names no version the code
// has (see index.ts).

import { resolverSystem as v8System, resolverUser as v8User, type ResolverAsk as V8Ask } from './v8';
import { BOARD_LINE, boardLines, sourcesLines, SUM_LINE } from './v9';

export const RESOLVER_PROMPT_VERSION = 'v10';
// v8's request, plus whether the student's message is a sketch of their own.
export type ResolverAsk = V8Ask & { sketch?: boolean };
export { BOARD_LINE };

// The sketch rule, as the founder gave it.
export const SKETCH_LINE =
  'When the student sends a sketch (a drawing of their own, marked "sketch" in the request), answer with a board that annotates it: highlight the part that matters, an arrow to what to change, a short label; two or three commands, then the words.';

// The scene simulations by key. The Family app is a bounded module (docs/family-app/03 §14), so the prompt does not import
// src/lib/family/visuals/sims.ts; the key list is repeated here and test/family/physics-sims.test.ts keeps the two equal.
export const SIM_KEYS = ['pressure_depth', 'friction_surface', 'sound_wave', 'circuit', 'dc_motor', 'electromagnet', 'magnet_field'] as const;
export type SceneSim = (typeof SIM_KEYS)[number];

// What each simulation is for and when to pick it: the classes it belongs to and the chapter topics it fits.
type SimOffer = { classes: readonly number[]; what: string; when: string };
export const SIM_OFFERS: Record<SceneSim, SimOffer> = {
  circuit: { classes: [6, 7, 10], what: 'two bulbs in series or in parallel on a battery: current and brightness', when: 'electricity and circuits: a cell or battery, bulbs in series and parallel, current and voltage' },
  dc_motor: { classes: [10], what: 'a coil in a magnetic field: the forces on it and the way it turns', when: 'the electric motor and Fleming\'s left-hand rule (magnetic effects of electric current)' },
  electromagnet: { classes: [7, 10], what: 'a coil round a nail: turns and current give the strength and the paper clips it lifts', when: 'the electromagnet, and the magnetic effect of a current in a coil' },
  magnet_field: { classes: [6, 10], what: 'a bar magnet\'s field lines, and two magnets attracting or repelling', when: 'magnets: poles, attraction and repulsion, magnetic field lines' },
  pressure_depth: { classes: [8], what: 'pressure and depth in a liquid', when: 'pressure in liquids (Force and Pressure)' },
  friction_surface: { classes: [8], what: 'the surface and how soon a moving thing stops', when: 'friction on rough and smooth surfaces' },
  sound_wave: { classes: [8], what: 'frequency and pitch, amplitude and loudness', when: 'sound: pitch, loudness, vibrations' },
};

const SCIENCE = /^(science|physics)$/;
// The simulations offered to this ask: Science only (or a subject still to be named), by class.
export function offeredSims(a: Pick<ResolverAsk, 'subject' | 'classLevel'>): SceneSim[] {
  const science = a.subject === null || SCIENCE.test(a.subject);
  if (!science) return [];
  return SIM_KEYS.filter((k) => SIM_OFFERS[k].classes.includes(a.classLevel));
}

// The scene's simulation line: only the keys offered to this class.
export const simLine = (keys: readonly SceneSim[]): string => `{"type":"scene","title":"≤60","sim":"${keys.join('|')}"}`;

export function simLines(a: ResolverAsk): string[] {
  const keys = offeredSims(a);
  if (keys.length === 0) return [];
  return [
    `For Science, when the scene is about one of these topics, write the scene as a simulation instead of parts: ${simLine(keys)}. Pick a key only when its topic is what the question is about; otherwise write the scene as parts. Our code draws it and works out every number.`,
    ...keys.map((k) => `   ${k}: ${SIM_OFFERS[k].what} (when: ${SIM_OFFERS[k].when})`),
  ];
}

export function resolverSystem(a: ResolverAsk): string {
  const base = v8System(a);
  // After v8's block list and before its closing rules, so the block list still reads as the answer's order.
  const at = base.indexOf('\nRules: ');
  const extra = ['Besides those blocks, only these:', ...boardLines(), ...simLines(a), ...sourcesLines(a), SUM_LINE, ...(a.sketch === true ? [SKETCH_LINE] : [])].join('\n');
  return at < 0 ? `${base}\n${extra}` : `${base.slice(0, at)}\n${extra}${base.slice(at)}`;
}

export const resolverUser = v8User;
