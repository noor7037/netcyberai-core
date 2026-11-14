import { describe, expect, it } from 'vitest';
import { RESOLVER_PROMPTS, resolverPrompt } from '@/lib/ai/prompts/family.resolver';
import { resolverSystem as v15System, type ResolverAsk } from '@/lib/ai/prompts/family.resolver/v15';
import { QUICK_ANSWER_LINE, resolverSystem as v16System } from '@/lib/ai/prompts/family.resolver/v16';
import { PROFILES } from '@/lib/ai/platform';
import { completeResponse, parseBlockLine, type Block } from '@/lib/family/blocks';

const ask = (classLevel: number): ResolverAsk =>
  ({ board: 'CBSE', classLevel, subject: 'science', openSubjects: ['science'], classSubjects: ['science'], language: 'en', question: 'Why is the sky blue?' }) as unknown as ResolverAsk;

describe('prompt v16 (C516): the quick answer first', () => {
  it('is registered after v15 and chosen only by name', () => {
    const versions = RESOLVER_PROMPTS.map((p) => p.version);
    expect(versions.indexOf('v16')).toBe(versions.indexOf('v15') + 1);
    expect(resolverPrompt('v16', true).version).toBe('v16');
  });
  it('asks Classes 3 and up for a key-points answer first; the youngest keep the board first', () => {
    for (const c of [3, 6, 10, 12]) {
      const s = v16System(ask(c));
      expect(s).toContain(QUICK_ANSWER_LINE);
      expect(s.replace(`\n${QUICK_ANSWER_LINE}`, '')).toBe(v15System(ask(c)));
    }
    expect(v16System(ask(1))).toBe(v15System(ask(1)));
  });
  it('the quick answer it asks for passes the key-points rules', () => {
    const shape = /\{"type":"key_points".*?\]\}/.exec(QUICK_ANSWER_LINE)![0];
    expect(parseBlockLine(shape)).not.toBeNull();
  });
  it('a stored answer keeps its quick answer first', () => {
    const kp: Block = { type: 'key_points', points: ['Air scatters blue light most.', 'So the sky looks blue.'] };
    const ex = { type: 'explanation', title: 't', idea: 'i', example: 'e', steps: ['s'], terms: [] } as unknown as Block;
    const out = completeResponse([kp, ex], ['explanation']);
    expect(out?.map((b) => b.type)).toEqual(['key_points', 'explanation']);
    expect(completeResponse([ex, kp], ['explanation'])?.map((b) => b.type)).toEqual(['explanation', 'key_points']);
  });
});

describe('the teaching plan is held to 3.5 s (C516)', () => {
  it('never stalls the answer for 10 s', () => {
    const plan = PROFILES.find((p) => p.id === 'family.plan')!;
    expect(plan.callMs).toBe(3_500);
    expect(plan.firstTextMs).toBe(2_500);
  });
});
