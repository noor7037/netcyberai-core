// Every data-drawn feature page meets the SEO audit's text rules (scripts/seo_audit.py), checked here without a server
// (C533): the title with " | NetCyberAI" at most 60 characters, the meta description 150-160, and the page's first
// paragraph (the lead) 40-60 words.
import { describe, expect, it } from 'vitest';
import { featureDetails } from '@/content/features';

const SUFFIX = ' | NetCyberAI';

describe('feature pages fit the SEO audit', () => {
  for (const f of featureDetails) {
    it(f.slug, () => {
      expect((f.title + SUFFIX).length, `title: ${f.title}`).toBeLessThanOrEqual(60);
      expect(f.metaDescription.length, `meta: ${f.metaDescription}`).toBeGreaterThanOrEqual(150);
      expect(f.metaDescription.length, `meta: ${f.metaDescription}`).toBeLessThanOrEqual(160);
      const words = f.lead.split(/\s+/).filter(Boolean).length;
      expect(words, `lead: ${f.lead}`).toBeGreaterThanOrEqual(40);
      expect(words, `lead: ${f.lead}`).toBeLessThanOrEqual(60);
    });
  }
});
