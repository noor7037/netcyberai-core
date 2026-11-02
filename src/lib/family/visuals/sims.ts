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
// W18-P2 adds four on electricity and magnets (Classes 6, 7 and 10), the same way:
//   - circuit: two identical bulbs on a battery, in series or in parallel. Series: R_total = 2R, the one current
//     I = V ÷ R_total passes both bulbs, each gets V ÷ 2. Parallel: R_total = R ÷ 2, I = V ÷ R_total = 2V ÷ R, each bulb
//     gets the whole V and its own current V ÷ R. A bulb's power is P = V_bulb² ÷ R and its brightness is that power as a
//     share (0 to 1) of the most any choice gives, so the brighter bulb is the one with more power, not a made-up scale.
//   - dc_motor: Fleming's left-hand rule on the two sides of a coil in a field. The force on a side is F = I × B (the
//     direction of current × field); the two sides carry opposite currents, so the forces are opposite and turn the coil.
//     Forward current is out of the page in the right-hand side of the coil and into the page in the left-hand side.
//     Field left to right (N on the left, S on the right) is +x. Force on the right side is up when current and field
//     signs agree, down when not; the coil turns anticlockwise when the right side goes up, clockwise when it goes down.
//   - electromagnet: strength goes with turns × current (ampere-turns); shown as a share (0 to 1) of the greatest the
//     choices give. The paper clips lifted are an illustration, a simple rising count, never a measurement.
//   - magnet_field: field lines run outside a magnet from the N pole to the S pole. Unlike poles facing attract and the
//     lines join the two magnets; like poles facing repel and the lines bend away from each other. Only the picture's
//     lines and the words attract/repel come from here; there is no number.
// Pure: no database, no network, no words (the screen takes its words from the family words file by these ids).

export const G = 9.8;
export const WATER_DENSITY = 1000;
export const HEARING_MIN_HZ = 20;
export const HEARING_MAX_HZ = 20_000;

export const SCENE_SIMS = ['pressure_depth', 'friction_surface', 'sound_wave', 'circuit', 'dc_motor', 'electromagnet', 'magnet_field'] as const;
export type SceneSim = (typeof SCENE_SIMS)[number];

// One input: its choices (an id for the words file, and the value used in the formula) and the one shown first.
export type SimChoice = { id: string; value: number };
// `words`: the choices are named in words (series, forward, …) rather than shown as numbers with the unit.
export type SimInput = { name: string; unit: string; choices: readonly SimChoice[]; start: number; words?: boolean };

// ---- the electricity and magnet choices ----
export const BULB_COUNT = 2;
export const CIRCUIT_VOLTS = [3, 6, 9, 12] as const;
export const CIRCUIT_OHMS = [3, 6, 12] as const;
export const COIL_TURNS = [10, 50, 100, 200] as const;
export const COIL_AMPS = [0.5, 1, 2] as const;
// The most paper clips the picture shows; the strongest choice lifts this many.
export const MAX_CLIPS = 12;
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
  circuit: [
    { name: 'arrangement', unit: '', start: 1, words: true, choices: [{ id: 'series', value: 1 }, { id: 'parallel', value: 2 }] },
    { name: 'voltage', unit: 'V', start: 6, choices: CIRCUIT_VOLTS.map((v) => ({ id: `v${v}`, value: v })) },
    { name: 'resistance', unit: 'Ω', start: 6, choices: CIRCUIT_OHMS.map((v) => ({ id: `r${v}`, value: v })) },
  ],
  dc_motor: [
    { name: 'current', unit: '', start: 1, words: true, choices: [{ id: 'forward', value: 1 }, { id: 'reverse', value: -1 }] },
    { name: 'field', unit: '', start: 1, words: true, choices: [{ id: 'ltr', value: 1 }, { id: 'rtl', value: -1 }] },
  ],
  electromagnet: [
    { name: 'turns', unit: '', start: 50, choices: COIL_TURNS.map((v) => ({ id: `n${v}`, value: v })) },
    { name: 'current', unit: 'A', start: 1, choices: COIL_AMPS.map((v) => ({ id: `i${String(v).replace('.', '_')}`, value: v })) },
  ],
  magnet_field: [{ name: 'arrangement', unit: '', start: 1, words: true, choices: [{ id: 'one', value: 1 }, { id: 'unlike', value: 2 }, { id: 'like', value: 3 }] }],
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

// ---- electricity and magnets ----

// Two identical bulbs of resistance R on a battery of V volts. Series (1): R_total = 2R. Parallel (2): R_total = R ÷ 2.
export type Arrangement = 'series' | 'parallel';
export const arrangementOf = (value: number): Arrangement => (value === 2 ? 'parallel' : 'series');
export const circuitResistance = (arrangement: Arrangement, ohms: number): number => (arrangement === 'series' ? BULB_COUNT * ohms : ohms / BULB_COUNT);
// I = V ÷ R_total (amperes): the current the battery gives.
export const circuitCurrent = (volts: number, totalOhms: number): number => volts / totalOhms;
// The voltage across one bulb: half in series, all in parallel.
export const bulbVolts = (arrangement: Arrangement, volts: number): number => (arrangement === 'series' ? volts / BULB_COUNT : volts);
// P = V² ÷ R, watts, for one bulb.
export const bulbPower = (voltsAcross: number, ohms: number): number => (voltsAcross * voltsAcross) / ohms;
// The most power one bulb gets over every choice (parallel, the highest V, the lowest R): the scale of the brightness.
export const MAX_BULB_WATTS = bulbPower(Math.max(...CIRCUIT_VOLTS), Math.min(...CIRCUIT_OHMS));
// Brightness 0 to 1: this bulb's power as a share of the most any choice gives.
export const bulbBrightness = (watts: number): number => Math.min(1, Math.max(0, watts / MAX_BULB_WATTS));

