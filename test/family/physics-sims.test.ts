import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checkBlock, isSimScene, type SimScene } from '@/lib/family/blocks';
import { SCENE_SIM_WORDS, sceneSimFits } from '@/lib/family/interactive';
import {
  CIRCUIT_OHMS,
  CIRCUIT_VOLTS,
  COIL_AMPS,
  COIL_TURNS,
  MAX_BULB_WATTS,
  MAX_CLIPS,
  SCENE_SIMS,
  SIM_TEMPLATES,
  ampereTurns,
  bulbBrightness,
  bulbPower,
  bulbVolts,
  circuitCurrent,
  circuitResistance,
  clipsLifted,
  magnetPair,
  motorDirections,
  relativeStrength,
  simReadout,
  simStart,
} from '@/lib/family/visuals/sims';
import { LATEST_RESOLVER_PROMPT, RESOLVER_PROMPTS, resolverPrompt } from '@/lib/ai/prompts/family.resolver';
import { SIM_KEYS, SKETCH_LINE, SIM_OFFERS, offeredSims, resolverSystem as v10System } from '@/lib/ai/prompts/family.resolver/v10';
import { resolverSystem as v9System } from '@/lib/ai/prompts/family.resolver/v9';
import type { ResolverAsk } from '@/lib/ai/prompts/family.resolver/v10';
import { SimView } from '@/components/family/blocks/SimView';
import { familyWords } from '@/lib/family/words';
import { UNDERSTAND_KEYS } from '@/lib/family/understand-words';

// W18-P2: the four physics simulations (circuit, dc_motor, electromagnet, magnet_field) and prompt v10. Our code computes
// every number; the model only names a key. Made-up content only.

const w = familyWords('en', UNDERSTAND_KEYS);
const hi = familyWords('hi', UNDERSTAND_KEYS);
const html = (el: ReturnType<typeof h>) => renderToStaticMarkup(el);
const NEW = ['circuit', 'dc_motor', 'electromagnet', 'magnet_field'] as const;
const scene = (sim: string, start?: Record<string, number>) => checkBlock({ type: 'scene', title: `A ${sim}`, sim, ...(start ? { start } : {}) }) as SimScene | null;
const draw = (b: SimScene, words = w) => html(h(SimView, { b, w: words, tone: 'science', still: true }));

describe('circuit', () => {
  it('series: R_total = 2R, one current, half the voltage on each bulb', () => {
    expect(circuitResistance('series', 6)).toBe(12);
    expect(circuitCurrent(12, 12)).toBe(1);
    expect(bulbVolts('series', 12)).toBe(6);
    expect(bulbPower(6, 6)).toBe(6);
  });

  it('parallel: R_total = R / 2, each bulb on the full voltage', () => {
    expect(circuitResistance('parallel', 6)).toBe(3);
    expect(circuitCurrent(12, 3)).toBe(4);
    expect(bulbVolts('parallel', 12)).toBe(12);
    expect(bulbPower(12, 6)).toBe(24);
  });

  it('the readout follows the choices, and parallel is brighter than series with the same V and R', () => {
    const s = simReadout('circuit', { arrangement: 1, voltage: 12, resistance: 6 });
    const p = simReadout('circuit', { arrangement: 2, voltage: 12, resistance: 6 });
    if (s.sim !== 'circuit' || p.sim !== 'circuit') throw new Error('wrong sim');
    expect(s).toMatchObject({ arrangement: 'series', totalOhms: 12, amps: 1, bulbVolts: 6, bulbAmps: 1, bulbWatts: 6 });
    expect(p).toMatchObject({ arrangement: 'parallel', totalOhms: 3, amps: 4, bulbVolts: 12, bulbAmps: 2, bulbWatts: 24 });
    // The battery's current is the sum of the two bulbs' currents in parallel.
    expect(p.amps).toBeCloseTo(2 * p.bulbAmps, 12);
    expect(p.brightness).toBeGreaterThan(s.brightness);
  });

  it('brightness is power as a share of the greatest, always between 0 and 1', () => {
    expect(MAX_BULB_WATTS).toBe(48);
    expect(bulbBrightness(48)).toBe(1);
    expect(bulbBrightness(24)).toBe(0.5);
    expect(bulbBrightness(-1)).toBe(0);
    for (const arrangement of [1, 2]) {
      for (const voltage of CIRCUIT_VOLTS) {
        for (const resistance of CIRCUIT_OHMS) {
          const r = simReadout('circuit', { arrangement, voltage, resistance });
          if (r.sim !== 'circuit') throw new Error('wrong sim');
          expect(r.brightness).toBeGreaterThan(0);
          expect(r.brightness).toBeLessThanOrEqual(1);
        }
      }
    }
    const top = simReadout('circuit', { arrangement: 2, voltage: 12, resistance: 3 });
    expect(top).toMatchObject({ brightness: 1 });
  });

  it('offers series or parallel, 3, 6, 9, 12 V and a resistance per bulb', () => {
    const t = SIM_TEMPLATES.circuit;
    expect(t.map((i) => i.name)).toEqual(['arrangement', 'voltage', 'resistance']);
    expect(t[0].choices.map((c) => c.id)).toEqual(['series', 'parallel']);
    expect(t[1].choices.map((c) => c.value)).toEqual([3, 6, 9, 12]);
    expect(t[2].unit).toBe('Ω');
  });
});

