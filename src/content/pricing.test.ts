import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { commercialClaims, publishedClaims, plans, moduleRows } from './pricing';

describe('pricing claims discipline', () => {
  it('publishes only confirmed claims', () => {
    expect(publishedClaims.every((c) => c.status === 'confirmed')).toBe(true);
    expect(publishedClaims.length).toBeGreaterThan(0);
  });
  it('every claim records its evidence', () => {
    for (const c of commercialClaims) expect(c.evidence.length, c.id).toBeGreaterThan(20);
  });
  it('the pricing page never hardcodes an unconfirmed claim', () => {
    const page = readFileSync('src/app/pricing/page.tsx', 'utf8');
    for (const c of commercialClaims.filter((x) => x.status !== 'confirmed')) {
      expect(page.includes(c.title), `${c.id} title appears in the page source`).toBe(false);
    }
  });
  it('has the four requested plans, one recommended', () => {
    expect(plans.map((p) => p.name)).toEqual(['Free', 'Starter', 'Growth', 'Compass']);
    expect(plans.filter((p) => p.recommended)).toHaveLength(1);
  });
  it('plans only ever add modules as you go up', () => {
    for (const r of moduleRows) {
      const order = [r.in.free, r.in.starter, r.in.growth, r.in.compass];
      const firstIn = order.indexOf(true);
      expect(order.slice(firstIn).every(Boolean), r.module).toBe(true);
    }
  });
});

describe('homepage promise row (founder, C80)', () => {
  it('shows the four promises and the guarantee from confirmed claims', async () => {
    const { heroChips, heroGuarantee } = await import('./pricing');
    expect(heroChips()).toEqual([
      'No setup fees',
      'Complete SOP & free staff training',
      'Free first month with full capabilities',
      'Seamless move from registers & ledgers to digital',
    ]);
    // Source: founder commitment, Decision Log C80 (claim money-back-6m).
    expect(heroGuarantee()).toBe('Six-month 100% money-back guarantee if you see no overall growth, including student learning growth and institutional development.');
  });
  it('no page shows the old demo label', () => {
    const { execSync } = require('node:child_process') as typeof import('node:child_process');
    const hits = execSync("grep -rln 'DemoLabel\\|Demo school · fictional numbers' src/app src/components || true").toString().trim();
    expect(hits).toBe('');
  });
  it('hero headline is the brand line, with no eyebrow above it', () => {
    const hero = readFileSync('src/components/home/Hero.tsx', 'utf8');
    expect(hero).toContain('Smarter Schools. <span className="nca-brighter">Brighter Futures.</span>');
    expect(hero).not.toMatch(/complete school management platform/i);
    expect(hero).not.toContain('Simpler School Operations');
  });
});
