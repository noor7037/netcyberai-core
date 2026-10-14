import { describe, expect, it } from 'vitest';
import { MODULE_REGISTRY } from '@/lib/contracts/modules';
import * as plans from './plans';
import { planFromRow, PLAN_PERIODS, workingModules } from './plans';

// Plans are rows of the plans table (C204): this file holds how a row is
// read, never a plan. The rules on the whole schema (applying a plan, the
// plan a new school gets) are proven in test/control/billing-plans.test.ts.

const row = (over: Record<string, unknown> = {}) => ({
  plan_id: 'made-up',
  name: 'Made-up plan',
  price_minor: null,
  currency: 'INR',
  period: null,
  grace_days: 7,
  all_working_modules: false,
  module_ids: [],
  limits: {},
  retired_at: null,
  ...over,
});

describe('plans', () => {
  it('“every module that works today” is derived from the registry: live and partial, nothing else', () => {
    const working = workingModules();
    expect(working).toEqual(MODULE_REGISTRY.filter((m) => m.status === 'live' || m.status === 'partial').map((m) => m.id));
    expect(working).toEqual(expect.arrayContaining(['students', 'parents', 'attendance', 'help-center']));
    for (const id of working) expect(['live', 'partial']).toContain(MODULE_REGISTRY.find((m) => m.id === id)!.status);
  });

  it('a plan that gives every working module resolves to them when it is read, whatever its list says', () => {
    expect(planFromRow(row({ all_working_modules: true })).moduleIds).toEqual(workingModules());
    expect(planFromRow(row({ all_working_modules: true })).allWorkingModules).toBe(true);
  });

  it('a chosen list is kept as chosen; a module the registry no longer has is dropped', () => {
    const plan = planFromRow(row({ module_ids: ['students', 'a-module-that-was-removed', 'fees'] }));
    expect(plan.moduleIds).toEqual(['students', 'fees']);
    expect(plan.allWorkingModules).toBe(false);
  });

  it('no price yet is empty, never zero; a price comes back in paise as a number; a free plan is zero', () => {
    expect(planFromRow(row()).priceMinor).toBeNull();
    expect(planFromRow(row({ price_minor: '250000', period: 'quarter' }))).toMatchObject({ priceMinor: 250000, period: 'quarter' });
    expect(planFromRow(row({ price_minor: 0, period: 'year' })).priceMinor).toBe(0);
    expect(PLAN_PERIODS).toEqual(['month', 'quarter', 'year']);
  });

  it('limits are kept a module, and only for modules the registry has', () => {
    const plan = planFromRow(row({ limits: { 'teacher-copilot': { monthly_tokens: 5000 }, 'a-module-that-was-removed': { x: 1 }, students: 'not a set of limits' } }));
    expect(plan.limits).toEqual({ 'teacher-copilot': { monthly_tokens: 5000 } });
  });

  it('retired is read from the day it was retired', () => {
    expect(planFromRow(row()).retired).toBe(false);
    expect(planFromRow(row({ retired_at: new Date() })).retired).toBe(true);
  });

  it('the module holds no list of plans and no plan id: only functions that read the table, and the name of the setting', () => {
    for (const [name, value] of Object.entries(plans)) {
      if (typeof value === 'function') continue;
      // What is left is the periods a price can be for and the platform setting's key.
      expect(['PLAN_PERIODS', 'DEFAULT_PLAN_SETTING'], name).toContain(name);
    }
    expect(plans.DEFAULT_PLAN_SETTING).toBe('billing.default_plan');
  });
});
