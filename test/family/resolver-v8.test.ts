import { describe, expect, it } from 'vitest';
import { LATEST_RESOLVER_PROMPT, RESOLVER_PROMPTS, resolverPrompt } from '@/lib/ai/prompts/family.resolver';
import { INTERACTIVE_LINES } from '@/lib/ai/prompts/family.resolver/v4';
import { JSON_LINES_RULE, NO_DOUBLE_QUOTES_RULE } from '@/lib/ai/prompts/family.resolver/v6';
import { ITEM_EXAMPLE } from '@/lib/ai/prompts/family.resolver/v7';
import { DERIVATION_LINE, FIGURE_LINE, IMAGE_LINE, NUMERICALS_LINE, REFER_BACK_LINE, STEPS_LINE, TIMELINE_LINE, VIDEOS_LINE, followUpDepth, type ResolverAsk } from '@/lib/ai/prompts/family.resolver/v8';
import { checkPlan, defaultPlan, type Plan } from '@/lib/ai/teaching/plan-shape';
import { generate } from '@/lib/family/resolver';

// W9-B: family.resolver v8, the planned answer (docs/39 §3). The prompt names only the plan's blocks; the class band's
// length and manner; the chapter's passage quoted, or the answer said to be general; the chat's earlier turns when given;
// a biology plan has no interactive block. Made-up content only.

const base: ResolverAsk = { board: 'CBSE', classLevel: 7, subject: 'science', openSubjects: ['science'], classSubjects: ['mathematics', 'science'], chapter: null, topic: null, question: 'How do plants make food?', language: 'en', style: 'en', followUp: null, misconception: null };
const plan = (o: Partial<Plan>): Plan => ({ questionType: 'concept', band: 'c6_8', depth: 'medium', blocks: ['explanation', 'check'], visuals: [], lang: 'en', ...o });
const v8 = resolverPrompt('v8', false);
const system = (o: Partial<ResolverAsk>) => v8.system({ ...base, ...o });

const ALL_TYPES = ['explanation', 'worked_example', 'diagram', 'mind_map', 'key_points', 'check', 'practice', 'english_moment', 'figure', 'steps', 'timeline', 'image', 'videos', 'graph', 'number_line', 'fraction_model', 'geometry', 'simulation'];
const asked = (s: string) => ALL_TYPES.filter((t) => s.includes(`"type":"${t}"`));

