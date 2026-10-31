import { describe, expect, it } from 'vitest';
import { BANDS, PLAN_BLOCKS, QUESTION_TYPES, bandOf, blocksFor, checkPlan, defaultPlan, interactiveAllowed, isInteractiveBlock, type Plan } from '@/lib/ai/teaching/plan-shape';
import { PLAN_MAX_TOKENS, planAnswer } from '@/lib/ai/teaching/plan';
import { planPrompt } from '@/lib/ai/prompts/family.plan';
import { PROFILES } from '@/lib/ai/platform';
import type { PreparedText } from '@/lib/ai/platform';

// W9-B: the teaching plan's checker (docs/39 §3 "Plan"). Every field against its enum; the band from the child's class
// (one band down at most, never up); an interactive block only for a problem, process or experiment in Mathematics or
// Science; any failure gives the band's default plan; the planner never blocks an answer.

const ctx = (classLevel: number, subject: string | null = 'science', lang: 'en' | 'hi' = 'en') => ({ classLevel, subject, lang });
const good = (o: Partial<Record<keyof Plan, unknown>> = {}) => JSON.stringify({ questionType: 'concept', band: 'c6_8', depth: 'medium', blocks: ['explanation', 'figure', 'check', 'practice'], visuals: [{ kind: 'figure', about: 'a leaf cell' }], lang: 'en', ...o });

describe('bands', () => {
  it('come from the class', () => {
    expect([1, 2, 5, 6, 8, 9, 10, 11, 12].map(bandOf)).toEqual(['lkg_1', 'c2_5', 'c2_5', 'c6_8', 'c6_8', 'c9_10', 'c9_10', 'c11_12', 'c11_12']);
    expect(bandOf(-1)).toBe('lkg_1');
  });
});

describe('checkPlan', () => {
  it('keeps a plan whose every field is in its enum', () => {
    const r = checkPlan(good(), ctx(7));
    expect(r.fromModel).toBe(true);
    expect(r.plan).toEqual({ questionType: 'concept', band: 'c6_8', depth: 'medium', blocks: ['explanation', 'figure', 'check', 'practice'], visuals: [{ kind: 'figure', about: 'a leaf cell' }], lang: 'en' });
    // Wrapped in a code fence or a sentence, the object is still read.
    expect(checkPlan('Here is the plan:\n```json\n' + good() + '\n```', ctx(7)).fromModel).toBe(true);
  });

  it('returns the default plan for the band on any failure', () => {
    const fails = [
      'not json',
      good({ questionType: 'riddle' }),
      good({ band: 'c13' }),
      good({ depth: 'deep' }),
      good({ lang: 'fr' }),
      good({ blocks: [] }),
      good({ blocks: ['explanation', 'poem'] }),
      good({ blocks: 'explanation' }),
      good({ visuals: [{ kind: 'hologram', about: 'x' }] }),
      good({ visuals: [{ kind: 'figure', about: 'x'.repeat(81) }] }),
      good({ visuals: 'figure' }),
      JSON.stringify([1, 2]),
    ];
    for (const raw of fails) {
      const r = checkPlan(raw, ctx(3));
      expect(r.fromModel, raw).toBe(false);
      expect(r.plan, raw).toEqual(defaultPlan(ctx(3)));
    }
    // W10-6: the default plan carries the visual its content calls for (a concept: a mind map).
    expect(defaultPlan(ctx(3))).toEqual({ questionType: 'concept', band: 'c2_5', depth: 'medium', blocks: ['explanation', 'mind_map', ...blocksFor('c2_5', 'medium').slice(1)], visuals: [], lang: 'en' });
    // No default carries an interactive block.
    for (const band of BANDS) for (const depth of ['short', 'medium', 'full'] as const) expect(blocksFor(band, depth).some(isInteractiveBlock)).toBe(false);
  });

  it('forces the band from the class: never up, one band down at most', () => {
    expect(checkPlan(good({ band: 'c11_12' }), ctx(3)).plan.band).toBe('c2_5');
    expect(checkPlan(good({ band: 'c9_10' }), ctx(11)).plan.band).toBe('c9_10');
    expect(checkPlan(good({ band: 'c2_5' }), ctx(11)).plan.band).toBe('c11_12');
    expect(checkPlan(good({ band: 'lkg_1' }), ctx(7)).plan.band).toBe('c6_8');
    // The language is the child's.
    expect(checkPlan(good({ lang: 'en' }), ctx(7, 'science', 'hi')).plan.lang).toBe('hi');
  });

  it('allows an interactive block only for a problem, process or experiment in Mathematics or Science', () => {
    const sim = (questionType: string, subject: string | null) => checkPlan(good({ questionType, blocks: ['explanation', 'simulation', 'graph', 'check'] }), ctx(9, subject)).plan.blocks;
    expect(sim('problem', 'physics')).toEqual(['explanation', 'simulation', 'check', 'figure']);
    expect(sim('experiment', 'science')).toContain('simulation');
    expect(sim('process', 'mathematics')).toContain('simulation');
    // A biology question never gets a pendulum, whatever its type.
    for (const t of QUESTION_TYPES) expect(sim(t, 'biology').some(isInteractiveBlock), t).toBe(false);
    expect(sim('concept', 'physics').some(isInteractiveBlock)).toBe(false);
    expect(sim('history', 'history').some(isInteractiveBlock)).toBe(false);
    expect(interactiveAllowed('problem', 'english')).toBe(false);
    // A typed question whose subject the answer names: the type decides here, the prompt holds the subject half.
    expect(interactiveAllowed('problem', null)).toBe(true);
  });

  it('always explains and checks; short is one explanation, its visual and one check; LKG to Class 1 keeps one picture', () => {
    expect(checkPlan(good({ blocks: ['worked_example'] }), ctx(9)).plan.blocks).toEqual(['explanation', 'worked_example', 'check', 'figure']);
    // W10-6: a short answer is never plain text alone: a concept keeps a mind map.
    expect(checkPlan(good({ depth: 'short' }), ctx(9)).plan).toMatchObject({ blocks: ['explanation', 'mind_map', 'check'], visuals: [] });
    expect(checkPlan(good({ blocks: ['explanation', 'worked_example', 'practice', 'mind_map'] }), ctx(1)).plan.blocks).toEqual(['explanation', 'figure', 'check']);
    expect(checkPlan(good({ blocks: ['explanation', 'timeline', 'check'], visuals: [{ kind: 'timeline', about: 'the 1857 revolt' }, { kind: 'video', about: 'a short video' }] }), ctx(8, 'history')).plan.blocks).toEqual(['explanation', 'timeline', 'check', 'videos']);
    expect(PLAN_BLOCKS).toEqual(expect.arrayContaining(['figure', 'steps', 'timeline', 'image', 'videos']));
  });
});

