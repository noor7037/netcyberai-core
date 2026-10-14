import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CERT_DEFS } from '@/lib/certificates/definitions';
import { findToolSpec } from '@/lib/free-tools/specs';
import { TOOL_EXAMPLES } from '@/demo-fixture/free-tool-examples';
import { blogPosts } from './blog';
import { KIND_ORDER, REMOVED_TOOL_REDIRECTS, TRIAL_CTA, freeTools } from './free-tools';

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
      expect(t.faqs.length, `${t.slug} faqs`).toBeGreaterThanOrEqual(4);
      expect(t.faqs.length, `${t.slug} faqs`).toBeLessThanOrEqual(6);
      expect(t.steps.length, `${t.slug} steps`).toBeGreaterThanOrEqual(3);
      expect(t.problem.length, `${t.slug} problem`).toBeGreaterThan(60);
      expect(t.keywords.length, `${t.slug} keywords`).toBeGreaterThanOrEqual(3);
      if (t.blogSlug) expect(blogPosts.some((p) => p.slug === t.blogSlug), `${t.slug} blog ${t.blogSlug}`).toBe(true);
    });
  }
});

describe('free tools are wired to working screens', () => {
  it('has the ten decision tools, seven certificates and every office, compliance and teaching tool', () => {
    expect(freeTools.filter((t) => t.kind === 'decision')).toHaveLength(10);
    expect(freeTools.filter((t) => t.kind === 'certificate').map((t) => t.slug).sort()).toEqual(CERT_DEFS.map((d) => d.slug).sort());
    const slugs = (k: string) => freeTools.filter((t) => t.kind === k).map((t) => t.slug);
    expect(slugs('data')).toEqual(['student-import-checker', 'student-data-check']);
    expect(slugs('compliance')).toEqual(['rte-claim-sheet-builder', 'teacher-qualification-register']);
    expect(slugs('office')).toEqual(['admissions-enquiry-tracker', 'fee-promise-tracker']);
    expect(slugs('teaching')).toEqual(['report-card-remarks-builder', 'lesson-plan-worksheet-maker']);
  });
  it('lists every kind in the page order exactly once', () => {
    expect([...KIND_ORDER].sort()).toEqual([...new Set(freeTools.map((t) => t.kind))].sort());
  });
  it('gives every own-screen tool a component in the page dispatch', () => {
    const page = readFileSync('src/app/free-tools/[slug]/page.tsx', 'utf8');
    for (const t of freeTools.filter((x) => !['decision', 'certificate'].includes(x.kind))) expect(page, t.slug).toContain(`'${t.slug}':`);
  });
  it('gives every calculator a spec and example values', () => {
    for (const t of freeTools.filter((x) => x.kind === 'decision' && x.slug !== 'exam-marks-analyzer')) {
      expect(findToolSpec(t.slug), t.slug).toBeDefined();
      expect(TOOL_EXAMPLES[t.slug], t.slug).toBeDefined();
    }
  });
  it('keeps the founder’s call to action word for word, linked to the trial page', () => {
    expect(TRIAL_CTA.text).toBe('NetCyberAI can automate all these types of requests. Book your free 1-month trial session instantly to streamline your workflows.');
    expect(TRIAL_CTA.href).toBe('/start-pilot');
  });
  it('redirects every removed tool address and never lists it', () => {
    const config = readFileSync('next.config.js', 'utf8');
    for (const r of REMOVED_TOOL_REDIRECTS) {
      expect(config).toContain(`source: '${r.source}', destination: '${r.destination}', permanent: true`);
      expect(freeTools.some((t) => `/free-tools/${t.slug}` === r.source)).toBe(false);
    }
  });
});
