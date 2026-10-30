import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checkBlock, checkStoredBlock, completeResponse, type Block, type Chart, type MindMap, type Scene, type Steps } from '@/lib/family/blocks';
import { checkPlan, defaultPlan, isInteractiveBlock, MATHS_VISUALS, QUESTION_TYPES, withContentVisuals, type Plan } from '@/lib/ai/teaching/plan-shape';
import { planPrompt } from '@/lib/ai/prompts/family.plan';
import { CHART_EXAMPLE, CHART_LINE, CHART_RULES, SCENE_EXAMPLE, SCENE_LINE, SCENE_RULES, type ResolverAsk } from '@/lib/ai/prompts/family.resolver/v8';
import { resolverPrompt } from '@/lib/ai/prompts/family.resolver';
import { placeScene, SceneView, SCENE_W } from '@/components/family/blocks/SceneView';
import { ChartView, niceTicks, piePercents } from '@/components/family/blocks/ChartView';
import { StepsView } from '@/components/family/blocks/StepsView';
import { MindMapView } from '@/components/family/blocks/MindMapView';
import { BLOCK_TONE } from '@/components/family/blocks/BlockViews';
import { familyWords } from '@/lib/family/words';
import { UNDERSTAND_KEYS } from '@/lib/family/understand-words';

// W10-6 (docs/39 §5): the scene and the chart, checked by blocks.ts and drawn by our own code; the planner's rules
// that match the visual to the content; the resolver's lines. Made-up content only.

const MOTOR: Scene = {
  type: 'scene',
  title: 'An electric motor',
  layout: 'row',
  parts: [
    { id: 'cell', label: 'Battery', text: 'The battery pushes a current through the coil.', shape: 'rect', colour: 1 },
    { id: 'coil', label: 'Coil', text: 'The current in the coil makes it a magnet, so it turns between the poles.', shape: 'coil', colour: 2 },
    { id: 'magnet', label: 'Magnet', text: 'The magnet pushes on the coil and keeps it turning.', shape: 'magnet', colour: 3 },
  ],
  links: [
    { from: 'cell', to: 'coil', kind: 'flow', label: 'current' },
    { from: 'magnet', to: 'coil', kind: 'line' },
  ],
  animate: 'rotate',
};
const BARS: Chart = { type: 'chart', title: 'Days in three months', kind: 'bar', unit: 'days', labels: ['January', 'February', 'April'], series: [{ label: 'Days', values: [31, 28, 30] }] };
const w = familyWords('en', UNDERSTAND_KEYS);
const html = (el: ReturnType<typeof h>) => renderToStaticMarkup(el);
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

