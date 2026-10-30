import { describe, expect, it } from 'vitest';
import { REQUIRED_BLOCKS, completeResponse, coreBlocks, type Block } from '@/lib/family/blocks';
import { keep, type Generated, type Pending } from '@/lib/family/resolver';
import { gapNotice } from '@/components/family/UnderstandView';
import { familyWords } from '@/lib/family/words';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';

// W10 (C411): "Part of this explanation did not pass our checks" showed under every answer. An answer is now complete
// for the blocks its plan asked for (the explanation always; the check and practice only when asked), the last line
// says which of those never came and whether the answer was cut, and the notice names them or is not shown.

const explanation: Block = { type: 'explanation', title: 'Plants make food', idea: 'Leaves make food from light.', paragraphs: ['Green leaves use sunlight.'], example: 'A leaf', steps: [], terms: [] };
const item = { id: 'c1', question: 'Which part makes food?', options: ['Root', 'Leaf', 'Stem', 'Flower'], answer: 1, hint: 'It is green.', why: 'Leaves hold chlorophyll.', wrong: ['Roots take in water', '', 'Stems carry water', 'Flowers make seeds'] };
const check = { type: 'check', items: [item] } as unknown as Block;
const practice = { type: 'practice', items: [{ ...item, id: 'p1' }] } as unknown as Block;
const plan = (blocks: string[]) => ({ questionType: 'concept', band: 'c6_8', depth: 'medium', blocks, visuals: [], lang: 'en' }) as never;

const db = { query: async () => ({ rows: [] }) };
const pending = { ctx: { refusalWords: (k: string) => k }, line: null, moderation: null, cacheable: false } as unknown as Pending;
const generated = (over: Partial<Generated>): Generated =>
  ({ sent: { result: { ok: true, text: '', provider: 'anthropic', model: 'm' }, record: async () => {} }, subject: 'science', kept: [], refusedByModel: false, stopped: false, error: null, objects: 0, rejected: [], unclosed: false, droppedForSize: 0, plan: null, ...over }) as Generated;

describe('the plan’s core blocks', () => {
  it('the explanation always; check and practice only when the plan asked; all three with no plan', () => {
    expect(coreBlocks(null)).toEqual([...REQUIRED_BLOCKS]);
    expect(coreBlocks(['explanation', 'check'])).toEqual(['explanation', 'check']);
    expect(coreBlocks(['explanation', 'image', 'check'])).toEqual(['explanation', 'check']);
    expect(coreBlocks(['figure', 'steps'])).toEqual(['explanation']);
    expect(completeResponse([explanation, check], coreBlocks(['explanation', 'check']))?.map((b) => b.type)).toEqual(['explanation', 'check']);
    expect(completeResponse([explanation, check])).toBeNull();
  });
});

describe('the last line of an answer', () => {
  it('a short plan answered in full is complete: nothing missing, not cut', async () => {
    expect(await keep(db, pending, generated({ kept: [explanation, check], plan: plan(['explanation', 'check']) }))).toEqual({ t: 'done', complete: true, missing: [], cut: false });
  });

  it('names the block the plan asked for that never came', async () => {
    expect(await keep(db, pending, generated({ kept: [explanation, check], plan: plan(['explanation', 'key_points', 'check', 'practice']) }))).toEqual({ t: 'done', complete: false, missing: ['practice'], cut: false });
  });

  it('an answer whose call ended early after some blocks is cut', async () => {
    const timedOut = generated({ kept: [explanation, check], plan: plan(['explanation', 'check']), sent: { result: { ok: false, reason: 'timeout' }, record: async () => {} } as never });
    expect(await keep(db, pending, timedOut)).toEqual({ t: 'done', complete: false, missing: [], cut: true });
  });

  it('an answer that stopped inside a block is cut', async () => {
    expect(await keep(db, pending, generated({ kept: [explanation, check, practice], plan: plan(['explanation', 'check', 'practice']), unclosed: true }))).toEqual({ t: 'done', complete: false, missing: [], cut: true });
  });

  it('with no plan the three blocks are asked', async () => {
    expect(await keep(db, pending, generated({ kept: [explanation, check] }))).toEqual({ t: 'done', complete: false, missing: ['practice'], cut: false });
  });
});

describe('the notice', () => {
  const words = (lang: 'en' | 'hi') => familyWords(lang, Object.keys(en).filter((k) => k.startsWith('fam.understand.')) as never[]);
  it('is empty when nothing is missing and the answer was not cut', () => {
    expect(gapNotice(words('en'), { missing: [], cut: false })).toEqual([]);
  });
  it('names what is missing in plain words, and says when the answer was cut', () => {
    expect(gapNotice(words('en'), { missing: ['practice'], cut: false })).toEqual(['This answer has no practice questions. Try “Explain differently”.']);
    expect(gapNotice(words('en'), { missing: ['check', 'practice'], cut: true })).toEqual(['This answer has no check questions and practice questions. Try “Explain differently”.', en['fam.understand.cut']]);
    expect(gapNotice(words('hi'), { missing: ['practice'], cut: false })[0]).toContain(hi['fam.understand.part.practice']);
  });
});