describe('dc_motor (Fleming\'s left-hand rule)', () => {
  it('forward current in a left-to-right field pushes the right side up: anticlockwise', () => {
    expect(motorDirections(1, 1)).toEqual({ right: 'up', left: 'down', rotation: 'anticlockwise' });
  });

  it('reversing the current or the field turns the coil the other way; reversing both does not', () => {
    expect(motorDirections(-1, 1)).toEqual({ right: 'down', left: 'up', rotation: 'clockwise' });
    expect(motorDirections(1, -1)).toEqual({ right: 'down', left: 'up', rotation: 'clockwise' });
    expect(motorDirections(-1, -1)).toEqual(motorDirections(1, 1));
  });

  it('the two sides are always pushed opposite ways', () => {
    for (const c of [1, -1]) for (const f of [1, -1]) expect(motorDirections(c, f).right).not.toBe(motorDirections(c, f).left);
  });

  it('the readout names the choices and the directions', () => {
    expect(simReadout('dc_motor', { current: -1, field: 1 })).toEqual({ sim: 'dc_motor', current: 'reverse', field: 'ltr', right: 'down', left: 'up', rotation: 'clockwise' });
    expect(simStart('dc_motor')).toEqual({ current: 1, field: 1 });
  });
});

describe('electromagnet', () => {
  it('strength is turns × current, as a share of the greatest (200 turns, 2 A)', () => {
    expect(ampereTurns(100, 2)).toBe(200);
    expect(relativeStrength(200, 2)).toBe(1);
    expect(relativeStrength(100, 2)).toBe(0.5);
    expect(relativeStrength(10, 0.5)).toBeCloseTo(0.0125, 10);
  });

  it('the clips rise with the strength from none to the most, and never fall', () => {
    expect(clipsLifted(0)).toBe(0);
    expect(clipsLifted(1)).toBe(MAX_CLIPS);
    expect(clipsLifted(2)).toBe(MAX_CLIPS);
    for (const turns of COIL_TURNS) for (const amps of COIL_AMPS) {
      const r = simReadout('electromagnet', { turns, current: amps });
      if (r.sim !== 'electromagnet') throw new Error('wrong sim');
      expect(r.strength).toBeGreaterThan(0);
      expect(r.strength).toBeLessThanOrEqual(1);
      expect(r.clips).toBeGreaterThanOrEqual(0);
      expect(r.clips).toBeLessThanOrEqual(MAX_CLIPS);
      expect(r.clips).toBe(clipsLifted(r.strength));
    }
    // More strength never lifts fewer clips.
    const steps = Array.from({ length: 101 }, (_, k) => clipsLifted(k / 100));
    for (let k = 1; k < steps.length; k++) expect(steps[k]).toBeGreaterThanOrEqual(steps[k - 1]);
  });

  it('offers 10, 50, 100, 200 turns and 0.5, 1, 2 A', () => {
    const t = SIM_TEMPLATES.electromagnet;
    expect(t[0].choices.map((c) => c.value)).toEqual([10, 50, 100, 200]);
    expect(t[1].choices.map((c) => c.value)).toEqual([0.5, 1, 2]);
    expect(simReadout('electromagnet', { turns: 200, current: 2 })).toMatchObject({ ampereTurns: 400, strength: 1, clips: MAX_CLIPS });
  });
});

