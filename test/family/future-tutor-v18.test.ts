import { describe, expect, it } from 'vitest';
import { RESOLVER_PROMPTS, resolverPrompt } from '@/lib/ai/prompts/family.resolver';
import { LEARNING_LINE } from '@/lib/ai/prompts/family.resolver/v14';
import { resolverSystem as v17System, resolverUser as v17User, type ResolverAsk } from '@/lib/ai/prompts/family.resolver/v17';
import { REDIRECT_LINE, RESOLVER_PROMPT_VERSION, resolverSystem, resolverUser } from '@/lib/ai/prompts/family.resolver/v18';
import { parseRedirect } from '@/lib/family/redirect';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';

// The tutor's redirect (founder, 15 Nov 2026): prompt v18 is v17 with its one refuse line replaced. The test builds the FINAL
// prompt for every class and reads it, so a patch that silently did nothing would fail here.

const ask = (classLevel: number, over: Partial<ResolverAsk> = {}): ResolverAsk =>
  ({ board: 'CBSE', classLevel, subject: 'mathematics', openSubjects: ['mathematics'], classSubjects: ['mathematics', 'evs'], chapter: null, topic: null, question: 'Tell me a joke about cricket', language: 'en', style: 'en', followUp: null, misconception: null, bookSubjects: [], ...over }) as ResolverAsk;
const CLASSES = [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe('prompt v18', () => {
  it('is registered by name, after v17, and v17 is untouched', () => {
    expect(RESOLVER_PROMPT_VERSION).toBe('v18');
    expect(RESOLVER_PROMPTS.map((p) => p.version).slice(-5, -3)).toEqual(['v17', 'v18']);
    expect(resolverPrompt('v18', true).version).toBe('v18');
    expect(resolverPrompt('v17', true).version).toBe('v17');
    expect(v17User(ask(8))).toContain(LEARNING_LINE);
  });

  it('for every class the built question prompt replaces the bare refuse line with the redirect, and changes nothing else', () => {
    for (const c of CLASSES) {
      const a = ask(c);
      const before = v17User(a);
      const after = resolverUser(a);
      expect(before, `class ${c}`).toContain('Output only {"type":"refuse"} when it is not a learning question at all');
      expect(after, `class ${c}`).not.toContain('Output only {"type":"refuse"} when');
      expect(after, `class ${c}`).toContain('"type":"refuse","nearest"');
      expect(after, `class ${c}`).toContain('"examples"');
      expect(after, `class ${c}`).toContain('at most 14 words');
      expect(after, `class ${c}`).toBe(before.replace(LEARNING_LINE, REDIRECT_LINE));
      expect(resolverSystem(a)).toBe(v17System(a));
      // The redirect is kind: it forbids scolding and personal details.
      expect(after).toContain('no scolding');
    }
  });

  it('a lesson (no typed question) builds as v17 does; a typed question with the subject named builds too', () => {
    for (const c of [1, 6, 10]) {
      const lesson = ask(c, { question: undefined, chapter: 'Shapes', topic: 'Triangles' });
      expect(resolverUser(lesson)).toBe(v17User(lesson));
      expect(() => resolverUser(ask(c, { subject: 'evs' }))).not.toThrow();
    }
  });

  it('the redirect line asks for the child’s own class and language', () => {
    expect(REDIRECT_LINE).toMatch(/this student's own class and subjects/);
    expect(REDIRECT_LINE).toMatch(/language the student wrote in/);
  });
});

describe('reading the redirect safely', () => {
  const block = (o: unknown) => JSON.stringify({ type: 'refuse', ...(o as object) });
  it('takes a short topic and two short questions', () => {
    expect(parseRedirect(block({ nearest: 'Plants and water', examples: ['Why do plants need water?', 'How do roots drink?'] }))).toEqual({ topic: 'Plants and water', examples: ['Why do plants need water?', 'How do roots drink?'] });
    expect(parseRedirect(block({ nearest: 'पौधे और पानी', examples: ['पौधों को पानी क्यों चाहिए?', 'जड़ें पानी कैसे लेती हैं?'] }))?.topic).toBe('पौधे और पानी');
  });
  it('gives nothing for markup, a link, a long text, one example, a repeat or another block type', () => {
    expect(parseRedirect(block({ nearest: '<b>Plants</b>', examples: ['a question here', 'another question'] }))).toBeNull();
    expect(parseRedirect(block({ nearest: 'Plants', examples: ['see www.example.com', 'another question'] }))).toBeNull();
    expect(parseRedirect(block({ nearest: 'P'.repeat(80), examples: ['a question here', 'another question'] }))).toBeNull();
    expect(parseRedirect(block({ nearest: 'Plants', examples: ['only one question'] }))).toBeNull();
    expect(parseRedirect(block({ nearest: 'Plants', examples: ['same question', 'same question'] }))).toBeNull();
    expect(parseRedirect(JSON.stringify({ type: 'explanation', nearest: 'Plants', examples: ['a question here', 'another question'] }))).toBeNull();
    expect(parseRedirect('{"type":"refuse"}')).toBeNull();
    expect(parseRedirect('not json')).toBeNull();
  });
});

describe('the friendly words', () => {
  it('say what to do next in English and in Hindi, with no scolding', () => {
    for (const k of ['fam.understand.notStudy', 'fam.understand.notStudyNear', 'fam.understand.tryAsking'] as const) {
      expect(en[k]).toBeTruthy();
      expect(hi[k]).toMatch(/[ऀ-ॿ]/);
    }
    expect(en['fam.understand.notStudy']).toMatch(/Ask about any lesson/);
    expect(en['fam.understand.notStudyNear']).toContain('{topic}');
    expect(hi['fam.understand.notStudyNear']).toContain('{topic}');
  });
});
