import { describe, expect, it } from 'vitest';
import { features } from '@/content/features/school';
import { FAMILY_FEATURE_SLUGS, SCHOOL_FEATURE_SLUGS } from '@/content/features/types';

const all: string[] = [...SCHOOL_FEATURE_SLUGS, ...FAMILY_FEATURE_SLUGS];
const texts = (f: (typeof features)[number]) => [
  f.name,
  f.blurb,
  f.title,
  f.lead,
  f.metaDescription,
  ...f.howItWorks.flatMap((s) => [s.title, s.detail]),
  ...f.whatYouGet,
  ...f.whoUsesIt.flatMap((w) => [w.role, w.text]),
  ...f.faqs.flatMap((q) => [q.question, q.answer]),
];

describe('school feature pages', () => {
  it('has every school slug exactly once', () => {
    expect(features.map((f) => f.slug).sort()).toEqual([...SCHOOL_FEATURE_SLUGS].sort());
  });
  for (const f of features) {
    it(f.slug, () => {
      expect(f.audience).toBe('school');
      expect(f.module).toBeTruthy();
      expect(f.metaDescription.length).toBeLessThanOrEqual(160);
      expect(f.howItWorks.length).toBeGreaterThanOrEqual(4);
      expect(f.howItWorks.length).toBeLessThanOrEqual(6);
      for (const r of f.related) expect(all).toContain(r);
      for (const t of texts(f)) expect(t).not.toMatch(/\blive\b|coming soon/i);
    });
  }
});
