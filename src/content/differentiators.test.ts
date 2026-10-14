import { describe, expect, it } from 'vitest';
import { differentiators } from './differentiators';
import { freeTools } from './free-tools';
import { moduleStatus } from './module-status';

// The homepage must never say more than the product does (Decision Log C198-B).
describe('beyond-the-ERP cards stay honest', () => {
  for (const d of differentiators) {
    it(d.id, () => {
      const m = d.moduleId ? moduleStatus[d.moduleId].status : undefined;
      if (d.status === 'app') expect(['live', 'partial'], `${d.id} claims the app`).toContain(m);
      if (d.status === 'switching-on') expect(m, `${d.id} claims built`).toBe('foundation');
      if (m === 'planned' || m === 'needs-spec' || m === undefined) expect(d.status, `${d.id} has no built module`).toBe('planned');
      expect(d.freeTools.length).toBeGreaterThan(0);
      for (const slug of d.freeTools) expect(freeTools.some((t) => t.slug === slug), `${d.id} links ${slug}`).toBe(true);
    });
  }
});