describe('planAnswer', () => {
  const call = (text: string | null): PreparedText => ({
    send: async () => ({ result: text === null ? { ok: false, reason: 'failed' } : { ok: true, text, tokensIn: 10, tokensOut: 10, provider: 'p', model: 'm' }, record: async () => {} }),
  });

  it('uses the default plan when the workload has no route or the call fails, so the answer still comes', async () => {
    expect(await planAnswer(ctx(7), null)).toEqual({ plan: defaultPlan(ctx(7)), fromModel: false, sent: null });
    const failed = await planAnswer(ctx(7), call(null));
    expect(failed.fromModel).toBe(false);
    expect(failed.plan).toEqual(defaultPlan(ctx(7)));
    const thrown = await planAnswer(ctx(7), { send: async () => Promise.reject(new Error('x')) });
    expect(thrown.plan).toEqual(defaultPlan(ctx(7)));
    const ok = await planAnswer(ctx(7), call(good({ questionType: 'process' })));
    expect(ok).toMatchObject({ fromModel: true, plan: { questionType: 'process', band: 'c6_8' } });
  });

  it('is a children\'s-words family profile that takes no daily place, with a registered prompt', () => {
    expect(PROFILES.find((p) => p.id === 'family.plan')).toMatchObject({ carriesChildWords: true, capability: 'text', audience: 'family', besideCall: true });
    const p = planPrompt(null);
    expect(p.version).toBe('v1');
    const a = { board: 'CBSE', classLevel: 7, band: 'c6_8' as const, subject: null, chapter: null, question: 'Why is the sky blue?', passageTitles: [] };
    expect(p.system(a)).toContain('band is c6_8');
    expect(p.user(a)).toContain('"Why is the sky blue?"');
  });
});

// W10 (latency): the plan came back cut at 297 of 300 tokens on a verbose model; the answer now uses one-letter keys
// (documented in the prompt) under a 600-token limit, and the checker reads both shapes.
describe('the compact plan (W10)', () => {
  const a = { board: 'CBSE', classLevel: 7, band: 'c6_8' as const, subject: null, chapter: null, question: 'Why is the sky blue?', passageTitles: [] };

  it('the prompt asks for the short keys and says what each means', () => {
    const system = planPrompt(null).system(a);
    expect(system).toContain('{"t":"<one of');
    expect(system).toContain('"v":[{"k":"<one of');
    expect(system).toMatch(/t = the question type, b = the band, d = the depth, k = the blocks, v = the visuals \(k = its kind, a = what it shows\), l = the language/);
    expect(PLAN_MAX_TOKENS).toBe(600);
  });

  it('a compact answer reads the same as the long one', () => {
    const compact = JSON.stringify({ t: 'concept', b: 'c6_8', d: 'medium', k: ['explanation', 'figure', 'check', 'practice'], v: [{ k: 'figure', a: 'a leaf cell' }], l: 'en' });
    expect(checkPlan(compact, ctx(7))).toEqual(checkPlan(good(), ctx(7)));
    expect(checkPlan(compact, ctx(7)).fromModel).toBe(true);
    // A compact answer that fails a check still gives the default plan.
    expect(checkPlan(JSON.stringify({ t: 'riddle', b: 'c6_8', d: 'medium', k: ['explanation'], l: 'en' }), ctx(7))).toEqual({ plan: defaultPlan(ctx(7)), fromModel: false });
    // A long key the model also sent wins over its short one.
    expect(checkPlan(JSON.stringify({ questionType: 'process', t: 'riddle', b: 'c6_8', d: 'medium', k: ['explanation', 'check'], l: 'en' }), ctx(7)).plan.questionType).toBe('process');
  });
});
