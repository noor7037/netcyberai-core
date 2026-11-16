import { describe, expect, it } from 'vitest';
import { RESOLVER_PROMPTS, LATEST_RESOLVER_PROMPT, resolverPrompt } from '@/lib/ai/prompts/family.resolver';
import { ONE_BOARD_LINE, VISUAL_RULE, TERMS_RULE, GROUNDED_LINE, LAB_RULE } from '@/lib/ai/prompts/family.resolver/v19';
import { MEMORY_RULE } from '@/lib/ai/prompts/family.resolver/v15';
import { defaultPlan, oneBoardBlocks } from '@/lib/ai/teaching/plan-shape';
import { termSame } from '@/components/family/blocks/BlockViews';

const ask = (over: Record<string, unknown> = {}) => ({ board: 'CBSE', classLevel: 8, subject: null, openSubjects: ['mathematics', 'science'], classSubjects: ['mathematics', 'science'], chapter: null, topic: null, question: 'why does iron rust', language: 'en', style: 'en', followUp: false, misconception: null, replyLang: 'hi', motherTongue: 'hi', ...over }) as never;

describe('prompt v19', () => {
  it('is registered, opt-in, and the fallback is still v10', () => {
    expect(RESOLVER_PROMPTS.map((p) => p.version)).toContain('v19');
    expect(resolverPrompt('v19', false).oneBoard).toBe(true);
    expect(LATEST_RESOLVER_PROMPT).toBe('v10');
    expect(resolverPrompt('v15', false).oneBoard).toBeUndefined();
  });
  it('carries the one-stage, visual and terms rules, the language rule, the memory rule and the name token', () => {
    const p = resolverPrompt('v19', false);
    const sys = p.system(ask());
    for (const line of [ONE_BOARD_LINE, VISUAL_RULE, TERMS_RULE]) expect(sys).toContain(line);
    expect(p.system(ask({ memory: { summary: null, turns: [{ role: 'child', text: 'what is rust' }, { role: 'tutor', text: 'Rust is iron oxide.' }] } }))).toContain(MEMORY_RULE);
    expect(sys).toContain('{{name}}');
    expect(sys).toMatch(/Hindi|हिन्दी|Devanagari|in Hindi/);
    expect(sys).not.toContain('Earlier we saw, ');
  });
  it('names labs only when some are on offer', () => {
    const p = resolverPrompt('v19', false);
    expect(p.system(ask())).not.toContain(LAB_RULE);
    expect(p.system(ask({ labs: [{ id: 'l1', title: 'Rust', aim: 'x' }] }))).toContain(LAB_RULE);
  });
  it('says "not from your chapter" never when a chapter is open', () => {
    const p = resolverPrompt('v19', false);
    expect(p.system(ask({ question: 'why? (asked while reading: Chemical Reactions)' }))).toContain(GROUNDED_LINE);
  });
  it('shapes the plan to one visual and one check, with no practice', () => {
    expect(oneBoardBlocks(['explanation', 'steps', 'figure', 'key_points', 'check', 'practice'])).toEqual(['explanation', 'steps', 'check']);
    expect(oneBoardBlocks(['explanation', 'worked_example', 'key_points', 'check', 'practice'])).toEqual(['explanation', 'worked_example', 'check']);
    const plan = defaultPlan({ classLevel: 8, subject: 'science', lang: 'en', oneBoard: true }, 'medium');
    expect(plan.blocks).not.toContain('practice');
    expect(plan.blocks.length).toBeLessThanOrEqual(4);
  });
  it('shows a term once when its local word is the same', () => {
    expect(termSame({ en: 'addition', local: 'Addition' })).toBe(true);
    expect(termSame({ en: 'addition', local: 'जोड़' })).toBe(false);
  });
});