describe('the checker: scene and chart (docs/39 §5)', () => {
  it('accepts each as written; a scene without motion reads as none; steps keep animate: true', () => {
    expect(checkBlock(MOTOR)).toEqual(MOTOR);
    expect(checkBlock(BARS)).toEqual(BARS);
    const { animate: _a, ...still } = MOTOR;
    expect(checkBlock(still)).toEqual({ ...MOTOR, animate: 'none' });
    expect(checkBlock({ ...BARS, unit: '' })).toEqual({ ...BARS, unit: '' });
    expect(checkStoredBlock(MOTOR)).toEqual(MOTOR);
    const steps = { type: 'steps', title: 'Add 27 and 15', items: [{ label: 'Ones', text: '7 + 5 = 12: write 2, carry 1.' }, { label: 'Tens', text: '2 + 1 + 1 = 4.' }, { label: 'Answer', text: '42.' }] };
    expect(checkBlock({ ...steps, animate: true })).toEqual({ ...steps, animate: true });
    expect(checkBlock({ ...steps, animate: 'yes' })).toEqual(steps);
  });

  it('drops a scene over any limit whole', () => {
    const bad: ((s: Scene) => void)[] = [
      (s) => (s.parts = s.parts.slice(0, 1)),
      (s) => (s.parts = Array.from({ length: 13 }, (_, i) => ({ ...s.parts[0], id: `p${i}` }))),
      (s) => (s.parts[1].id = 'cell'),
      (s) => (s.parts[0].id = 'has space'),
      (s) => (s.parts[0].label = 'x'.repeat(31)),
      (s) => (s.parts[0].text = 'x'.repeat(221)),
      (s) => (s.parts[0].colour = 0),
      (s) => (s.parts[0].colour = 9),
      (s) => (s.parts[0].colour = 1.5),
      (s) => ((s.parts[0] as { shape: string }).shape = 'star'),
      (s) => ((s as { layout: string }).layout = 'grid'),
      (s) => ((s as { animate: string }).animate = 'spin'),
      (s) => (s.title = 'x'.repeat(61)),
      (s) => (s.links[0].to = 'ghost'),
      (s) => (s.links[0].to = s.links[0].from),
      (s) => ((s.links[0] as { kind: string }).kind = 'zigzag'),
      (s) => (s.links[0].label = 'x'.repeat(21)),
    ];
    for (const change of bad) {
      const s = clone(MOTOR);
      change(s);
      expect(checkBlock(s), change.toString()).toBeNull();
    }
  });

  it('drops a chart over any limit whole', () => {
    const bad: ((c: Chart) => void)[] = [
      (c) => ((c.labels = ['One']), (c.series[0].values = [1])),
      (c) => ((c.labels = Array.from({ length: 13 }, (_, i) => `L${i}`)), (c.series[0].values = Array(13).fill(1))),
      (c) => (c.series = [1, 2, 3, 4].map((k) => ({ label: `S${k}`, values: [1, 2, 3] }))),
      (c) => (c.series = []),
      (c) => (c.series[0].values = [1, Number.NaN, 3]),
      (c) => (c.series[0].values = [1, Number.POSITIVE_INFINITY, 3]),
      (c) => ((c.series[0] as { values: unknown[] }).values = [1, '2', 3]),
      (c) => (c.series[0].values = [1, 2]),
      (c) => (c.labels[0] = 'x'.repeat(13)),
      (c) => (c.unit = 'x'.repeat(13)),
      (c) => (c.series[0].label = 'x'.repeat(21)),
      (c) => ((c as { kind: string }).kind = 'donut'),
      (c) => ((c.kind = 'pie'), (c.series[0].values = [3, -1, 2])),
      (c) => ((c.kind = 'pie'), (c.series[0].values = [0, 0, 0])),
      (c) => ((c.kind = 'pie'), c.series.push({ label: 'More', values: [1, 2, 3] })),
    ];
    for (const change of bad) {
      const c = clone(BARS);
      change(c);
      expect(checkBlock(c), change.toString()).toBeNull();
    }
  });

  it('places the scene after the figure and the chart after the key points', () => {
    const blocks = [
      { type: 'check', items: [] },
      BARS,
      { type: 'key_points', points: ['One'] },
      MOTOR,
      { type: 'figure', title: 'A cell', kind: 'schematic', shape: 'cell', labels: [] },
      { type: 'explanation', title: 'x', idea: 'x', example: 'x', steps: [], terms: [] },
    ] as unknown as Block[];
    expect(completeResponse(blocks, ['explanation'])!.map((b) => b.type)).toEqual(['explanation', 'figure', 'scene', 'key_points', 'chart', 'check']);
  });
});