// Fleming's left-hand rule on a coil: sign of the current (+1 forward, -1 reverse) × sign of the field (+1 left to
// right, -1 right to left). Positive: the right side is pushed up, the left side down, and the coil turns anticlockwise.
export type Vertical = 'up' | 'down';
export type Turning = 'anticlockwise' | 'clockwise';
export function motorDirections(currentSign: number, fieldSign: number): { right: Vertical; left: Vertical; rotation: Turning } {
  const positive = Math.sign(currentSign) * Math.sign(fieldSign) > 0;
  return positive ? { right: 'up', left: 'down', rotation: 'anticlockwise' } : { right: 'down', left: 'up', rotation: 'clockwise' };
}

// Ampere-turns: the electromagnet's strength goes with turns × current.
export const ampereTurns = (turns: number, amps: number): number => turns * amps;
export const MAX_AMPERE_TURNS = ampereTurns(Math.max(...COIL_TURNS), Math.max(...COIL_AMPS));
// Strength 0 to 1: a share of the greatest the choices give.
export const relativeStrength = (turns: number, amps: number): number => ampereTurns(turns, amps) / MAX_AMPERE_TURNS;
// An illustration, not a measurement: the clips lifted rise with the strength, from none to MAX_CLIPS.
export const clipsLifted = (strength: number): number => Math.round(Math.min(1, Math.max(0, strength)) * MAX_CLIPS);

// What two bar magnets do: one magnet only has its field; unlike poles facing attract; like poles facing repel.
export type MagnetPair = { magnets: 1 | 2; interaction: 'none' | 'attract' | 'repel'; pattern: 'around' | 'join' | 'apart' };
export function magnetPair(arrangement: number): MagnetPair {
  if (arrangement === 2) return { magnets: 2, interaction: 'attract', pattern: 'join' };
  if (arrangement === 3) return { magnets: 2, interaction: 'repel', pattern: 'apart' };
  return { magnets: 1, interaction: 'none', pattern: 'around' };
}

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
  | { sim: 'sound_wave'; hz: number; amplitude: number; period: number; loudness: number; audible: boolean }
  | { sim: 'circuit'; arrangement: Arrangement; volts: number; ohms: number; totalOhms: number; amps: number; bulbVolts: number; bulbAmps: number; bulbWatts: number; brightness: number }
  | { sim: 'dc_motor'; current: 'forward' | 'reverse'; field: 'ltr' | 'rtl'; right: Vertical; left: Vertical; rotation: Turning }
  | { sim: 'electromagnet'; turns: number; amps: number; ampereTurns: number; strength: number; clips: number }
  | ({ sim: 'magnet_field'; arrangement: number } & MagnetPair);

export function simReadout(sim: SceneSim, values: Record<string, number>): SimReadout {
  const v = simStart(sim, values);
  switch (sim) {
    case 'pressure_depth':
      return { sim, depth: v.depth, pascals: liquidPressure(v.depth), spurt: spurtSpeed(v.depth) };
    case 'friction_surface':
      return { sim, mu: v.surface, speed: v.speed, metres: stoppingDistance(v.speed, v.surface) };
    case 'sound_wave':
      return { sim, hz: v.frequency, amplitude: v.amplitude, period: soundPeriod(v.frequency), loudness: relativeLoudness(v.amplitude), audible: audible(v.frequency) };
    case 'circuit': {
      const arrangement = arrangementOf(v.arrangement);
      const total = circuitResistance(arrangement, v.resistance);
      const amps = circuitCurrent(v.voltage, total);
      const across = bulbVolts(arrangement, v.voltage);
      const watts = bulbPower(across, v.resistance);
      // Each bulb's own current: the whole current in series, half of it each in parallel (= across ÷ R either way).
      return { sim, arrangement, volts: v.voltage, ohms: v.resistance, totalOhms: total, amps, bulbVolts: across, bulbAmps: across / v.resistance, bulbWatts: watts, brightness: bulbBrightness(watts) };
    }
    case 'dc_motor': {
      const d = motorDirections(v.current, v.field);
      return { sim, current: v.current > 0 ? 'forward' : 'reverse', field: v.field > 0 ? 'ltr' : 'rtl', right: d.right, left: d.left, rotation: d.rotation };
    }
    case 'electromagnet': {
      const strength = relativeStrength(v.turns, v.current);
      return { sim, turns: v.turns, amps: v.current, ampereTurns: ampereTurns(v.turns, v.current), strength, clips: clipsLifted(strength) };
    }
    case 'magnet_field':
      return { sim, arrangement: v.arrangement, ...magnetPair(v.arrangement) };
  }
}

// The largest value a readout takes over every choice (the picture's scale, so the bars compare across taps).
export function simMax(sim: SceneSim): number {
  const t = SIM_TEMPLATES[sim];
  if (sim === 'pressure_depth') return liquidPressure(Math.max(...t[0].choices.map((c) => c.value)));
  if (sim === 'friction_surface') return stoppingDistance(Math.max(...t[1].choices.map((c) => c.value)), Math.min(...t[0].choices.map((c) => c.value)));
  if (sim === 'circuit') return MAX_BULB_WATTS;
  if (sim === 'electromagnet') return MAX_AMPERE_TURNS;
  if (sim === 'dc_motor' || sim === 'magnet_field') return 1;
  return relativeLoudness(Math.max(...t[1].choices.map((c) => c.value)));
}
