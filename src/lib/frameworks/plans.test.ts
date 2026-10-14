import { describe, expect, it } from 'vitest';
import { MODULE_REGISTRY } from '@/lib/contracts/modules';
import * as plans from './plans';
import { BILLING_PERIODS, PLAN_FEATURES, planFromRow, workingModules } from './plans';

// Plans are rows of the plans table (C204): this file holds how a row is
// read, never a plan. The rules on the whole schema (applying a plan, the
// plan a new school gets, prices per student and the amount due, C212) are
// proven in test/control/billing-plans.test.ts and billing-pricing.test.ts.

const row = (over: Record<string, unknown> = {}) => ({
  plan_id: 'made-up',
  name: 'Made-up plan',
  price_month_minor: null,
  price_year_minor: null,
  currency: 'INR',
  grace_days: 7,
  all_working_modules: false,
  module_ids: [],
  features: [],
  whatsapp_messages_per_student_month: null,
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
    expect(planFromRow(row({ all_working_modules: true })).waitingModuleIds).toEqual([]);
  });

  it('a chosen list is kept as chosen; a module the registry no longer has is dropped; one not built yet waits', () => {
    const plan = planFromRow(row({ module_ids: ['students', 'a-module-that-was-removed', 'fees', 'learning-genome'] }));
    expect(plan.moduleIds).toEqual(['students', 'fees']);
    expect(plan.waitingModuleIds).toEqual(['learning-genome']);
    expect(MODULE_REGISTRY.find((m) => m.id === 'learning-genome')!.status).not.toMatch(/^(live|partial)$/);
    expect(plan.allWorkingModules).toBe(false);
  });

  it('no price yet is empty, never zero; prices per student come back in paise as numbers; a free plan is zero', () => {
    expect(planFromRow(row())).toMatchObject({ priceMonthMinor: null, priceYearMinor: null, messagesPerStudentMonth: null });
    expect(planFromRow(row({ price_month_minor: '2500', price_year_minor: '25000' }))).toMatchObject({ priceMonthMinor: 2500, priceYearMinor: 25000 });
    expect(planFromRow(row({ price_month_minor: 0, price_year_minor: 0 }))).toMatchObject({ priceMonthMinor: 0, priceYearMinor: 0 });
    expect(planFromRow(row({ whatsapp_messages_per_student_month: 12 })).messagesPerStudentMonth).toBe(12);
    expect(BILLING_PERIODS).toEqual(['month', 'year']);
  });

  it('features are kept only when the code knows them', () => {
    expect(planFromRow(row({ features: ['personal-best', 'a-feature-that-was-removed'] })).features).toEqual(['personal-best']);
    expect(PLAN_FEATURES).toContain('personal-best');
  });

  it('limits are kept a module, and only for modules the registry has', () => {
    const plan = planFromRow(row({ limits: { 'teacher-copilot': { monthly_tokens: 5000 }, 'a-module-that-was-removed': { x: 1 }, students: 'not a set of limits' } }));
    expect(plan.limits).toEqual({ 'teacher-copilot': { monthly_tokens: 5000 } });
  });

  it('retired is read from the day it was retired', () => {
    expect(planFromRow(row()).retired).toBe(false);
    expect(planFromRow(row({ retired_at: new Date() })).retired).toBe(true);
  });

  it('the module holds no list of plans and no plan id: only functions that read the table, and the names of things a plan is made of', () => {
    for (const [name, value] of Object.entries(plans)) {
      if (typeof value === 'function') continue;
      // What is left: the two periods a school pays for, the features a plan can give, and the platform setting's key.
      expect(['BILLING_PERIODS', 'PLAN_FEATURES', 'DEFAULT_PLAN_SETTING'], name).toContain(name);
    }
    expect(plans.DEFAULT_PLAN_SETTING).toBe('billing.default_plan');
  });
});
