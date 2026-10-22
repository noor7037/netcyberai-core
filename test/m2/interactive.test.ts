import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkBlock, completeResponse, parseBlockLine, type Block } from '@/lib/family/blocks';
import {
  chord,
  circleArea,
  circumference,
  compareFractions,
  equationText,
  graphPoints,
  graphY,
  isTriangle,
  ohmsCurrent,
  pendulumPeriod,
  projectile,
  refraction,
  triangleAngles,
} from '@/lib/family/interactive';
import { INTERACTIVE_KEYS } from '@/lib/family/interactive-words';
import { UNDERSTAND_KEYS } from '@/lib/family/understand-words';
import { LATEST_RESOLVER_PROMPT, RESOLVER_PROMPTS, resolverPrompt } from '@/lib/ai/prompts/family.resolver';
import * as v3 from '@/lib/ai/prompts/family.resolver/v3';
import * as v4 from '@/lib/ai/prompts/family.resolver/v4';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';

// M2-8 (C282): interactive diagrams and in-house simulations. The model fills fields only; our code checks each field
// (a value out of range, an unknown type or kind drops the block; unknown fields are dropped) and computes every value
// shown. Expected numbers below are worked by hand, not taken from the code under test.

const close = (got: number, want: number, places = 3) => expect(got).toBeCloseTo(want, places);

const GRAPH = { type: 'graph', title: 'A line', fn: 'linear', params: { m: 2, c: 1 }, sliders: [{ param: 'm', min: -5, max: 5, step: 0.5 }] };
const LINE = { type: 'number_line', title: 'Where -2 sits', from: -5, to: 5, step: 1, marks: [{ value: -2, label: 'A' }], interval: { from: -2, to: 3, closedFrom: true, closedTo: false } };
const FRACTIONS = { type: 'fraction_model', title: 'Which is more?', shape: 'bar', fractions: [{ n: 2, d: 3 }, { n: 3, d: 5 }] };
const TRIANGLE = { type: 'geometry', title: 'A right triangle', shape: { kind: 'triangle', sides: [3, 4, 5] }, labels: ['A', 'B', 'C'] };
const PENDULUM = { type: 'simulation', title: 'A swinging pendulum', sim: 'pendulum', values: { length: 1 } };

