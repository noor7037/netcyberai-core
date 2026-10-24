import { describe, expect, it } from 'vitest';
import { resolverPrompt } from '@/lib/ai/prompts/family.resolver';
import { JSON_LINES_RULE, NO_DOUBLE_QUOTES_RULE } from '@/lib/ai/prompts/family.resolver/v6';
import { jsonObjectScanner } from '@/lib/family/blocks';

// C334: prompt v6, v5 with no double quotation mark inside a text value.

const ask = {
  board: 'CBSE',
  classLevel: 6,
  subject: 'science',
  openSubjects: ['science'],
  classSubjects: ['mathematics', 'science'],
  chapter: 'Exploring Magnets',
  topic: 'Poles of Magnet',
  question: null,
  language: 'en' as const,
  style: 'en' as const,
  followUp: null,
  misconception: null,
};

describe('prompt v6 (C334)', () => {
  it('is chosen by name, and is v5 with the quotation-mark rule right after the JSON Lines rule', () => {
    const v6 = resolverPrompt('v6', false);
    const v5 = resolverPrompt('v5', false);
    expect(v6.version).toBe('v6');
    expect(resolverPrompt('v6', true).version).toBe('v6');
    const lines = v6.system(ask).split('\n');
    expect(lines[lines.indexOf(JSON_LINES_RULE) + 1]).toBe(NO_DOUBLE_QUOTES_RULE);
    expect(lines.filter((l) => l !== NO_DOUBLE_QUOTES_RULE).join('\n')).toBe(v5.system(ask));
    expect(v6.user(ask)).toBe(v5.user(ask));
  });

  it('keeps the rule for every style, a follow-up and a typed question', () => {
    for (const style of ['en', 'hi', 'hinglish'] as const)
      expect(resolverPrompt('v6', true).system({ ...ask, style, subject: null, question: 'Why do two north poles push apart?', followUp: 'simpler' })).toContain(NO_DOUBLE_QUOTES_RULE);
  });

  it('is the cause it answers: a double quotation mark inside a value leaves the scanner inside an unclosed object', () => {
    // One stray quotation mark (an odd number) flips the scanner's view of every brace after it.
    const broken = '{"type":"practice","items":[{"id":"p1","question":"Which end is the "north pole?"}]}';
    const scan = jsonObjectScanner();
    const objects = scan(broken + '\n');
    expect(objects).toHaveLength(0);
    expect(scan.dropped().unclosed).toBe(true);
    const fixed = jsonObjectScanner();
    expect(fixed('{"type":"practice","items":[{"id":"p1","question":"Which end is the \'north\' pole?"}]}\n')).toHaveLength(1);
  });
});
