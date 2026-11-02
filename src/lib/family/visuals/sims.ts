// Three Class 8 Science simulations (W16-A2, docs/39 §6), named by key in a `scene` block: {"type":"scene","title":"…",
// "sim":"pressure_depth"}. The model picks the key and, at most, a starting choice; everything shown is computed here.
// The physics is the chapter's, as plain formulas, and every choice a child can tap is a fixed value from this file:
//   - pressure_depth (Force and Pressure): a liquid presses more the deeper you go. Pressure from the water at a depth
//     h is p = ρ × g × h (water: ρ = 1000 kg/m³; g = 9.8 m/s²). A hole lower in a bottle spurts water farther: the
//     water leaves it at v = √(2 × g × h).
//   - friction_surface (Friction): a rougher surface has more friction, so a moving thing stops sooner. With the
//     friction coefficient μ of the surface, a thing sliding at speed v stops in d = v² ÷ (2 × μ × g). The μ values are
//     the usual round figures for a rubber tyre (dry road 0.7, wet road 0.4, ice 0.1).
//   - sound_wave (Sound): frequency is the number of vibrations each second, in hertz; the time for one vibration is
//     T = 1 ÷ f; a higher frequency is a higher pitch; loudness goes with the square of the amplitude (twice the
//     amplitude, four times as loud). Humans hear from about 20 Hz to 20,000 Hz.
// Pure: no database, no network, no words (the screen takes its words from the family words file by these ids).

export const G = 9.8;
export const WATER_DENSITY = 1000;
export const HEARING_MIN_HZ = 20;
export const HEARING_MAX_HZ = 20_000;

export const SCENE_SIMS = ['pressure_depth', 'friction_surface', 'sound_wave'] as const;
export type SceneSim = (typeof SCENE_SIMS)[number];

// One input: its choices (an id for the words file, and the value used in the formula) and the one shown first.
export type SimChoice = { id: string; value: number };
export type SimInput = { name: string; unit: string; choices: readonly SimChoice[]; start: number };
export const SIM_TEMPLATES: Record<SceneSim, readonly SimInput[]> = {
  pressure_depth: [{ name: 'depth', unit: 'm', start: 2, choices: [1, 2, 3, 4, 5].map((v) => ({ id: `d${v}`, value: v })) }],
  friction_surface: [
    { name: 'surface', unit: '', start: 0.7, choices: [{ id: 'dry', value: 0.7 }, { id: 'wet', value: 0.4 }, { id: 'ice', value: 0.1 }] },
    { name: 'speed', unit: 'm/s', start: 10, choices: [{ id: 's5', value: 5 }, { id: 's10', value: 10 }] },
  ],
  sound_wave: [
    { name: 'frequency', unit: 'Hz', start: 200, choices: [100, 200, 400, 800].map((v) => ({ id: `f${v}`, value: v })) },
    { name: 'amplitude', unit: '', start: 1, choices: [1, 2, 3].map((v) => ({ id: `a${v}`, value: v })) },
  ],
};

// ---- the formulas ----

// Pressure from a liquid at a depth (pascals): p = ρ × g × h.
export const liquidPressure = (depthM: number, density = WATER_DENSITY, g = G): number => density * g * depthM;
// The speed water leaves a hole at that depth (m/s): v = √(2 × g × h).
export const spurtSpeed = (depthM: number, g = G): number => Math.sqrt(2 * g * depthM);
// The distance a thing sliding at v stops in on a surface with friction coefficient μ (metres): d = v² ÷ (2 × μ × g).
export const stoppingDistance = (speed: number, mu: number, g = G): number => (speed * speed) / (2 * mu * g);
// The time for one vibration (seconds): T = 1 ÷ f.
export const soundPeriod = (hz: number): number => 1 / hz;
// How many times louder than amplitude 1: loudness goes with amplitude².
export const relativeLoudness = (amplitude: number): number => amplitude * amplitude;
export const audible = (hz: number): boolean => hz >= HEARING_MIN_HZ && hz <= HEARING_MAX_HZ;

// ---- the choices ----

// The starting values: the template's, with any the block names that is one of its choices.
export function simStart(sim: SceneSim, given: Record<string, unknown> = {}): Record<string, number> {
  const out: Record<string, number> = {};
  for (const input of SIM_TEMPLATES[sim]) {
    const v = given[input.name];
    out[input.name] = typeof v === 'number' && input.choices.some((c) => c.value === v) ? v : input.start;
  }
  return out;
}

// What the simulation shows for these values (each number rounded only where it is shown).
export type SimReadout =
  | { sim: 'pressure_depth'; depth: number; pascals: number; spurt: number }
  | { sim: 'friction_surface'; mu: number; speed: number; metres: number }
  | { sim: 'sound_wave'; hz: number; amplitude: number; period: number; loudness: number; audible: boolean };

export function simReadout(sim: SceneSim, values: Record<string, number>): SimReadout {
  const v = simStart(sim, values);
  switch (sim) {
    case 'pressure_depth':
      return { sim, depth: v.depth, pascals: liquidPressure(v.depth), spurt: spurtSpeed(v.depth) };
    case 'friction_surface':
      return { sim, mu: v.surface, speed: v.speed, metres: stoppingDistance(v.speed, v.surface) };
    case 'sound_wave':
      return { sim, hz: v.frequency, amplitude: v.amplitude, period: soundPeriod(v.frequency), loudness: relativeLoudness(v.amplitude), audible: audible(v.frequency) };
  }
}

// The largest value a readout takes over every choice (the picture's scale, so the bars compare across taps).
export function simMax(sim: SceneSim): number {
  const t = SIM_TEMPLATES[sim];
  if (sim === 'pressure_depth') return liquidPressure(Math.max(...t[0].choices.map((c) => c.value)));
  if (sim === 'friction_surface') return stoppingDistance(Math.max(...t[1].choices.map((c) => c.value)), Math.min(...t[0].choices.map((c) => c.value)));
  return relativeLoudness(Math.max(...t[1].choices.map((c) => c.value)));
}
