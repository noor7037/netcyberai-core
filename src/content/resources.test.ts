import { describe, expect, it } from 'vitest';
import { resourceSections } from './resources';

const words = (s: string) => s.trim().split(/\s+/).length;

describe('resource sections', () => {
  it('has unique slugs', () => {
    expect(new Set(resourceSections.map((r) => r.slug)).size).toBe(resourceSections.length);
  });
  for (const r of resourceSections) {
    it(`${r.slug} meets SEO/AEO rules`, () => {
      expect(r.description.length, `${r.slug} description`).toBeGreaterThanOrEqual(150);
      expect(r.description.length, `${r.slug} description`).toBeLessThanOrEqual(160);
      expect(words(r.heroLead), `${r.slug} lead words`).toBeGreaterThanOrEqual(40);
      expect(words(r.heroLead), `${r.slug} lead words`).toBeLessThanOrEqual(60);
      expect(`${r.title} | NetCyberAI`.length).toBeLessThanOrEqual(60);
      if (r.faqs) {
        expect(r.faqs.length).toBeGreaterThanOrEqual(4);
        expect(r.faqs.length).toBeLessThanOrEqual(6);
      }
    });
  }
});
