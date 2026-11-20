import { describe, expect, it } from 'vitest';
import { features } from '@/content/features/family-life';
import { FAMILY_FEATURE_SLUGS, SCHOOL_FEATURE_SLUGS } from '@/content/features/types';

const MINE = ['draw-studio', 'future-careers-exams-schemes', 'parent-controls-progress', 'school-link', 'family-app-getting-started'];
const ALL = new Set<string>([...SCHOOL_FEATURE_SLUGS, ...FAMILY_FEATURE_SLUGS]);

describe('family life feature pages', () => {
  it('has the five slugs once each', () => {
    expect(features.map((f) => f.slug).sort()).toEqual([...MINE].sort());
  });
  for (const f of features) {
    describe(f.slug, () => {
      it('has the shape', () => {
        expect(f.audience).toBe('family');
        expect(f.module).toBeUndefined();
        expect(f.name.split(' ').length).toBeGreaterThanOrEqual(2);
        expect(f.name.split(' ').length).toBeLessThanOrEqual(4);
        expect(f.blurb.length).toBeLessThan(50);
        expect(f.metaDescription.length).toBeLessThanOrEqual(160);
        expect(f.howItWorks.length).toBeGreaterThanOrEqual(4);
        expect(f.howItWorks.length).toBeLessThanOrEqual(6);
        expect(f.whatYouGet.length).toBeGreaterThanOrEqual(4);
        expect(f.whatYouGet.length).toBeLessThanOrEqual(6);
        expect(f.faqs.length).toBeGreaterThanOrEqual(3);
        expect(f.faqs.length).toBeLessThanOrEqual(5);
      });
      it('links only to real slugs', () => {
        for (const r of f.related) expect(ALL.has(r)).toBe(true);
      });
      it('says nothing forbidden', () => {
        expect(JSON.stringify(f)).not.toMatch(/\blive\b|coming soon|focus lock|[₹$]|\brs\.?\s?\d/i);
      });
    });
  }
  it('answers the two parent questions', () => {
    const q = features.find((f) => f.slug === 'parent-controls-progress')!.faqs.map((x) => x.question);
    expect(q).toContain('Can I see what my child asks the tutor?');
    expect(q).toContain('Can I delete my child’s data?');
  });
});