describe('magnet_field', () => {
  it('one magnet has a field only; unlike poles facing attract; like poles facing repel', () => {
    expect(magnetPair(1)).toEqual({ magnets: 1, interaction: 'none', pattern: 'around' });
    expect(magnetPair(2)).toEqual({ magnets: 2, interaction: 'attract', pattern: 'join' });
    expect(magnetPair(3)).toEqual({ magnets: 2, interaction: 'repel', pattern: 'apart' });
  });

  it('the picture draws the pattern the choice names', () => {
    for (const [arrangement, pattern] of [[1, 'around'], [2, 'join'], [3, 'apart']] as const) {
      const b = scene('magnet_field', { arrangement })!;
      expect(draw(b)).toContain(`data-pattern="${pattern}"`);
    }
  });
});

describe('the scene block accepts the new keys, and refuses an unknown one', () => {
  it('lists them and checks them', () => {
    for (const sim of NEW) expect(SCENE_SIMS).toContain(sim);
    for (const sim of NEW) {
      const b = scene(sim);
      expect(b, sim).not.toBeNull();
      expect(isSimScene(b!)).toBe(true);
      expect(b!.sim).toBe(sim);
    }
    expect(scene('free_energy')).toBeNull();
    expect(scene('circuits')).toBeNull();
  });

  it('a starting value that is not a choice falls back to the template\'s', () => {
    expect(scene('circuit', { voltage: 9, resistance: 5 })!.start).toEqual({ arrangement: 1, voltage: 9, resistance: 6 });
    expect(scene('electromagnet', { turns: 100, current: 3 })!.start).toEqual({ turns: 100, current: 1 });
    expect(scene('dc_motor', { current: -1 })!.start).toEqual({ current: -1, field: 1 });
  });
});

describe('the pictures: every sim, every choice, in English and Hindi', () => {
  it('draws each with 44 px choices, the words filled and no number gone missing', () => {
    for (const sim of NEW) {
      const inputs = SIM_TEMPLATES[sim];
      // Every choice of the first input crossed with the start of the others, so each tap is drawn once.
      for (const input of inputs) {
        for (const c of input.choices) {
          const b = scene(sim, { [input.name]: c.value })!;
          for (const words of [w, hi]) {
            const out = draw(b, words);
            expect(out, `${sim} ${input.name}=${c.value}`).toContain(`data-sim="${sim}"`);
            expect(out).toContain('data-sim-picture');
            expect(out).not.toMatch(/\{[a-z]+\}|undefined|NaN|Infinity/);
            expect(out).toMatch(/min-h-\[44px\]/);
            // Still pictures: nothing animates, whatever the motion setting.
            expect(out).not.toContain('<animate');
          }
        }
      }
    }
  });

  it('shows the computed numbers with their units', () => {
    const c = draw(scene('circuit', { arrangement: 2, voltage: 12, resistance: 6 })!);
    expect(c).toContain('4 A');
    expect(c).toContain('data-brightness="0.500"');
    expect(draw(scene('circuit', { arrangement: 1, voltage: 12, resistance: 6 })!)).toContain('the same 1 A flows through both bulbs');
    expect(draw(scene('dc_motor', { current: 1, field: 1 })!)).toContain('the coil turns anticlockwise');
    const e = draw(scene('electromagnet', { turns: 100, current: 2 })!);
    expect(e).toContain('100 turns × 2 A = 200 ampere-turns');
    expect(e).toContain('about 6 paper clips');
    expect((e.match(/data-sim-clip/g) ?? []).length).toBe(6);
  });

  it('the bulbs\' fill opacity is the brightness', () => {
    const dim = draw(scene('circuit', { arrangement: 1, voltage: 3, resistance: 12 })!);
    const bright = draw(scene('circuit', { arrangement: 2, voltage: 12, resistance: 3 })!);
    const opacity = (s: string) => Number(/fill-opacity="([0-9.]+)"/.exec(s.slice(s.indexOf('data-sim-bulb')).replace(/fill-opacity="1"(?=[^>]*stroke)/, ''))?.[1]);
    expect(opacity(bright)).toBeGreaterThan(opacity(dim));
  });
});