describe('prompt v8', () => {
  it('is registered and the default; v7 stays chosen by name', () => {
    expect(LATEST_RESOLVER_PROMPT).toBe('v8');
    expect(resolverPrompt(null, true).version).toBe('v8');
    expect(resolverPrompt('v99', false).version).toBe('v8');
    expect(resolverPrompt('v7', false).version).toBe('v7');
    expect(RESOLVER_PROMPTS.find((p) => p.version === 'v8')?.usesPlan).toBe(true);
    expect(RESOLVER_PROMPTS.find((p) => p.version === 'v7')?.usesPlan).toBeUndefined();
  });

  it('names only the blocks of the plan, in its order', () => {
    const s = system({ plan: plan({ questionType: 'history', blocks: ['explanation', 'timeline', 'check'], visuals: [{ kind: 'timeline', about: 'the events of 1857' }] }) });
    expect(asked(s)).toEqual(['explanation', 'check', 'timeline']);
    expect(s.indexOf('"type":"timeline"')).toBeLessThan(s.indexOf('"type":"check"'));
    expect(s).toContain('Write ONLY these 3 blocks');
    expect(s).toContain('It shows: the events of 1857.');
    expect(asked(system({ plan: plan({ blocks: ['explanation', 'worked_example', 'key_points', 'check', 'practice'] }) }))).toEqual(['explanation', 'worked_example', 'key_points', 'check', 'practice']);
  });

  it('asks for the new visual blocks exactly in the shapes of docs/39', () => {
    const s = system({ plan: plan({ blocks: ['explanation', 'figure', 'steps', 'timeline', 'image', 'videos', 'check'] }) });
    expect(FIGURE_LINE).toBe('{"type":"figure","title":"...","kind":"schematic","shape":"circle|ring|cell|layered|orbit","labels":[{"at":"centre|top|right|bottom|left|ring","text":"≤40"}]}');
    expect(STEPS_LINE).toBe('{"type":"steps","title":"...","items":[{"label":"≤30","text":"≤120"}]}');
    expect(TIMELINE_LINE).toBe('{"type":"timeline","title":"...","items":[{"when":"≤20","text":"≤100"}]}');
    expect(IMAGE_LINE).toBe('{"type":"image","query":"≤80","caption":"≤120"}');
    expect(VIDEOS_LINE).toBe('{"type":"videos"}');
    for (const line of [FIGURE_LINE, STEPS_LINE, TIMELINE_LINE, IMAGE_LINE, VIDEOS_LINE]) expect(s).toContain(line);
    expect(s).toContain('2 to 6 labels');
    expect(s).toContain('3 to 5 items');
    expect(s).toContain('3 to 8 items');
  });

  it('writes the band: LKG to Class 1 at most 60 words, read aloud first; Classes 2 to 5 at most 150; 11 and 12 derive and solve when asked', () => {
    const lkg = system({ classLevel: 1, plan: plan({ band: 'lkg_1', blocks: ['explanation', 'image', 'check'] }) });
    expect(lkg).toContain('READ ALOUD FIRST');
    expect(lkg).toContain('at most 60 words');
    expect(lkg).toContain('exactly 1 item');
    const c3 = system({ classLevel: 3, plan: plan({ band: 'c2_5', blocks: ['explanation', 'image', 'check'] }) });
    expect(c3).toContain('at most 150 words');
    expect(c3).not.toContain('READ ALOUD FIRST');
    const c11 = (questionType: Plan['questionType']) => system({ classLevel: 11, subject: 'physics', plan: plan({ band: 'c11_12', questionType, blocks: ['explanation', 'worked_example', 'check', 'practice'] }) });
    expect(c11('derivation')).toContain(DERIVATION_LINE);
    expect(c11('problem')).toContain(NUMERICALS_LINE);
    expect(c11('concept')).not.toContain(DERIVATION_LINE);
    expect(c11('concept')).not.toContain(NUMERICALS_LINE);
    expect(c11('concept')).toContain('rigorous');
    // The same question in Class 3 and Class 11 gets a different depth and different blocks (docs/39 §4).
    expect(asked(c3)).not.toEqual(asked(c11('problem')));
  });

  it('quotes the chapter\'s passages, or says the answer is general', () => {
    const s = system({ passages: [{ chapterKey: 'cbse.c7.science.nutrition', title: 'Nutrition in plants', text: 'Green leaves make food by "photosynthesis".', score: 0.4 }] });
    expect(s).toContain('From your chapter <title>:');
    expect(s).toContain("[1] Nutrition in plants: Green leaves make food by 'photosynthesis'.");
    expect(s).not.toContain('general answer');
    expect(system({ passages: [] })).toContain('this is a general answer, not from their chapter');
    expect(system({})).toContain('general answer');
  });

  it('writes "Earlier in this chat" only when the chat\'s memory is given', () => {
    expect(system({})).not.toContain('Earlier in this chat');
    const s = system({ memory: { summary: 'We talked about leaves.', turns: [{ role: 'child', text: 'What is chlorophyll?' }, { role: 'tutor', text: 'The green pigment in leaves.' }] } });
    expect(s).toContain('Earlier in this chat');
    expect(s).toContain('Summary: We talked about leaves.');
    expect(s).toContain('Student: What is chlorophyll?');
    expect(s).toContain('Tutor: The green pigment in leaves.');
    expect(system({ memory: { summary: null, turns: [] } })).not.toContain('Earlier in this chat');
  });

  it('decides the subject line from the question and the earlier turns together when the chat has memory', () => {
    const alone = system({ subject: null });
    expect(alone).toContain('decided from the question alone');
    const withMemory = system({ subject: null, memory: { summary: null, turns: [{ role: 'child', text: 'What is photosynthesis?' }, { role: 'tutor', text: 'Plants make food from light.' }] } });
    expect(withMemory).not.toContain('decided from the question alone');
    expect(withMemory).toContain('decided from the question and the earlier turns of this chat together');
    expect(withMemory).toContain("a follow-up such as 'show it with an example' is about the subject of the turns above");
    // The allowed list and the refusal rule stay.
    expect(withMemory).toContain('If the subject is not one of these, write only the subject line and nothing else.');
    expect(withMemory).toContain('The student may be answered only in:');
  });

  it('a biology plan has no interactive block; a physics problem keeps v4\'s bounded-number lines word for word', () => {
    const bio = checkPlan(JSON.stringify({ questionType: 'process', band: 'c9_10', depth: 'medium', blocks: ['explanation', 'simulation', 'steps', 'check'], visuals: [], lang: 'en' }), { classLevel: 9, subject: 'biology', lang: 'en' }).plan;
    const s = system({ classLevel: 9, subject: 'biology', plan: bio });
    expect(asked(s).filter((t) => ['graph', 'number_line', 'fraction_model', 'geometry', 'simulation'].includes(t))).toEqual([]);
    expect(s).not.toContain('pendulum');
    const phy = system({ classLevel: 9, subject: 'physics', plan: plan({ band: 'c9_10', questionType: 'problem', blocks: ['explanation', 'simulation', 'check'] }) });
    for (const line of INTERACTIVE_LINES) expect(phy).toContain(line);
    expect(phy).toContain('preferably a simulation');
  });

  it('keeps v7\'s rules: JSON Lines, no double quotation marks, the subject line, the check whose every wrong option says why', () => {
    const s = system({ subject: null });
    expect(s).toContain(JSON_LINES_RULE);
    expect(s).toContain(NO_DOUBLE_QUOTES_RULE);
    expect(s).toContain('FIRST, before any block, write one line naming the school subject');
    expect(s).toContain(ITEM_EXAMPLE);
    expect(s).toContain('for each wrong option, say plainly that it is wrong and exactly why');
    // Without a plan a question is taught on the band's default plan, which has no interactive block.
    expect(asked(system({}))).toEqual(['explanation', 'key_points', 'check', 'practice', 'steps']);
  });
});

