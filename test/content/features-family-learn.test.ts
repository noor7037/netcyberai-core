import { describe, expect, it } from 'vitest';
import { features } from '@/content/features/family-learn';
import { FAMILY_FEATURE_SLUGS, SCHOOL_FEATURE_SLUGS } from '@/content/features/types';

const SLUGS = ['family-ai-tutor', 'check-my-work', 'study-chapters-labs', 'your-own-syllabus', 'english-speaking-practice'];
const ALL = new Set<string>([...FAMILY_FEATURE_SLUGS, ...SCHOOL_FEATURE_SLUGS]);

describe('family learning feature pages', () => {
  it('has the five slugs, once each', () => {
    expect(features.map((f) => f.slug).sort()).toEqual([...SLUGS].sort());
  });
  for (const f of features) {
    describe(f.slug, () => {
      it('is a family page with no module', () => {
        expect(f.audience).toBe('family');
        expect(f.module).toBeUndefined();
      });
      it('keeps the length limits', () => {
        expect(f.metaDescription.length).toBeLessThanOrEqual(160);
        expect(f.blurb.length).toBeLessThan(50);
        expect(f.howItWorks.length).toBeGreaterThanOrEqual(4);
        expect(f.howItWorks.length).toBeLessThanOrEqual(6);
        expect(f.faqs.length).toBeGreaterThanOrEqual(3);
        expect(f.faqs.length).toBeLessThanOrEqual(5);
      });
      it('links only to real features', () => {
        for (const r of f.related) expect(ALL.has(r)).toBe(true);
      });
      it('says no status, price or other company', () => {
        const text = JSON.stringify(f);
        expect(text).not.toMatch(/\blive\b(?! (practice|conversation|talk|two))/i);
        expect(text).not.toMatch(/coming soon/i);
        expect(text).not.toMatch(/₹|\brs\.?\s?\d|\$\s?\d|per month|\/month/i);
        expect(text).not.toMatch(/youtube|google|canva|app store|play store/i);
      });
    });
  }
});