describe('the planner: the visual matches the content (founder, 30 Oct)', () => {
  const ctx = (classLevel: number, subject: string | null) => ({ classLevel, subject, lang: 'en' as const });
  const plan = (o: Record<string, unknown>, c = ctx(7, 'science')) => checkPlan(JSON.stringify({ questionType: 'concept', band: 'c6_8', depth: 'medium', blocks: ['explanation', 'check', 'practice'], visuals: [], lang: 'en', ...o }), c);

  it('gives a Mathematics plan without a visual its steps; keeps one it has', () => {
    const r = plan({ questionType: 'problem', blocks: ['explanation', 'worked_example', 'check'] }, ctx(7, 'mathematics'));
    expect(r.fromModel).toBe(true);
    expect(r.plan.blocks).toEqual(['explanation', 'steps', 'worked_example', 'check']);
    expect(plan({ questionType: 'problem', blocks: ['explanation', 'number_line', 'check'] }, ctx(7, 'mathematics')).plan.blocks).toEqual(['explanation', 'number_line', 'check']);
    // Even a short answer, and every type of question.
    for (const t of QUESTION_TYPES) expect(plan({ questionType: t, depth: 'short' }, ctx(9, 'mathematics')).plan.blocks.some((b) => MATHS_VISUALS.includes(b)), t).toBe(true);
    expect(defaultPlan(ctx(7, 'mathematics')).blocks).toContain('steps');
  });

  it('gives history a timeline, a process its stages, a comparison of numbers a chart', () => {
    expect(plan({ questionType: 'history' }, ctx(8, 'history')).plan.blocks).toEqual(['explanation', 'timeline', 'check', 'practice']);
    expect(plan({ questionType: 'process' }).plan.blocks).toContain('timeline');
    // A process already shown as a step strip keeps it.
    expect(plan({ questionType: 'process', blocks: ['explanation', 'steps', 'check'] }).plan.blocks).toEqual(['explanation', 'steps', 'check']);
    expect(plan({ questionType: 'comparison', hasNumbers: true }).plan.blocks).toEqual(['explanation', 'chart', 'check', 'practice']);
    expect(plan({ questionType: 'comparison' }).plan.blocks).not.toContain('chart');
    expect(defaultPlan(ctx(8, 'history'), 'medium', 'history').blocks).toContain('timeline');
  });

  it('gives a thing with parts a scene, and any other concept a mind map or its figure', () => {
    expect(plan({ hasParts: true }).plan.blocks).toEqual(['explanation', 'scene', 'check', 'practice']);
    // The compact keys: p a thing with parts, n numbers compared.
    expect(checkPlan(JSON.stringify({ t: 'experiment', b: 'c6_8', d: 'medium', k: ['explanation', 'check'], l: 'en', p: true }), ctx(7, 'science')).plan.blocks).toContain('scene');
    expect(checkPlan(JSON.stringify({ t: 'comparison', b: 'c6_8', d: 'medium', k: ['explanation', 'check'], l: 'en', n: true }), ctx(7, 'science')).plan.blocks).toContain('chart');
    // A definition with parts is not asked as a thing with parts; a flag that is not true reads as false.
    expect(plan({ questionType: 'definition', hasParts: true }).plan.blocks).not.toContain('scene');
    expect(plan({ hasParts: 'yes' }).plan.blocks).toEqual(['explanation', 'mind_map', 'check', 'practice']);
    expect(plan({ blocks: ['explanation', 'figure', 'check'] }).plan.blocks).toEqual(['explanation', 'figure', 'check']);
    // A concept already drawn (here, the scene its visual asks for) gets no mind map on top.
    expect(plan({ visuals: [{ kind: 'scene', about: 'the parts of a flower' }] }).plan).toMatchObject({ blocks: ['explanation', 'check', 'practice', 'scene'], visuals: [{ kind: 'scene', about: 'the parts of a flower' }] });
  });

  it('never adds an interactive block, and LKG to Class 1 keeps its one picture', () => {
    for (const t of QUESTION_TYPES)
      for (const subject of ['mathematics', 'science', 'biology', 'history', null])
        for (const flags of [{ hasParts: true, hasNumbers: true }, { hasParts: false, hasNumbers: false }]) {
          const added = withContentVisuals(['explanation', 'check'], t, subject, flags).filter((b) => b !== 'explanation' && b !== 'check');
          expect(added.some(isInteractiveBlock), `${t} ${subject}`).toBe(false);
        }
    expect(plan({ hasParts: true }, ctx(1, 'science')).plan.blocks).toEqual(['explanation', 'image', 'check']);
  });

  it('the plan prompt names the new kinds and the two flags', () => {
    const s = planPrompt(null).system({ board: 'CBSE', classLevel: 7, band: 'c6_8', subject: null, chapter: null, question: 'How does a motor work?', passageTitles: [] });
    expect(s).toContain('|scene|chart>');
    expect(s).toContain('"p":true|false,"n":true|false');
    expect(s).toContain('p = true when the question is about a thing with parts');
  });
});

