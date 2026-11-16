import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RESOLVER_PROMPTS, LATEST_RESOLVER_PROMPT, resolverPrompt } from '@/lib/ai/prompts/family.resolver';
import { DEPTH_RULE_V20 } from '@/lib/ai/prompts/family.resolver/elaboration-prompt';
import { DEPTH_RULE_V21 } from '@/lib/ai/prompts/family.resolver/v21';
import { elaborationBlock, MAX_CHECKS } from '@/lib/family/elaboration';
import { withPics } from '@/lib/family/elaboration-pics';
import { ElabExtrasView } from '@/components/family/blocks/ElabExtrasView';
import { nameFiller } from '@/lib/family/name-token';

const ask = (over: Record<string, unknown> = {}) => ({ board: 'CBSE', classLevel: 3, subject: 'science', openSubjects: ['science'], classSubjects: ['science'], language: 'en', name: 'Aarav', style: 'en', question: 'energy', replyLang: 'en', ...over }) as never;
const sys = (p: string, over: Record<string, unknown> = {}) => resolverPrompt(p, false).system(ask(over));

const ck = (i: number) => ({ question: `Question ${i} about energy?`, options: ['a one', 'b two', 'c three'], answer: i % 3, right: 'Yes.', hint: 'Think again.' });
const line = (over: Record<string, unknown> = {}) => ({
  type: 'elaboration',
  term: 'Energy',
  definition: { text: 'Energy is the ability to do work. It makes things move and change.', say: 'Energy is the ability to do work.' },
  levels: { basic: 'Energy makes a cycle move when you pedal it hard.', intermediate: 'Energy changes from one form to another, like food to motion.', advanced: 'Energy is never lost, it only changes its form in every process.', say: 'Energy moves things.' },
  real_life: { text: 'A bus on the road burns fuel to move the people inside.', say: 'A bus burns fuel.' },
  try_it: { question: 'Name one thing in your kitchen that gives heat.', right: 'The gas stove gives heat.', hint: 'Think of cooking.', say: 'Name a heat giver.' },
  future: { text: 'Later you will learn how power stations make electricity for homes.', say: 'Power stations.' },
  checks: [ck(0), ck(1), ck(2), ck(3), ck(4), ck(5), ck(6)],
  extras: { home: 'Rub your palms and feel the heat.', fact: 'The sun gives us light.', india: 'Solar panels light many villages.', trick: 'Say: work gives energy.', whatif: 'What if the sun went out?', ignored: 'x' },
  q3d: ['solar panel', '', 'bus', 'gas stove', 'power plant', 'extra'],
  ...over,
});

describe('prompt v21', () => {
  it('is registered and opt-in; the fallback stays v10 and v19 and v20 are unchanged', () => {
    expect(RESOLVER_PROMPTS.map((p) => p.version)).toContain('v21');
    expect(resolverPrompt('v21', false).elaborate).toBe(true);
    expect(LATEST_RESOLVER_PROMPT).toBe('v10');
    expect(sys('v19')).toContain('ONE clear sentence');
    expect(sys('v20')).toContain(DEPTH_RULE_V20);
    expect(sys('v20')).not.toContain('"extras"');
  });
  it('a broad topic is not a simple fact; the depth is scaled by class', () => {
    const s = sys('v21');
    expect(s).toContain(DEPTH_RULE_V21);
    expect(s).toContain('A BROAD TOPIC IS NEVER A SIMPLE FACT');
    expect(s).not.toContain('A simple fact or definition (what is a noun');
    expect(s).toContain('about 3 to 4 short sentences');
    expect(sys('v21', { classLevel: 7 })).toContain('5 to 7 sentences');
    expect(sys('v21', { classLevel: 11 })).toContain('formula or derivation idea');
    expect(sys('v21', { classLevel: 11 })).not.toContain('about 3 to 4 short sentences');
  });
  it('uses the child first name through the token, once or twice, never a real name', () => {
    const s = sys('v21');
    expect(s).toContain('{{name}}');
    expect(s).toContain('once or twice');
    expect(s).not.toContain('Aarav');
    expect(nameFiller('Aarav Kumar')('Good thinking, {{name}}!')).toBe('Good thinking, Aarav!');
  });
  it('asks for 2 to 5 questions, the extras and q3d', () => {
    const s = sys('v21');
    expect(s).toContain('between 2 and 5 questions, NEVER fewer than 2');
    expect(s).not.toContain('Write 1 for a simple fact');
    expect(s).toContain('"extras":{');
    expect(s).toContain('CREATIVE EXTRAS');
    expect(s).toContain('"q3d"');
  });
});

