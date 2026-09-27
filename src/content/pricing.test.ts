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