describe('the resolver v8 lines', () => {
  const base: ResolverAsk = { board: 'CBSE', classLevel: 7, subject: 'science', openSubjects: ['science'], classSubjects: ['science'], chapter: null, topic: null, question: 'How does a motor work?', language: 'en', style: 'en', followUp: null, misconception: null };
  const p = (blocks: Plan['blocks']): Plan => ({ questionType: 'concept', band: 'c6_8', depth: 'medium', blocks, visuals: [], lang: 'en' });

  it('asks for the scene and the chart in their exact shapes only when the plan names them, with examples that pass the checker', () => {
    const v8 = resolverPrompt('v8', false);
    const s = v8.system({ ...base, plan: p(['explanation', 'scene', 'chart', 'check']) });
    for (const line of [SCENE_LINE, CHART_LINE, SCENE_EXAMPLE, CHART_EXAMPLE, SCENE_RULES, CHART_RULES]) expect(s).toContain(line);
    expect(s).toContain('real parts with their real names');
    expect(s).toContain('by part, never by decoration');
    expect(s).toContain('only from the chapter passages above or well-known facts that the answer also states in words');
    const plain = v8.system({ ...base, plan: p(['explanation', 'check']) });
    expect(plain).not.toContain('"type":"scene"');
    expect(plain).not.toContain('"type":"chart"');
    expect(checkBlock(JSON.parse(SCENE_EXAMPLE))).not.toBeNull();
    expect(checkBlock(JSON.parse(CHART_EXAMPLE))).not.toBeNull();
  });
});

