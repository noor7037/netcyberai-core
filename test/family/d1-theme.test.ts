import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProgressRing } from '@/components/family/ui/ProgressRing';
import { SubjectGrid } from '@/components/family/ui/SubjectGrid';
import { SUBJECT_THEME, subjectTheme } from '@/lib/family/subject-theme';
import { SUBJECT_IDS } from '@/lib/family/subjects';

describe('subject colours (D1)', () => {
  it('gives every subject a theme', () => {
    for (const s of SUBJECT_IDS) expect(SUBJECT_THEME[s], s).toBeDefined();
  });

  // W12-E (C419): the colours are the lesson identity's; their contrast and the no-gradient rule are held in
  // test/family/w12-e-identity.test.ts.

  it('falls back to mathematics for a subject it does not know', () => {
    expect(subjectTheme('astrology')).toBe(SUBJECT_THEME.mathematics);
  });
});

describe('ProgressRing', () => {
  const offset = (html: string) => Number(/stroke-dashoffset="([\d.]+)"/.exec(html)?.[1]);
  const length = (html: string) => Number(/stroke-dasharray="([\d.]+)"/.exec(html)?.[1]);

  it('draws the share of the ring that is done', () => {
    const html = renderToStaticMarkup(h(ProgressRing, { value: 3, max: 4 }));
    expect(offset(html)).toBeCloseTo(length(html) * 0.25, 5);
  });

  it('never draws past full or below empty', () => {
    const over = renderToStaticMarkup(h(ProgressRing, { value: 9, max: 4 }));
    expect(offset(over)).toBe(0);
    const none = renderToStaticMarkup(h(ProgressRing, { value: 2, max: 0 }));
    expect(offset(none)).toBeCloseTo(length(none), 5);
  });

  it('is hidden from screen readers, so the number beside it carries the meaning', () => {
    expect(renderToStaticMarkup(h(ProgressRing, { value: 1, max: 2 }))).toContain('aria-hidden="true"');
  });
});

describe('SubjectGrid', () => {
  const words = { free: 'Free', locked: 'Opens with Family Plus', start: 'Start here', meter: (c: number, m: number) => `${c} checked · ${m} mastered` };

  it('shows what is true for each subject: free, locked, or the checked and mastered counts', () => {
    const html = renderToStaticMarkup(
      h(SubjectGrid, {
        title: 'Your subjects',
        words,
        tiles: [
          { subject: 'mathematics', name: 'Mathematics', open: true, free: true, checked: 4, mastered: 1 },
          { subject: 'science', name: 'Science', open: false, free: false, checked: 0, mastered: 0 },
        ],
      }),
    );
    expect(html).toContain('href="/family/study?subject=mathematics"');
    expect(html).toContain('Free');
    expect(html).toContain('4 checked · 1 mastered');
    expect(html).toContain('Start here');
    expect(html).toContain('<span class="sr-only">Opens with Family Plus</span>');
  });

  it('shows nothing for a class without subjects', () => {
    expect(renderToStaticMarkup(h(SubjectGrid, { title: 'Your subjects', words, tiles: [] }))).toBe('');
  });
});