describe('the planned answer, end to end through generate()', () => {
  // A biology question whose planner asks for a pendulum, and a model that writes one anyway: the plan drops it, the
  // prompt sent is rewritten from the plan, the pendulum is never shown, and both calls are metered together.
  it('plans before the answer, sends the prompt written from the plan, and never shows an interactive block the plan does not name', async () => {
    const recorded: string[] = [];
    const sentWith: (string | undefined)[] = [];
    const planCtx = { classLevel: 9, subject: 'biology', lang: 'en' as const };
    const plannerSays = JSON.stringify({ questionType: 'process', band: 'c9_10', depth: 'medium', blocks: ['explanation', 'simulation', 'steps', 'key_points', 'check'], visuals: [], lang: 'en' });
    const ask: ResolverAsk = { ...base, classLevel: 9, subject: 'biology', openSubjects: ['biology'], classSubjects: ['biology'] };
    const lines = [
      { type: 'explanation', title: 'Osmosis', idea: 'Water moves across a membrane.', example: 'A raisin swells in water.', steps: ['Look', 'Tell'], terms: [{ en: 'membrane', local: 'membrane' }] },
      { type: 'simulation', title: 'Pendulum', sim: 'pendulum', values: { length: 1 } },
      { type: 'key_points', points: ['Water moves to where there is less water.', 'The membrane lets water through.'] },
    ].map((b) => JSON.stringify(b));
    const events: { t: string; block?: { type: string } }[] = [];
    const g = await generate(
      {
        ctx: { accountId: 'a', child: { childId: 'c', firstName: 'X', classLevel: 9, board: 'CBSE', language: 'en', style: 'en', stateCode: 'IN-DL', freeSubject: 'biology' }, childFirstNames: [], parentEmail: '', day: '2026-10-30', refusalWords: (k: string) => k },
        line: null,
        known: 'biology',
        open: ['biology'],
        classSubjects: ['biology'],
        cacheable: false,
        promptVersion: 'v8',
        text: {
          send: async (onDelta?: (t: string) => void, late?: { system: string }) => {
            sentWith.push(late?.system);
            for (const l of lines) onDelta?.(`${l}\n`);
            return { result: { ok: true, text: lines.join('\n'), tokensIn: 1, tokensOut: 1, provider: 'p', model: 'm' }, record: async () => void recorded.push('answer') };
          },
        },
        moderation: null,
        asked: 'How does osmosis work?',
        question: 'How does osmosis work?',
        plan: defaultPlan(planCtx),
        teach: {
          ctx: planCtx,
          call: { send: async () => ({ result: { ok: true, text: plannerSays, tokensIn: 1, tokensOut: 1, provider: 'p', model: 'm' }, record: async () => void recorded.push('plan') }) },
          passages: [],
          build: (p: Plan) => ({ system: v8.system({ ...ask, plan: p }), messages: [{ role: 'user', content: v8.user(ask) }] }),
        },
      } as never,
      (e) => events.push(e as never)
    );
    expect(g.plan).toMatchObject({ questionType: 'process', band: 'c9_10', blocks: ['explanation', 'steps', 'key_points', 'check'] });
    expect(sentWith).toHaveLength(1);
    expect(sentWith[0]).toContain('"type":"steps"');
    expect(sentWith[0]).not.toContain('"type":"simulation"');
    expect(g.kept.map((b) => b.type)).toEqual(['explanation', 'key_points']);
    expect(events.filter((e) => e.t === 'block').map((e) => e.block!.type)).toEqual(['explanation', 'key_points']);
    await g.sent.record({} as never);
    expect(recorded).toEqual(['plan', 'answer']);
  });
});

