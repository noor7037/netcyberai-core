import { describe, expect, it } from 'vitest';
import { resolverPrompt } from '@/lib/ai/prompts/family.resolver';
import { checkBlock } from '@/lib/family/blocks';

// W2 (C323): prompt v5, the required blocks first for open models.

const ask = {
  board: 'CBSE',
  classLevel: 6,
  subject: 'science',
  openSubjects: ['science'],
  classSubjects: ['mathematics', 'science'],
  chapter: 'Exploring Magnets',
  topic: 'Magnetic and non-magnetic materials',
  question: null,
  language: 'en' as const,
  style: 'en' as const,
  followUp: null,
  misconception: null,
};

describe('prompt v5', () => {
  it('is chosen by name, and names the subject for a typed question as v3 does', () => {
    expect(resolverPrompt('v5', false).version).toBe('v5');
    expect(resolverPrompt('v5', true).version).toBe('v5');
    expect(resolverPrompt('v5', true).system({ ...ask, subject: null, question: 'Why does a magnet pull iron?' })).toContain('"type":"subject"');
  });

  it('asks for explanation, check and practice first and in that order, then at most two extras', () => {
    const s = resolverPrompt('v5', false).system(ask);
    const at = (needle: string) => s.indexOf(needle);
    expect(at('"type":"explanation"')).toBeGreaterThan(0);
    expect(at('"type":"explanation"')).toBeLessThan(at('"type":"check"'));
    expect(at('"type":"check"')).toBeLessThan(at('"type":"practice"'));
    expect(at('"type":"practice"')).toBeLessThan(at('"type":"worked_example"'));
    expect(s).toMatch(/REQUIRED/);
    expect(s).toMatch(/AT MOST TWO/);
    expect(resolverPrompt('v5', false).user(ask)).toBe('Teach this topic: Exploring Magnets / Magnetic and non-magnetic materials. Start with the explanation, then the check, then the practice.');
  });

  it('its example item passes our own checks, so the model is never shown an example we would refuse', () => {
    const s = resolverPrompt('v5', false).system(ask);
    const example = /written exactly like this one: (\{.*?\})(?=\n)/.exec(s)?.[1];
    expect(example).toBeTruthy();
    expect(checkBlock({ type: 'check', items: [JSON.parse(example!), { ...JSON.parse(example!), id: 'c2' }] })).toMatchObject({ type: 'check' });
  });
});
