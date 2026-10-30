import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LATEST_RESOLVER_PROMPT, resolverPrompt } from '@/lib/ai/prompts/family.resolver';
import { INTERACTIVE_LINES } from '@/lib/ai/prompts/family.resolver/v4';
import { JSON_LINES_RULE, NO_DOUBLE_QUOTES_RULE } from '@/lib/ai/prompts/family.resolver/v6';
import { ITEM_EXAMPLE } from '@/lib/ai/prompts/family.resolver/v7';
import { BLOCK_TYPES, MIND_MAP_LABEL_MAX, checkBlock, completeResponse, parseBlockLine, type Block, type MindMap } from '@/lib/family/blocks';
import { FRESH, QuestionBody, answered } from '@/components/family/blocks/QuizView';
import { MindMapView, placeMindMap } from '@/components/family/blocks/MindMapView';
import { BLOCK_TONE } from '@/components/family/blocks/BlockViews';
import { familyWords } from '@/lib/family/words';
import { UNDERSTAND_KEYS } from '@/lib/family/understand-words';
import type { PublicItem } from '@/lib/family/items';

// W8-AI: family.resolver v7 (the rich answer), the mind map block, a check whose every wrong option says why, and a
// wrong tap answered at once. Made-up content only.

const topic = { board: 'CBSE', classLevel: 7, subject: 'science', openSubjects: ['science'], classSubjects: ['mathematics', 'science'], chapter: 'Heat', topic: 'Conduction', question: null, language: 'en' as const, style: 'en' as const, followUp: null, misconception: null };

describe('prompt v7', () => {
  const v7 = resolverPrompt('v7', false);

  it('is the default, and names every required block in order', () => {
    expect(LATEST_RESOLVER_PROMPT).toBe('v7');
    expect(resolverPrompt(null, true).version).toBe('v7');
    const system = v7.system(topic as never);
    const at = (s: string) => {
      const i = system.indexOf(s);
      expect(i, s).toBeGreaterThan(-1);
      return i;
    };
    const order = ['"type":"explanation"', '"type":"worked_example"', '"type":"diagram"', '"type":"mind_map"', '"type":"key_points"', '"type":"graph"', '"type":"check"', '"type":"practice"'].map(at);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(system).toContain('"paragraphs"');
    expect(system).toContain('150 to 400 words');
    expect(v7.system({ ...topic, classLevel: 4 } as never)).toContain('80 to 200 words');
    expect(system).toContain('4 to 8 short points');
    expect(system).toContain('3 to 5 items');
    expect(system).toContain('exactly 3 items');
    expect(system).toMatch(/for each wrong option, say plainly that it is wrong and exactly why/);
    expect(system).toContain('2 to 6 branches, 0 to 4 leaves');
    expect(system).toContain('up to 40 characters');
  });

  it('keeps v6’s JSON rules and v4’s bounded-number lines word for word', () => {
    const system = v7.system(topic as never);
    expect(system).toContain(JSON_LINES_RULE);
    expect(system).toContain(NO_DOUBLE_QUOTES_RULE);
    for (const line of INTERACTIVE_LINES) expect(system).toContain(line);
  });

  it('asks for one interactive block for Mathematics or Science, none for another subject', () => {
    expect(v7.system(topic as never)).toContain('This is a Mathematics or Science topic: write exactly ONE block');
    expect(v7.system({ ...topic, subject: 'history', openSubjects: ['history'] } as never)).toContain('write none of these');
  });

  it('a typed question names its subject first', () => {
    const q = { ...topic, subject: null, topic: null, chapter: null, question: 'Why does a metal spoon get hot?' };
    expect(resolverPrompt('v7', true).system(q as never)).toContain('FIRST, before any block, write one line naming the school subject');
  });

  it('its own example item passes the checker, with a reason for every wrong option', () => {
    const b = checkBlock({ type: 'check', items: [JSON.parse(ITEM_EXAMPLE)] });
    expect(b?.type).toBe('check');
    if (b?.type !== 'check') throw new Error('unreachable');
    expect(b.items[0].wrong.filter(Boolean)).toHaveLength(3);
  });
});

const GOOD_MAP = { type: 'mind_map', title: 'Heat moves', root: 'Heat transfer', branches: [{ label: 'Conduction', leaves: ['Through solids', 'Metal spoon in tea'] }, { label: 'Convection', leaves: ['Through liquids and gases'] }, { label: 'Radiation', leaves: [] }] };

