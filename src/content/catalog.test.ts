import { describe, expect, it } from 'vitest';
import { products, solutions, type CatalogPage } from './catalog';

// Mirrors scripts/seo_audit.py's per-page rules for every catalogue page,
// so a copy edit fails here, in seconds, instead of in the CI build.
const words = (s: string) => s.trim().split(/\s+/).length;

function checkPage(p: CatalogPage, siblings: CatalogPage[]) {
  expect(p.description.length, `${p.slug} description length`).toBeGreaterThanOrEqual(150);
  expect(p.description.length, `${p.slug} description length`).toBeLessThanOrEqual(160);
  expect(words(p.heroLead), `${p.slug} hero lead words`).toBeGreaterThanOrEqual(40);
  expect(words(p.heroLead), `${p.slug} hero lead words`).toBeLessThanOrEqual(60);
  expect(`${p.title} | NetCyberAI`.length, `${p.slug} title length`).toBeLessThanOrEqual(60);
  expect(p.faqs.length, `${p.slug} faq count`).toBeGreaterThanOrEqual(4);
  expect(p.faqs.length, `${p.slug} faq count`).toBeLessThanOrEqual(6);
  for (const r of p.related) {
    expect(siblings.some((s) => s.slug === r), `${p.slug} related ${r}`).toBe(true);
  }
}

describe('product catalogue', () => {
  it('has unique slugs', () => {
    expect(new Set(products.map((p) => p.slug)).size).toBe(products.length);
  });
  for (const p of products) {
    it(`${p.slug} meets SEO/AEO rules`, () => checkPage(p, products));
  }
});

describe('solution catalogue', () => {
  it('has unique slugs', () => {
    expect(new Set(solutions.map((p) => p.slug)).size).toBe(solutions.length);
  });
  for (const s of solutions) {
    it(`${s.slug} meets SEO/AEO rules`, () => checkPage(s, solutions));
  }
});
