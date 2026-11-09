import { describe, expect, it } from 'vitest';
import { RESOLVER_PROMPTS, resolverPrompt, LATEST_RESOLVER_PROMPT } from '@/lib/ai/prompts/family.resolver';
import { NAME_LINE, resolverSystem as v12System } from '@/lib/ai/prompts/family.resolver/v12';
import { resolverSystem as v11System, resolverUser as v11User } from '@/lib/ai/prompts/family.resolver/v11';
import { resolverUser as v12User, type ResolverAsk } from '@/lib/ai/prompts/family.resolver/v12';
import { nameFiller, stripName, withoutName } from '@/lib/family/name-token';
import { generate } from '@/lib/family/resolver';

describe('stripName', () => {
  it('removes the token with the punctuation that held it', () => {
    expect(stripName('Good try, {{name}}!')).toBe('Good try!');
    expect(stripName('Well done {{name}}, now look.')).toBe('Well done, now look.');
    expect(stripName('{{name}}, look at this.')).toBe('Look at this.');
    expect(stripName('Try it, {{ name }}.')).toBe('Try it.');
    expect(stripName('Nothing here')).toBe('Nothing here');
  });
  it('handles a Hindi reply', () => {
    expect(stripName('बहुत अच्छा, {{name}}। अब देखो।')).toBe('बहुत अच्छा। अब देखो।');
  });
});

describe('nameFiller', () => {
  it('puts the first name where the token is, in every text field, and only the first names', () => {
    const fill = nameFiller('Asha Verma');
    const out = fill({ type: 'explanation', idea: 'Good try, {{name}}, the idea is simple.', steps: ['Look, {{name}}!', 'Then {{name}} adds.'], n: 3, k: null });
    expect(out.idea).toBe('Good try, Asha, the idea is simple.');
    expect(out.steps[0]).toBe('Look, Asha!');
    // The name is used at most twice in an answer: the third is stripped.
    expect(out.steps[1]).toBe('Then adds.');
    expect(out.n).toBe(3);
    expect(out.k).toBeNull();
    expect(JSON.stringify(out)).not.toContain('{{');
  });
  it('does not double a name the model also wrote, and reads a "$" in a name as text', () => {
    expect(nameFiller('Asha')('Good try, Asha {{name}}, go on.')).toBe('Good try, Asha, go on.');
    expect(nameFiller('A$&b')('Hi, {{name}}!')).toBe('Hi, A$&b!');
  });
  it('writes a Devanagari name into a Hindi reply', () => {
    expect(nameFiller('आशा')('बहुत अच्छा, {{name}}। अब देखो।')).toBe('बहुत अच्छा, आशा। अब देखो।');
  });
  it('with no name strips every token, and withoutName does the same', () => {
    expect(nameFiller('')('Good try, {{name}}!')).toBe('Good try!');
    expect(nameFiller(undefined)('{{name}}, hi')).toBe('Hi');
    expect(withoutName({ a: ['Well, {{name}}.'] })).toEqual({ a: ['Well.'] });
  });
});

describe('prompt v12', () => {
  const base: ResolverAsk = { board: 'CBSE', classLevel: 6, subject: 'science', openSubjects: ['science'], classSubjects: ['science'], chapter: null, topic: null, question: 'What is friction?', language: 'en', style: 'en', followUp: null, misconception: null };

  it('is v11 plus the one name line; v11 is untouched and v10 stays the fallback', () => {
    const versions = RESOLVER_PROMPTS.map((p) => p.version);
    expect(versions.indexOf('v12')).toBe(versions.indexOf('v11') + 1);
    expect(resolverPrompt('v12', false).version).toBe('v12');
    expect(LATEST_RESOLVER_PROMPT).toBe('v10');
    expect(v12System(base).replace(`\n${NAME_LINE}`, '')).toBe(v11System(base));
    expect(v12User(base)).toBe(v11User(base));
    expect(v11System(base)).not.toContain('{{name}}');
  });
  it('carries the token and never a real name', () => {
    expect(NAME_LINE).toContain('{{name}}');
    expect(NAME_LINE).toContain('at most once or twice');
    // The prompt builders do not take the child's name at all.
    expect(v12System({ ...base, question: 'Hi' })).toContain('{{name}}');
  });
});

describe('the name on its way to the child, never to a provider', () => {
  const explanation = { type: 'explanation', title: 'Friction', idea: 'Good try, {{name}}, friction slows things down.', example: 'A ball stops on grass.', steps: ['Push', 'Watch'], terms: [] };
  const run = async (firstName: string, lines: object[]) => {
    const text = lines.map((b) => JSON.stringify(b));
    const events: { t: string; block?: unknown }[] = [];
    const checked: string[] = [];
    const g = await generate(
      {
        ctx: { accountId: 'a', child: { childId: 'c', firstName, classLevel: 6, board: 'CBSE', language: 'en', style: 'en', stateCode: 'IN-DL', freeSubject: 'science' }, childFirstNames: [firstName], parentEmail: '', day: '2026-11-09', refusalWords: (k: string) => k },
        line: null,
        known: 'science',
        open: ['science'],
        classSubjects: ['science'],
        cacheable: false,
        promptVersion: 'v12',
        text: {
          send: async (onDelta?: (t: string) => void) => {
            for (const l of text) onDelta?.(`${l}\n`);
            return { result: { ok: true, text: text.join('\n'), tokensIn: 1, tokensOut: 1, provider: 'p', model: 'm' }, record: async () => undefined };
          },
        },
        moderation: {
          check: async (turns: { user: string; assistant?: string }) => {
            checked.push(JSON.stringify(turns));
            return { safe: true };
          },
          record: async () => undefined,
        },
        asked: 'What is friction?',
        question: 'What is friction?',
        plan: null,
      } as never,
      (e) => events.push(e as never)
    );
    return { g, events, checked };
  };

  it('swaps the token after the safety check, so the name never leaves the server', async () => {
    const { g, events, checked } = await run('Asha', [explanation]);
    expect(checked.length).toBeGreaterThan(0);
    for (const c of checked) expect(c).not.toContain('Asha');
    expect(JSON.stringify(events)).toContain('Good try, Asha, friction slows things down.');
    expect(JSON.stringify(g.kept)).toContain('Good try, Asha,');
    // What a response kept for other children is made of has no name and no token.
    expect(JSON.stringify(g.shared)).not.toContain('Asha');
    expect(JSON.stringify(g.shared)).not.toContain('{{');
    expect(JSON.stringify(g.shared)).toContain('Good try, friction slows things down.');
  });
  it('strips a token left with no name, and leaves an answer with no token as it was', async () => {
    const a = await run('', [explanation]);
    expect(JSON.stringify(a.events)).not.toContain('{{');
    expect(JSON.stringify(a.g.kept)).toContain('Good try, friction slows things down.');
    const plain = { ...explanation, idea: 'Friction slows things down.' };
    const b = await run('Asha', [plain]);
    expect(JSON.stringify(b.g.kept)).not.toContain('Asha');
  });
});