describe('v21 block', () => {
  it('parses extras and q3d, caps the checks at five, and round-trips', () => {
    const b = elaborationBlock(line(), false)!;
    expect(b.checks).toHaveLength(MAX_CHECKS);
    expect(b.extras).toEqual({ home: 'Rub your palms and feel the heat.', fact: 'The sun gives us light.', india: 'Solar panels light many villages.', trick: 'Say: work gives energy.', whatif: 'What if the sun went out?' });
    expect(b.q3d).toEqual(['solar panel', '', 'bus', 'gas stove', 'power plant']);
    const again = elaborationBlock(JSON.parse(JSON.stringify(b)), true)!;
    expect(again.extras).toEqual(b.extras);
    expect(again.q3d).toEqual(b.q3d);
    expect(again.checks).toHaveLength(5);
    const long = elaborationBlock(line({ extras: { home: 'x'.repeat(900) } }), false)!;
    expect(long.extras!.home!.length).toBeLessThanOrEqual(400);
    expect(withPics(b, [], 'energy', 3).checks).toHaveLength(5);
  });
  it('a long step is not truncated at the old caps', () => {
    const text = 'Energy is useful in every part of life. '.repeat(30).trim();
    const b = elaborationBlock(line({ levels: { basic: text, intermediate: text, advanced: text, say: 'x' } }), false)!;
    expect(b.levels.advanced).toBe(text);
  });
  it('fewer than two valid checks are topped up from the block own text; none possible rejects', () => {
    const one = elaborationBlock(line({ checks: [ck(0)] }), false)!;
    expect(one.checks).toHaveLength(2);
    expect(one.checks[1].options).toHaveLength(3);
    expect(one.checks[1].options[one.checks[1].answer]).toContain('Energy is the ability to do work.');
    const none = elaborationBlock(line({ checks: [] }), false)!;
    expect(none.checks).toHaveLength(2);
    const hi = elaborationBlock(line({ term: 'ऊर्जा', checks: [] }), false)!;
    expect(hi.checks[0].question).toBe('इनमें से कौन-सा वाक्य सही है?');
    const short = { definition: { text: 'Work.', say: 'w' }, levels: { basic: 'Go.', intermediate: 'Go on.', advanced: 'Go far.', say: 's' }, real_life: { text: 'Bus.', say: 'b' }, future: { text: 'Later.', say: 'l' } };
    expect(elaborationBlock(line({ ...short, checks: [] }), false)).toBeNull();
  });
  it('an older block (no extras, no q3d) keeps the old behaviour: no top-up, class count', () => {
    const { extras: _e, q3d: _q, ...old } = line({ checks: [ck(0)] }) as Record<string, unknown>;
    const b = elaborationBlock(old, false)!;
    expect(b.checks).toHaveLength(1);
    expect(b.extras).toBeUndefined();
    const five = elaborationBlock({ ...old, checks: [ck(0), ck(1), ck(2), ck(3), ck(4)] }, false)!;
    expect(withPics(five, [], 'energy', 9).checks).toHaveLength(3);
  });
  it('the extras render with their words and nothing when empty', () => {
    const b = elaborationBlock(line(), false)!;
    const w = new Proxy({}, { get: (_t, k) => String(k) }) as never;
    const html = renderToStaticMarkup(h(ElabExtrasView, { extras: b.extras!, w }));
    expect(html.match(/data-elab-extra="/g)).toHaveLength(5);
    expect(html).toContain('Rub your palms');
    expect(renderToStaticMarkup(h(ElabExtrasView, { extras: {}, w }))).toBe('');
  });
});
