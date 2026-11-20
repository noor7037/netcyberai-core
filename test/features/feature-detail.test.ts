import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { FeatureDetail } from '@/content/features/types';

const base = {
  blurb: 'A short line.',
  icon: 'check',
  tone: 'product',
  lead: 'The lead line.',
  metaDescription: 'Meta.',
  howItWorks: [
    { title: 'First step', detail: 'Do the first thing.' },
    { title: 'Second step', detail: 'Do the second thing.' },
  ],
  whatYouGet: ['A thing you get'],
  whoUsesIt: [{ role: 'Teacher', text: 'Uses it daily.' }],
  faqs: [{ question: 'Is it a question?', answer: 'Yes.' }],
  related: [],
} as const;

const school = { ...base, slug: 'school-sample', audience: 'school', module: 'exams', name: 'School sample', title: 'School sample title' } as unknown as FeatureDetail;
const family = { ...base, slug: 'family-sample', audience: 'family', name: 'Family sample', title: 'Family sample title' } as unknown as FeatureDetail;

vi.mock('@/content/features', () => ({
  featureDetails: [school, family],
  schoolFeatureDetails: [school],
  familyFeatureDetails: [family],
  featureDetail: (s: string) => [school, family].find((f) => f.slug === s),
}));

describe('FeatureDetailView', () => {
  it('renders a school feature with steps and the module status label', async () => {
    const { FeatureDetailView } = await import('@/components/features/FeatureDetailView');
    const { STATUS_LABEL, moduleStatus } = await import('@/content/module-status');
    const html = renderToStaticMarkup(createElement(FeatureDetailView, { feature: school, related: [family] }));
    expect(html).toContain('School sample title');
    expect(html).toContain('For schools');
    expect(html).toContain('First step');
    expect(html).toContain('Second step');
    expect(html).toContain(STATUS_LABEL[moduleStatus.exams.status]);
    expect(html).toContain('/features/family-sample');
    expect(html).not.toContain('Ask us about Family plans');
  });

  it('renders a family feature with the Family CTA and no status', async () => {
    const { FeatureDetailView } = await import('@/components/features/FeatureDetailView');
    const html = renderToStaticMarkup(createElement(FeatureDetailView, { feature: family, related: [] }));
    expect(html).toContain('For families');
    expect(html).toContain('Ask us about Family plans');
    expect(html).toContain('See the Family app');
    expect(html).toContain('/products/family-app');
  });
});

describe('sitemap', () => {
  it('lists /features/<slug> for every feature detail', async () => {
    const sitemap = (await import('@/app/sitemap')).default;
    const urls = sitemap().map((e) => e.url);
    expect(urls.some((u) => u.endsWith('/features/school-sample'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/features/family-sample'))).toBe(true);
  });
});