describe('validation: good input kept, extra fields dropped', () => {
  it('keeps each good block, with only its own fields', () => {
    for (const raw of [GRAPH, LINE, FRACTIONS, TRIANGLE, PENDULUM]) {
      const b = checkBlock({ ...raw, html: '<script>x</script>', code: 'alert(1)' }) as Record<string, unknown> | null;
      expect(b, raw.type).not.toBeNull();
      expect(b).not.toHaveProperty('html');
      expect(b).not.toHaveProperty('code');
    }
    const g = checkBlock({ ...GRAPH, params: { m: 2, c: 1, evil: 5 }, sliders: [{ param: 'm', min: -5, max: 5, step: 0.5, onChange: 'x' }] }) as Extract<Block, { type: 'graph' }>;
    expect(g.params).toEqual({ m: 2, c: 1 });
    expect(g.sliders).toEqual([{ param: 'm', min: -5, max: 5, step: 0.5 }]);
    expect(g.xFrom).toBe(-10);
    expect(g.xTo).toBe(10);
    const s = checkBlock({ ...PENDULUM, values: { length: 1, g: 20 } }) as Extract<Block, { type: 'simulation' }>;
    expect(s.values).toEqual({ length: 1 });
    // Text fields stay plain text.
    expect((checkBlock({ ...TRIANGLE, title: '<b>Tri</b>angle', labels: ['<i>A</i>'] }) as Extract<Block, { type: 'geometry' }>).labels).toEqual(['A']);
  });

  it('drops an unknown type or kind', () => {
    expect(checkBlock({ type: 'phet', title: 'x', sim: 'pendulum' })).toBeNull();
    expect(checkBlock({ ...GRAPH, fn: 'cubic' })).toBeNull();
    expect(checkBlock({ ...PENDULUM, sim: 'rocket' })).toBeNull();
    expect(checkBlock({ ...TRIANGLE, shape: { kind: 'hexagon', sides: [1, 1, 1] } })).toBeNull();
    expect(checkBlock({ ...FRACTIONS, shape: 'star' })).toBeNull();
  });

  it('drops a block with a value out of range or of the wrong kind', () => {
    // graph
    expect(checkBlock({ ...GRAPH, params: { m: 21, c: 1 } })).toBeNull();
    expect(checkBlock({ ...GRAPH, params: { m: '2', c: 1 } })).toBeNull();
    expect(checkBlock({ ...GRAPH, params: { m: 2 } })).toBeNull();
    expect(checkBlock({ ...GRAPH, fn: 'quadratic', params: { a: 0, b: 1, c: 1 } })).toBeNull();
    expect(checkBlock({ ...GRAPH, fn: 'inverse', params: { k: 0 } })).toBeNull();
    expect(checkBlock({ ...GRAPH, sliders: [{ param: 'm', min: 3, max: 5, step: 0.5 }] })).toBeNull(); // start outside the slider
    expect(checkBlock({ ...GRAPH, sliders: [{ param: 'k', min: -5, max: 5, step: 1 }] })).toBeNull(); // not a parameter of y = mx + c
    expect(checkBlock({ ...GRAPH, sliders: [1, 2, 3].map(() => ({ param: 'm', min: -5, max: 5, step: 1 })) })).toBeNull(); // more than 2
    expect(checkBlock({ ...GRAPH, xFrom: -30 })).toBeNull();
    // number line
    expect(checkBlock({ ...LINE, step: 0.1 })).toBeNull(); // 100 steps
    expect(checkBlock({ ...LINE, marks: [{ value: 9 }] })).toBeNull();
    expect(checkBlock({ ...LINE, interval: { from: 3, to: -2, closedFrom: true, closedTo: false } })).toBeNull();
    expect(checkBlock({ ...LINE, interval: { from: -2, to: 3, closedFrom: 'yes', closedTo: false } })).toBeNull();
    // fractions
    expect(checkBlock({ ...FRACTIONS, fractions: [{ n: 5, d: 4 }] })).toBeNull();
    expect(checkBlock({ ...FRACTIONS, fractions: [{ n: 1, d: 25 }] })).toBeNull();
    expect(checkBlock({ ...FRACTIONS, fractions: [{ n: 1.5, d: 3 }] })).toBeNull();
    expect(checkBlock({ ...FRACTIONS, fractions: [{ n: 1, d: 2 }, { n: 1, d: 3 }, { n: 1, d: 4 }] })).toBeNull();
    // geometry
    expect(checkBlock({ ...TRIANGLE, shape: { kind: 'triangle', sides: [1, 2, 3] } })).toBeNull(); // 1 + 2 is not more than 3
    expect(checkBlock({ ...TRIANGLE, shape: { kind: 'triangle', sides: [1, 2, 10] } })).toBeNull();
    expect(checkBlock({ ...TRIANGLE, shape: { kind: 'angle', degrees: 360 } })).toBeNull();
    expect(checkBlock({ ...TRIANGLE, shape: { kind: 'circle', radius: 5, chord: 11 } })).toBeNull(); // longer than the diameter
    // simulations
    expect(checkBlock({ ...PENDULUM, values: { length: 6 } })).toBeNull();
    expect(checkBlock({ type: 'simulation', title: 't', sim: 'projectile', values: { speed: 20, angle: 90 } })).toBeNull();
    expect(checkBlock({ type: 'simulation', title: 't', sim: 'ohms_law', values: { voltage: 230, resistance: 10 } })).toBeNull();
    expect(checkBlock({ type: 'simulation', title: 't', sim: 'refraction', values: { n1: 0.9, n2: 1.5, incidence: 30 } })).toBeNull();
    expect(checkBlock({ type: 'simulation', title: 't', sim: 'refraction', values: { n1: 1.5, n2: 1, incidence: 30 } })).not.toBeNull();
  });

  it('keeps at most one interactive block per response', () => {
    const base = readFileSync(path.join(__dirname, 'fixtures/resolver-v3-before.jsonl'), 'utf8').trim().split('\n').map(parseBlockLine);
    const extra = [GRAPH, LINE, PENDULUM].map((x) => checkBlock(x)!);
    const kept = completeResponse([...(base as Block[]), ...extra])!;
    expect(kept.filter((b) => ['graph', 'number_line', 'fraction_model', 'geometry', 'simulation'].includes(b.type)).map((b) => b.type)).toEqual(['graph']);
  });
});

