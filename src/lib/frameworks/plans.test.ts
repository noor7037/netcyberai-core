import { describe, expect, it } from 'vitest';
import { MODULE_REGISTRY } from '@/lib/contracts/modules';
import { DEFAULT_PLAN_ID, planById, PLANS } from './plans';

describe('plans', () => {
  it('the default plan is every module that works today, derived from the registry', () => {
    const plan = planById(DEFAULT_PLAN_ID)!;
    const working = MODULE_REGISTRY.filter((m) => m.status === 'live' || m.status === 'partial').map((m) => m.id);
    expect(plan.modules).toEqual(working);
    expect(plan.modules).toEqual(expect.arrayContaining(['students', 'parents', 'attendance', 'help-center']));
    for (const id of plan.modules) expect(['live', 'partial']).toContain(MODULE_REGISTRY.find((m) => m.id === id)!.status);
  });

  it('plan ids are unique and fit the database check', () => {
    expect(new Set(PLANS.map((p) => p.planId)).size).toBe(PLANS.length);
    for (const p of PLANS) expect(p.planId).toMatch(/^[a-z0-9_-]{1,40}$/);
    expect(planById('gold')).toBeNull();
  });
});
