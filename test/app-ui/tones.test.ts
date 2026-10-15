import { describe, expect, it } from 'vitest';
import { accessibleTextColors, colors, deepColors, onAccentColors } from '@/lib/design-tokens';
import { HERO_TONES, STATUS_TONES, TOKEN_TONES } from '@/components/app-ui/tones';
import { MODULE_GROUPS } from '@/lib/contracts/modules';

// check_contrast.py reads className attributes only, so it cannot see the
// tone table. This computes every pairing in it with the WCAG formula,
// from the same hex values Tailwind is configured with.

const HEX: Record<string, string> = {
  white: '#FFFFFF',
  'off-white': colors.offWhite,
  ...Object.fromEntries(Object.entries(colors).filter(([k]) => k !== 'offWhite')),
  'royal-deep': deepColors.royalDeep,
  'grape-deep': deepColors.grapeDeep,
  'tangerine-deep': deepColors.tangerineDeep,
  'coral-deep': deepColors.coralDeep,
  'gold-deep': deepColors.goldDeep,
  'amber-text': accessibleTextColors.amberText,
  'cyan-text': onAccentColors.onCyan,
};

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = ([r, g, b]: number[]) => {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
// "bg-royal/10" over a white page.
function surface(cls: string): number[] {
  const m = cls.match(/\bbg-([a-z-]+?)(?:\/(\d+))?(?:\s|$)/)!;
  const [r, g, b] = rgb(HEX[m[1]]);
  const a = m[2] ? Number(m[2]) / 100 : 1;
  return [r, g, b].map((v) => Math.round(v * a + 255 * (1 - a)));
}
const text = (cls: string) => rgb(HEX[cls.match(/\btext-([a-z-]+)/)![1]]);

describe('tone table contrast', () => {
  for (const [token, t] of Object.entries(TOKEN_TONES)) {
    it(`${token}: solid, soft and text pairings reach 4.5:1`, () => {
      expect(ratio(text(t.solid), surface(t.solid))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(text(t.soft), surface(t.soft))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(text(t.fg), rgb('#FFFFFF'))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(text(t.fg), rgb(colors.offWhite))).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('every group tone and status tone has classes', () => {
    for (const g of MODULE_GROUPS) for (const tok of g.tone) expect(TOKEN_TONES[tok]).toBeDefined();
    for (const tok of Object.values(STATUS_TONES)) expect(TOKEN_TONES[tok]).toBeDefined();
  });
});

// The page banner (C235-C): white text on a gradient. Every stop of every
// banner takes white at 4.5:1 or more (a gradient between two passing stops
// is never lighter than its lighter stop); the frosted icon tile (white at
// 15% over a stop) keeps its white glyph at 3:1, the floor for a graphic.
describe('banner gradients', () => {
  const blend = (a: number, over: number[]) => over.map((v) => Math.round(255 * a + v * (1 - a)));
  for (const [token, hero] of Object.entries(HERO_TONES)) {
    it(`${token}: both stops take white text; the glass tile keeps 3:1`, () => {
      expect(hero.cls).toBe(`from-${hero.stops[0]} to-${hero.stops[1]}`);
      for (const stop of hero.stops) {
        expect(HEX[stop], stop).toBeDefined();
        expect(ratio(rgb('#FFFFFF'), rgb(HEX[stop])), stop).toBeGreaterThanOrEqual(4.5);
        expect(ratio(rgb('#FFFFFF'), blend(0.15, rgb(HEX[stop]))), stop).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it('the base under every banner (bg-grape, what check_contrast.py reads) is the lowest-contrast stop any banner uses', () => {
    const lowest = Math.min(...Object.values(HERO_TONES).flatMap((h) => h.stops.map((s) => ratio(rgb('#FFFFFF'), rgb(HEX[s])))));
    expect(ratio(rgb('#FFFFFF'), rgb(HEX.grape))).toBeCloseTo(lowest, 5);
  });
});