describe('sceneSimFits', () => {
  it('fits English and Hindi words for each new simulation', () => {
    expect(sceneSimFits('circuit', 'Why does one bulb stay on in a parallel circuit?')).toBe(true);
    expect(sceneSimFits('circuit', 'बल्ब श्रेणी क्रम में जुड़े हैं तो धारा कितनी होगी')).toBe(true);
    expect(sceneSimFits('circuit', 'परिपथ क्या है')).toBe(true);
    expect(sceneSimFits('dc_motor', 'How does an electric motor turn? Fleming\'s left-hand rule')).toBe(true);
    expect(sceneSimFits('dc_motor', 'मोटर कैसे घूमती है')).toBe(true);
    expect(sceneSimFits('dc_motor', 'कुंडली पर बल')).toBe(true);
    expect(sceneSimFits('electromagnet', 'How do I make an electromagnet with a coil and a nail?')).toBe(true);
    expect(sceneSimFits('electromagnet', 'विद्युत चुंबक कैसे बनता है')).toBe(true);
    expect(sceneSimFits('magnet_field', 'Draw the field lines of a bar magnet')).toBe(true);
    expect(sceneSimFits('magnet_field', 'Do like poles attract or repel?')).toBe(true);
    expect(sceneSimFits('magnet_field', 'चुंबक के ध्रुव')).toBe(true);
    expect(sceneSimFits('magnet_field', 'ध्रुव आकर्षण और प्रतिकर्षण')).toBe(true);
  });

  it('refuses a question about something else', () => {
    for (const sim of NEW) {
      expect(sceneSimFits(sim, 'How does the heart pump blood?'), sim).toBe(false);
      expect(sceneSimFits(sim, 'दिल खून कैसे पंप करता है'), sim).toBe(false);
    }
  });

  it('leaves the Class 8 simulations ungated, as they were', () => {
    for (const sim of ['pressure_depth', 'friction_surface', 'sound_wave'] as const) {
      expect(SCENE_SIM_WORDS[sim]).toBeUndefined();
      expect(sceneSimFits(sim, 'anything')).toBe(true);
    }
  });
});