describe('the maths and physics, against hand-worked values', () => {
  it('pendulum period T = 2π√(L/g), g = 9.8', () => {
    close(pendulumPeriod(1), 2.00709); // 2π × √(1/9.8) = 2π × 0.319438
    close(pendulumPeriod(2.45), Math.PI); // √(2.45/9.8) = 0.5
  });

  it('projectile: range, peak and flight time with no air resistance', () => {
    const p = projectile(20, 45); // sin 90° = 1, sin² 45° = 0.5
    close(p.range, 40.8163); // 400 / 9.8
    close(p.peak, 10.2041); // 400 × 0.5 / 19.6
    close(p.flightTime, 2.88615); // 2 × 20 × 0.707107 / 9.8
    const q = projectile(10, 30);
    close(q.range, 8.83699); // 100 × 0.866025 / 9.8
    close(q.peak, 1.27551); // 100 × 0.25 / 19.6
  });

  it("Ohm's law I = V/R", () => {
    expect(ohmsCurrent(12, 4)).toBe(3);
    close(ohmsCurrent(9, 1000), 0.009, 6);
  });

  it("Snell's law, the critical angle and total internal reflection", () => {
    const r = refraction(1, 1.5, 30); // sin r = 0.5 / 1.5
    close(r.refracted!, 19.4712);
    expect(r.critical).toBeNull();
    expect(r.totalInternal).toBe(false);
    const glass = refraction(1.5, 1, 30); // sin r = 0.75
    close(glass.refracted!, 48.5904);
    close(glass.critical!, 41.8103); // asin(2/3)
    const tir = refraction(1.5, 1, 45); // 1.5 × 0.7071 = 1.06 > 1
    expect(tir.totalInternal).toBe(true);
    expect(tir.refracted).toBeNull();
    expect(refraction(1.33, 1.33, 40).refracted).toBeCloseTo(40, 6);
  });

  it('triangle angles by the cosine rule, and the triangle inequality', () => {
    const [A, B, C] = triangleAngles(3, 4, 5);
    close(A, 36.8699);
    close(B, 53.1301);
    close(C, 90);
    triangleAngles(7, 7, 7).forEach((x) => close(x, 60));
    expect(isTriangle(3, 4, 5)).toBe(true);
    expect(isTriangle(1, 2, 3)).toBe(false);
  });

  it('fraction comparison by cross-multiplying', () => {
    expect(compareFractions({ n: 2, d: 3 }, { n: 3, d: 5 })).toBe(1); // 10 > 9
    expect(compareFractions({ n: 3, d: 5 }, { n: 2, d: 3 })).toBe(-1);
    expect(compareFractions({ n: 1, d: 2 }, { n: 2, d: 4 })).toBe(0);
    expect(compareFractions({ n: 7, d: 24 }, { n: 1, d: 3 })).toBe(-1); // 21 < 24
  });

  it('circle and chord', () => {
    close(circumference(7), 43.9823);
    close(circleArea(7), 153.938);
    const c = chord(5, 8); // half-chord 4: distance √(25 − 16) = 3; angle 2·asin(0.8)
    close(c.fromCentre, 3);
    close(c.centralAngle, 106.2602);
  });

  it('graph values and equation text', () => {
    expect(graphY('linear', { m: 2, c: 1 }, 3)).toBe(7);
    expect(graphY('quadratic', { a: 1, b: -3, c: 2 }, 2)).toBe(0);
    expect(graphY('inverse', { k: 6 }, 0)).toBeNull();
    expect(graphY('inverse', { k: 6 }, 3)).toBe(2);
    expect(graphPoints('inverse', { k: 1 }, -10, 10, 161).filter((p) => p === null)).toHaveLength(1);
    expect(equationText('linear', { m: 2, c: 1 })).toBe('y = 2x + 1');
    expect(equationText('quadratic', { a: 1, b: -3, c: 0 })).toBe('y = x² − 3x');
    expect(equationText('linear', { m: -1, c: -4 })).toBe('y = −x − 4');
    expect(equationText('inverse', { k: 6 })).toBe('y = 6/x');
  });
});

describe('prompt v4: registered, not active', () => {
  it('is registered and used only when Control chooses it by name', () => {
    expect(RESOLVER_PROMPTS.map((p) => p.version)).toContain('v4');
    expect(resolverPrompt('v4', false).version).toBe('v4');
    expect(resolverPrompt('v4', true).version).toBe('v4');
    // Never the fallback: an unknown or missing choice stays on v3.
    expect(LATEST_RESOLVER_PROMPT).toBe('v3');
    expect(resolverPrompt(null, true).version).toBe('v3');
    expect(resolverPrompt('v9', false).version).toBe('v3');
    expect(resolverPrompt('v1', true).version).toBe('v3');
  });

  it('is v3 word for word plus the interactive lines', () => {
    const ask: v3.ResolverAsk = { board: 'CBSE', classLevel: 9, subject: 'mathematics', openSubjects: [], classSubjects: [], chapter: 'Linear equations', topic: 'Graphs', question: null, language: 'en', style: 'en', followUp: null, misconception: null };
    const before = v3.resolverSystem(ask).split('\n');
    const after = v4.resolverSystem(ask).split('\n');
    expect(after.filter((l) => !v4.INTERACTIVE_LINES.includes(l))).toEqual(before);
    expect(after.length).toBe(before.length + v4.INTERACTIVE_LINES.length);
    expect(after.join('\n')).toContain('At most ONE');
    expect(v4.resolverUser(ask)).toBe(v3.resolverUser(ask));
  });

  it('the before-and-after samples pass the block checks', () => {
    const read = (f: string) => readFileSync(path.join(__dirname, 'fixtures', f), 'utf8').trim().split('\n');
    const before = read('resolver-v3-before.jsonl').map(parseBlockLine);
    const after = read('resolver-v4-after.jsonl').map(parseBlockLine);
    expect(before.every((b) => b !== null)).toBe(true);
    expect(after.every((b) => b !== null)).toBe(true);
    expect(completeResponse(before as Block[])?.map((b) => b.type)).toEqual(['explanation', 'worked_example', 'check', 'practice']);
    expect(completeResponse(after as Block[])?.map((b) => b.type)).toEqual(['explanation', 'worked_example', 'graph', 'check', 'practice']);
  });
});

describe('words', () => {
  it('every interactive word is in English and Hindi and picked for Understand', () => {
    for (const k of INTERACTIVE_KEYS) {
      expect(en[k], k).toBeTruthy();
      expect(hi[k], k).toBeTruthy();
      expect(UNDERSTAND_KEYS).toContain(k);
    }
  });
});
