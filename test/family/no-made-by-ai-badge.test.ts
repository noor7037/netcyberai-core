import { createElement as h } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UnderstandView } from '@/components/family/UnderstandView';
import type { ResolverEvent } from '@/lib/family/resolver';
import { familyWords } from '@/lib/family/words';
import { UNDERSTAND_KEYS } from '@/lib/family/understand-words';

// Noor, 16 Nov 2026: the tutor answer carries no "Made by AI" badge, checked or not, cached or not.
describe('no "Made by AI" badge on the tutor answer', () => {
  const w = familyWords('en', UNDERSTAND_KEYS);
  const explanation = { type: 'direct_answer', text: 'Plants make food from light.' };
  for (const label of ['ai_made', 'checked'] as const) {
    it(`never renders for a ${label} answer`, () => {
      const initial = [{ t: 'meta', label, cached: label === 'checked', title: 'Q', subject: 'science', topicKey: null }, { t: 'block', block: explanation }, { t: 'done', complete: true }] as unknown as ResolverEvent[];
      const html = renderToStaticMarkup(h(UnderstandView, { w, input: { kind: 'question', text: 'How does photosynthesis work?' }, tone: 'science', initial }));
      expect(html).not.toContain('data-ai-notice');
      expect(html).not.toContain('data-made');
      expect(html).not.toMatch(/Made by AI/i);
      expect(html).not.toContain('/family/about-ai');
    });
  }
  it('the tutor view, its words and the design tokens do not mention it', () => {
    expect(readFileSync('src/components/family/UnderstandView.tsx', 'utf8')).not.toMatch(/AiNotice|Made by AI/);
    expect(readFileSync('src/lib/design-tokens.ts', 'utf8')).not.toMatch(/Made by AI/);
    expect(UNDERSTAND_KEYS.filter((k) => k.startsWith('fam.ai.notice'))).toEqual([]);
  });
});