describe('prompt v10', () => {
  const base: ResolverAsk = { board: 'CBSE', classLevel: 6, subject: 'science', openSubjects: ['science'], classSubjects: ['mathematics', 'science'], chapter: null, topic: null, question: 'How do I light a bulb with a cell?', language: 'en', style: 'en', followUp: null, misconception: null };

  it('is registered next to v9 and is the code\'s fallback; v9 is still there, untouched', () => {
    const versions = RESOLVER_PROMPTS.map((p) => p.version);
    expect(versions).toContain('v9');
    expect(versions.indexOf('v10')).toBe(versions.indexOf('v9') + 1);
    expect(RESOLVER_PROMPTS.find((p) => p.version === 'v10')).toMatchObject({ namesSubject: true, usesPlan: true });
    expect(LATEST_RESOLVER_PROMPT).toBe('v10');
    expect(resolverPrompt(null, true).version).toBe('v10');
    expect(resolverPrompt('v99', false).version).toBe('v10');
    expect(resolverPrompt('v10', false).version).toBe('v10');
    // Control's choice of v9 is honoured: the fallback only applies when the row names no version the code has.
    expect(resolverPrompt('v9', false).version).toBe('v9');
    expect(resolverPrompt('v9', true).version).toBe('v9');
  });

  it('puts the sketch line in only when the ask is a sketch', () => {
    expect(SKETCH_LINE).toBe('When the student sends a sketch (a drawing of their own, marked "sketch" in the request), answer with a board that annotates it: highlight the part that matters, an arrow to what to change, a short label; two or three commands, then the words.');
    expect(v10System({ ...base, sketch: true })).toContain(SKETCH_LINE);
    expect(v10System({ ...base, sketch: false })).not.toContain(SKETCH_LINE);
    expect(v10System(base)).not.toContain(SKETCH_LINE);
    expect(resolverPrompt('v10', false).system({ ...base, sketch: true })).toContain(SKETCH_LINE);
  });

  it('is v9 apart from the simulation lines and the sketch line', () => {
    // A Maths ask has no simulation lines in either, so the two texts match exactly.
    const maths = { ...base, subject: 'mathematics' };
    expect(v10System(maths)).toBe(v9System(maths));
    expect(v10System({ ...maths, sketch: true })).toBe(`${v9System(maths).replace('\nRules: ', `\n${SKETCH_LINE}\nRules: `)}`);
  });

  it('offers simulations by class and subject, each with its "when"', () => {
    const six = offeredSims(base);
    expect(six).toContain('circuit');
    expect(six).toContain('magnet_field');
    expect(six).not.toContain('pressure_depth');
    const sixText = v10System(base);
    expect(sixText).toContain('"sim":"circuit|magnet_field"');
    for (const k of six) expect(sixText).toContain(`${k}: ${SIM_OFFERS[k].what} (when: ${SIM_OFFERS[k].when})`);

    const eight = offeredSims({ ...base, classLevel: 8 });
    expect(eight).toEqual(expect.arrayContaining(['pressure_depth', 'friction_surface', 'sound_wave']));
    const eightText = v10System({ ...base, classLevel: 8 });
    expect(eightText).toContain('pressure_depth:');
    expect(eightText).toContain('friction_surface:');
    expect(eightText).toContain('sound_wave:');
    expect(sixText).not.toContain('friction_surface:');

    const ten = offeredSims({ ...base, classLevel: 10 });
    expect(ten).toEqual(expect.arrayContaining(['circuit', 'dc_motor', 'electromagnet', 'magnet_field']));
    expect(offeredSims({ ...base, classLevel: 7 })).toEqual(expect.arrayContaining(['circuit', 'electromagnet']));

    expect(offeredSims({ ...base, subject: 'mathematics' })).toEqual([]);
    expect(offeredSims({ ...base, subject: 'social_science' })).toEqual([]);
    expect(offeredSims({ ...base, classLevel: 5 })).toEqual([]);
    expect(offeredSims({ ...base, classLevel: 11 })).toEqual([]);
    expect(offeredSims({ ...base, subject: null })).toContain('circuit');
    expect(v10System({ ...base, subject: 'mathematics' })).not.toContain('"type":"scene","title":"≤60","sim"');
  });

  it('every simulation key a scene can name has an offer, so none is unreachable, and the prompt\'s key list is the scene\'s', () => {
    expect([...SIM_KEYS]).toEqual([...SCENE_SIMS]);
    for (const k of SCENE_SIMS) expect(SIM_OFFERS[k].classes.length, k).toBeGreaterThan(0);
  });
});
