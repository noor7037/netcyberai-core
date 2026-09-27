import { describe, expect, it } from 'vitest';
import { freeTools } from './free-tools';

const words = (s: string) => s.trim().split(/\s+/).length;

describe('free tools content meets SEO/AEO rules', () => {
  it('has unique slugs', () => {
    expect(new Set(freeTools.map((t) => t.slug)).size).toBe(freeTools.length);
  });
  for (const t of freeTools) {
    it(`${t.slug}`, () => {
      expect(t.description.length, `${t.slug} description`).toBeGreaterThanOrEqual(150);
      expect(t.description.length, `${t.slug} description`).toBeLessThanOrEqual(160);
      expect(words(t.heroLead), `${t.slug} lead words`).toBeGreaterThanOrEqual(40);
      expect(words(t.heroLead), `${t.slug} lead words`).toBeLessThanOrEqual(60);
      expect(`${t.title} | NetCyberAI`.length, `${t.slug} title`).toBeLessThanOrEqual(60);
    });
  }
});
