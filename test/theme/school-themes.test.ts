import { describe, expect, it } from 'vitest';
import { colors, schoolThemes, SCHOOL_THEME_IDS } from '@/lib/design-tokens';
import { paletteFor, schoolThemeCss } from '@/lib/theme/school-theme';
import config from '../../tailwind.config';

// The school app's themes and dark mode (C553): every theme, light and dark, keeps text readable (WCAG AA: 4.5:1 for
// text, white text on every brand button), the chart colours stay apart from each other, printing is never dark, and
// nothing outside the school app changes (each themed colour falls back to its own token).

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
// OKLab distance, for telling chart colours apart.
const oklab = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
};
const dE = (a: string, b: string) => Math.hypot(...oklab(a).map((v, i) => v - oklab(b)[i]));

describe('school app themes', () => {
  for (const id of SCHOOL_THEME_IDS) {
    for (const dark of [false, true]) {
      it(`${id} ${dark ? 'dark' : 'light'}: text, buttons and coloured text are readable`, () => {
        const p = paletteFor(id, dark);
        expect(ratio(p.text, p.page)).toBeGreaterThanOrEqual(4.5);
        expect(ratio(p.text, p.surface)).toBeGreaterThanOrEqual(4.5);
        for (const b of p.buttons) expect(ratio('#FFFFFF', b), `white on ${b}`).toBeGreaterThanOrEqual(4.5);
        for (const c of p.textOnSurface) expect(ratio(c, p.surface), `${c} on ${p.surface}`).toBeGreaterThanOrEqual(4.5);
      });
    }
    it(`${id}: six chart colours, each clearly apart from the next`, () => {
      const c = schoolThemes[id].chart;
      expect(c).toHaveLength(6);
      for (let i = 1; i < c.length; i++) expect(dE(c[i - 1], c[i]), `${c[i - 1]} / ${c[i]}`).toBeGreaterThan(0.1);
    });
  }

  it('dark is for the screen only: a printed page is always light', () => {
    const css = schoolThemeCss();
    for (const rule of css.split('\n').filter((r) => r.includes('data-nca-mode="dark"') || r.includes('data-nca-mode="system"'))) {
      expect(rule.startsWith('@media screen')).toBe(true);
    }
    for (const id of SCHOOL_THEME_IDS) expect(css).toContain(`[data-nca-theme="${id}"]`);
  });

  it('outside the school app every colour is its own token (the variable is never set there)', () => {
    const c = (config.theme?.extend?.colors ?? {}) as Record<string, unknown>;
    expect(String(c.sapphire)).toContain('0 35 87');
    expect(String((c.royal as Record<string, string>).DEFAULT)).toContain('29 78 216');
    const bg = (config.theme?.extend?.backgroundColor ?? {}) as Record<string, string>;
    expect(bg.white).toContain('255 255 255');
    expect(bg['off-white']).toContain([1, 3, 5].map((i) => parseInt(colors.offWhite.slice(i, i + 2), 16)).join(' '));
  });
});
