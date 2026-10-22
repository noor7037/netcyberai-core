import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProgressRing } from '@/components/family/ui/ProgressRing';
import { SubjectGrid } from '@/components/family/ui/SubjectGrid';
import { accessibleTextColors, colors, deepColors } from '@/lib/design-tokens';
import { SUBJECT_THEME, subjectTheme } from '@/lib/family/subject-theme';
import { SUBJECT_IDS } from '@/lib/family/subjects';

// D1 (C230-Q): the subject colours are class strings chosen at run time, which scripts/check_contrast.py cannot read,
// so this holds their contrast instead: white text on every gradient stop and every solid chip, and each subject's
// coloured text on white, all at AA (4.5:1).
const TOKEN: Record<string, string> = {
  sapphire: colors.sapphire,
  midnight: colors.midnight,
  azure: colors.azure,
  royal: colors.royal,
  'royal-deep': deepColors.royalDeep,
  electric: colors.electric,
  emerald: colors.emerald,
  'emerald-text': accessibleTextColors.emeraldText,
  grape: colors.grape,
  'grape-deep': deepColors.grapeDeep,
  violet: colors.violet,
  'tangerine-deep': deepColors.tangerineDeep,
  'coral-deep': deepColors.coralDeep,
  'gold-deep': deepColors.goldDeep,
};

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const onWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05);
const hexOf = (cls: string, prefix: string) => {
  const name = cls.slice(prefix.length);
  if (!(name in TOKEN)) throw new Error(`${cls} is not a text-safe token`);
  return TOKEN[name];
};

describe('subject colours (D1)', () => {
  it('gives every subject a theme', () => {
    for (const s of SUBJECT_IDS) expect(SUBJECT_THEME[s], s).toBeDefined();
  });

  it('keeps white text at AA on every gradient stop and chip', () => {
    for (const [s, theme] of Object.entries(SUBJECT_THEME)) {
      const stops = theme.tile.split(' ').filter((c) => c.startsWith('from-') || c.startsWith('to-') || c.startsWith('via-'));
      expect(stops.length, s).toBeGreaterThanOrEqual(2);
      for (const stop of stops) expect(onWhite(hexOf(stop, stop.slice(0, stop.indexOf('-') + 1))), `${s} ${stop}`).toBeGreaterThanOrEqual(4.5);
      expect(onWhite(hexOf(theme.chip, 'bg-')), `${s} ${theme.chip}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps each subject\'s coloured text at AA on white', () => {
    for (const [s, theme] of Object.entries(SUBJECT_THEME)) expect(onWhite(hexOf(theme.ink, 'text-')), `${s} ${theme.ink}`).toBeGreaterThanOrEqual(4.5);
  });

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