describe('the views (390 first; motion off under reduced motion)', () => {
  it('draws every part with its label in its own colour, laid out by our code', () => {
    const out = html(h(SceneView, { b: MOTOR, w, tone: 'science', still: true }));
    for (const part of MOTOR.parts) {
      expect(out).toContain(`data-scene-part="${part.id}"`);
      expect(out).toContain(`aria-label="${part.label}"`);
    }
    expect(out).toContain('data-block="scene"');
    expect(out).toContain('Tap a part to read what it does.');
    for (const layout of ['row', 'ring', 'stack', 'free'] as const) {
      const placed = placeScene({ ...MOTOR, layout });
      // Inside the picture, and every tap target at least 84 units across (over 44 px at 390).
      for (const q of placed.parts) {
        expect(q.cx).toBeGreaterThan(0);
        expect(q.cx).toBeLessThan(SCENE_W);
        expect(Math.min(q.box.w, q.box.h)).toBeGreaterThanOrEqual(84);
      }
    }
  });

  it('a tap opens the part\'s text below and highlights the part', () => {
    const out = html(h(SceneView, { b: MOTOR, w, tone: 'science', still: true, initial: 'coil' }));
    expect(out).toContain('data-scene-text');
    expect(out).toContain(MOTOR.parts[1].text);
    expect(out).toMatch(/aria-pressed="true"[^>]*data-scene-part="coil"/);
    expect(out).not.toContain('Tap a part to read what it does.');
  });

  it('under reduced motion renders without animation; with motion, flow, pulse and rotate move what they name', () => {
    const still = html(h(SceneView, { b: MOTOR, w, tone: 'science', still: true }));
    expect(still).not.toMatch(/fam-scene-|<animate/);
    const moving = html(h(SceneView, { b: MOTOR, w, tone: 'science', still: false }));
    expect(moving.match(/fam-scene-rotate/g)).toHaveLength(1);
    expect(moving).toContain('type="rotate"');
    // The motor's current flows while its rotor turns; a plain line never moves.
    expect(moving.match(/class="fam-scene-flow"/g)).toHaveLength(1);
    expect(html(h(SceneView, { b: { ...MOTOR, animate: 'flow' }, w, tone: 'science', still: false })).match(/class="fam-scene-flow"/g)).toHaveLength(1);
    expect(html(h(SceneView, { b: { ...MOTOR, animate: 'pulse' }, w, tone: 'science', still: false })).match(/fam-scene-pulse/g)).toHaveLength(3);
    // The first paint is still (the browser has not yet said motion is fine).
    expect(html(h(SceneView, { b: MOTOR, w, tone: 'science' }))).not.toMatch(/fam-scene-|<animate/);
    const steps: Steps = { type: 'steps', title: 'Add 27 and 15', animate: true, items: [{ label: 'Ones', text: '7 + 5 = 12.' }, { label: 'Tens', text: '2 + 1 + 1 = 4.' }, { label: 'Answer', text: '42.' }] };
    expect(html(h(StepsView, { b: steps, tone: 'mathematics', w, still: true }))).not.toMatch(/fam-reveal|data-steps-replay/);
    const revealing = html(h(StepsView, { b: steps, tone: 'mathematics', w, still: false }));
    expect(revealing.match(/fam-reveal/g)).toHaveLength(3);
    expect(revealing).toContain('animation:nca-pop 400ms ease-out 600ms both');
    expect(revealing).toContain('Play again');
    const map: MindMap = { type: 'mind_map', title: 'Fractions', root: 'Fractions', branches: [{ label: 'Parts', leaves: [] }, { label: 'Wholes', leaves: [] }] };
    expect(html(h(MindMapView, { b: map, w, tone: 'mathematics', still: true }))).not.toContain('fam-reveal');
    expect(html(h(MindMapView, { b: map, w, tone: 'mathematics', still: false })).match(/fam-reveal/g)).toHaveLength(4);
  });

  it('draws a chart from the values, with its unit, legend and caption; pie percentages add to 100', () => {
    const bars = html(h(ChartView, { b: BARS, w, tone: 'mathematics' }));
    expect(bars.match(/data-chart-bar/g)).toHaveLength(3);
    expect(bars).toContain('Unit: days');
    expect(bars).toContain('Figures as given in this answer');
    expect(bars).not.toContain('data-chart-legend');
    const two = html(h(ChartView, { b: { ...BARS, kind: 'line', series: [...BARS.series, { label: 'Leap year', values: [31, 29, 30] }] }, w, tone: 'mathematics' }));
    expect(two).toContain('data-chart-legend');
    expect(two.match(/data-chart-line/g)).toHaveLength(2);
    for (const values of [[1, 1, 1], [31, 28, 30], [1, 2, 3, 4, 5, 6, 7], [0.1, 0.2, 99.7], [5, 0]]) expect(piePercents(values).reduce((a, b) => a + b, 0), values.join()).toBe(100);
    expect(piePercents([1, 1, 1])).toEqual([34, 33, 33]);
    const pie = html(h(ChartView, { b: { ...BARS, kind: 'pie' }, w, tone: 'mathematics' }));
    expect(pie.match(/data-chart-slice/g)).toHaveLength(3);
    const shown = [...pie.matchAll(/data-chart-percent="true">(\d+)%/g)].map((m) => Number(m[1]));
    expect(shown.reduce((a, b) => a + b, 0)).toBe(100);
    expect(niceTicks(0, 31)).toEqual([0, 10, 20, 30, 40]);
    expect(niceTicks(-3, 7)).toEqual([-4, -2, 0, 2, 4, 6, 8]);
    expect(BLOCK_TONE.scene.bar).toBe('border-l-grape');
    expect(BLOCK_TONE.chart.bar).toBe('border-l-cyan');
  });
});