// W10-4 (C413): answer three on the founder's phone referred back only weakly. With the chat's memory, the explanation's
// first sentence refers back in words, before the chapter quote, and a follow-up is not taught at full length again
// unless the question asks for more.
describe('the refer-back (W10-4)', () => {
  const memory = { summary: null, turns: [{ role: 'child' as const, text: 'What is photosynthesis?' }, { role: 'tutor' as const, text: 'Leaves make sugar from light, water and air.' }] };

  it('opens a follow-up explanation with one sentence that refers back in words, before the chapter quote', () => {
    const s = system({ memory, question: 'and why do leaves need light?', passages: [{ title: 'Nutrition in Plants', text: 'Leaves make food using sunlight.' }] as never });
    expect(s).toContain(REFER_BACK_LINE);
    expect(REFER_BACK_LINE).toContain('Earlier we saw that');
    expect(REFER_BACK_LINE).toContain('पहले हमने देखा कि');
    expect(REFER_BACK_LINE).not.toContain('"');
    expect(s.indexOf(REFER_BACK_LINE)).toBeLessThan(s.indexOf('From your chapter'));
    expect(system({ question: 'What is photosynthesis?' })).not.toContain('Earlier we saw that');
  });

  it('gives a follow-up the depth medium or short, never full, unless the question asks for more', () => {
    const full = plan({ depth: 'full' });
    expect(followUpDepth(full, { memory, question: 'and why is that?' }).depth).toBe('medium');
    expect(followUpDepth(plan({ depth: 'short' }), { memory, question: 'and why is that?' }).depth).toBe('short');
    expect(followUpDepth(full, { memory, question: 'Explain it in detail, step by step' }).depth).toBe('full');
    expect(followUpDepth(full, { memory, question: 'इसे विस्तार से समझाओ' }).depth).toBe('full');
    // A first question (no memory) keeps its plan.
    expect(followUpDepth(full, { question: 'What is photosynthesis?' }).depth).toBe('full');
    expect(followUpDepth(full, { memory: { summary: null, turns: [] }, question: 'and why?' }).depth).toBe('full');
  });
});