describe('the mind map block', () => {
  it('is a block type, in the teaching order after the diagram', () => {
    expect(BLOCK_TYPES).toContain('mind_map');
    const blocks = [
      checkBlock({ type: 'check', items: [JSON.parse(ITEM_EXAMPLE)] }),
      checkBlock(GOOD_MAP),
      checkBlock({ type: 'explanation', title: 'Heat', idea: 'Heat moves from hot to cold.', paragraphs: ['First paragraph.', 'Second paragraph.'], example: 'A cup of tea cools.', steps: ['One.', 'Two.'], terms: [] }),
      checkBlock({ type: 'practice', items: [{ ...JSON.parse(ITEM_EXAMPLE), id: 'p1' }] }),
    ] as Block[];
    expect(completeResponse(blocks)?.map((b) => b.type)).toEqual(['explanation', 'mind_map', 'check', 'practice']);
  });

  it('accepts a good map', () => {
    expect(checkBlock(GOOD_MAP)).toEqual(GOOD_MAP);
    expect(parseBlockLine(JSON.stringify(GOOD_MAP))).toEqual(GOOD_MAP);
  });

  it('drops a map with fewer than two branches, a label over the limit, or a leaf that is not text', () => {
    const long = 'x'.repeat(MIND_MAP_LABEL_MAX + 1);
    expect(checkBlock({ ...GOOD_MAP, branches: [] })).toBeNull();
    expect(checkBlock({ ...GOOD_MAP, branches: [GOOD_MAP.branches[0]] })).toBeNull();
    expect(checkBlock({ ...GOOD_MAP, root: long })).toBeNull();
    expect(checkBlock({ ...GOOD_MAP, branches: [{ label: long, leaves: [] }, GOOD_MAP.branches[1]] })).toBeNull();
    expect(checkBlock({ ...GOOD_MAP, branches: [{ label: 'Conduction', leaves: [long] }, GOOD_MAP.branches[1]] })).toBeNull();
    expect(checkBlock({ ...GOOD_MAP, branches: [{ label: 'Conduction', leaves: [7] }, GOOD_MAP.branches[1]] })).toBeNull();
    expect(checkBlock({ ...GOOD_MAP, branches: [{ label: '', leaves: [] }, GOOD_MAP.branches[1]] })).toBeNull();
  });

  it('keeps at most 6 branches of at most 4 leaves', () => {
    const many = { ...GOOD_MAP, branches: Array.from({ length: 8 }, (_, i) => ({ label: `Branch ${i}`, leaves: ['a', 'b', 'c', 'd', 'e'] })) };
    const b = checkBlock(many) as MindMap;
    expect(b.branches).toHaveLength(6);
    expect(b.branches.every((br) => br.leaves.length === 4)).toBe(true);
  });

  it('is drawn by our code: an SVG from 480 px and a vertical tree below, every label as text, violet', () => {
    const w = familyWords('en', UNDERSTAND_KEYS);
    const html = renderToStaticMarkup(h(MindMapView, { b: checkBlock(GOOD_MAP) as MindMap, w, tone: 'science' }));
    expect(html).toContain('data-block="mind_map"');
    expect(html).toContain('data-mind-map-svg');
    expect(html).toContain('min-[480px]:block');
    expect(html).toContain('data-mind-map-tree');
    expect(html).toContain('min-[480px]:sr-only');
    for (const label of ['Heat transfer', 'Conduction', 'Metal spoon in tea', 'Radiation']) expect(html).toContain(label);
    expect(html).toContain(BLOCK_TONE.mind_map.bar);
    // Every box sits inside the drawing: nothing runs off either side.
    const placed = placeMindMap(checkBlock(GOOD_MAP) as MindMap);
    for (const br of placed.branches) for (const p of [br.box, ...br.leaves]) expect(p.x >= 0 && p.x + p.w <= placed.W).toBe(true);
  });
});

describe('a check item must say why each wrong option is wrong', () => {
  const item = JSON.parse(ITEM_EXAMPLE);
  it('an item without a reason for a wrong option is dropped; practice still falls back to why', () => {
    const missing = { ...item, id: 'c2', wrong: ['Not a fruit: a brick is made.', '', '', 'Not a fruit: a shoe is made.'] };
    const none = { ...item, id: 'c3', wrong: undefined };
    const b = checkBlock({ type: 'check', items: [item, missing, none] });
    if (b?.type !== 'check') throw new Error('expected a check');
    expect(b.items.map((i) => i.id)).toEqual(['c1']);
    expect(checkBlock({ type: 'check', items: [missing] })).toBeNull();
    const p = checkBlock({ type: 'practice', items: [{ ...none, id: 'p1' }] });
    if (p?.type !== 'practice') throw new Error('expected a practice');
    expect(p.items[0].wrong[0]).toBe(item.why);
  });

  it('a check keeps up to 5 items', () => {
    const items = Array.from({ length: 7 }, (_, i) => ({ ...item, id: `c${i}` }));
    const b = checkBlock({ type: 'check', items });
    if (b?.type !== 'check') throw new Error('expected a check');
    expect(b.items).toHaveLength(5);
  });
});

describe('QuizView: a wrong tap is answered at once', () => {
  const w = familyWords('en', UNDERSTAND_KEYS);
  const pub: PublicItem = { token: 'tok', question: 'Which of these is a fruit?', options: ['a brick', 'a mango', 'a spoon', 'a shoe'] } as PublicItem;
  const body = (s: typeof FRESH) => renderToStaticMarkup(h(QuestionBody, { item: pub, s, w, tone: 'science', onPick: () => {}, onHint: () => {}, onRetry: () => {} }));

  it('the first wrong tap shows "Not this one" and that option’s reason, and the other options stay open', () => {
    const s = answered(FRESH, 2, { correct: false, explanation: 'Not a fruit: a spoon is made by people.' });
    const html = body(s);
    expect(html).toContain('data-result="wrong"');
    expect(html).toContain('Not this one');
    expect(html).toContain('Not a fruit: a spoon is made by people.');
    expect(html).not.toMatch(/<button[^>]*disabled/);
    expect(html).toContain(w['fam.check.explainAgain']);
  });

  it('a right tap shows "Correct" and why, and the question ends', () => {
    const s = answered(answered(FRESH, 2, { correct: false, explanation: 'Not a fruit.' }), 1, { correct: true, explanation: 'A mango grows on a tree.' });
    const html = body(s);
    expect(html).toContain('data-result="correct"');
    expect(html).toContain('Correct');
    expect(html).toContain('A mango grows on a tree.');
    expect(html).toMatch(/<button[^>]*disabled/);
  });

  it('before any tap, nothing is judged', () => {
    expect(body(FRESH)).not.toContain('data-result');
  });
});
