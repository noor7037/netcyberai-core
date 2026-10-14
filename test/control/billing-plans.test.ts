import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { createTestDb } from '../db/pglite-harness';
import { billingOverview, createPlan, recordPayment, schoolPayments, setDefaultPlan, setPlanRetired, updatePlan } from '@/lib/control/billing';
import { planInputFromBody, rupeesFromBody } from '@/lib/control/billing-input';
import { BILLING_NIGHTLY_JOB, billingNightlyHandler, runBillingCheckForSchool } from '@/lib/control/billing-nightly';
import { accessNoticeText, schoolAccessNotice } from '@/lib/control/billing-notice';
import { changeModuleEntitlement, changeSchoolAccess, checkModuleAccess, entitlementHistory, loadEntitlements } from '@/lib/frameworks/entitlements';
import { applyDefaultPlan, applyPlan, defaultPlanId, listPlans, workingModules } from '@/lib/frameworks/plans';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';
import { indiaDate } from '@/lib/time/india';

// Control → Billing & Plans (docs/26 slice 8e, C204). The acceptance test:
//   "No plan name or price is in src: the list comes from the table. Applying a plan switches on exactly its
//    modules. A school one day past paid-until is in grace, and after the plan's grace days is read-only, by the
//    nightly check and not only when someone looks."
// On every migration, as the app's own database roles. Every school, person, plan, price and reference is made up.

const ROOT = path.resolve(__dirname, '../..');
const s = (n: number) => `be000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
// A: billed, goes through grace to read-only. B: suspended by hand. C: never billed. D: read-only by hand, for another
// reason. E: the founder gives full access back after the check acted. F: grace set by hand. G: for plans. T: a test school.
const [A, B, C, D, E, F, G, T] = [s(1), s(2), s(3), s(4), s(5), s(6), s(7), s(8)];
const FOUNDER = s(90);
const [PRINCIPAL_A, TEACHER_A, PRINCIPAL_B] = [s(91), s(92), s(93)];
const SEEDED = 'standard'; // the id the migration gives the first plan; no file under src names it

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { school: string; role: string; user: string };
const principalA: Who = { school: A, role: 'principal', user: PRINCIPAL_A };
const teacherA: Who = { school: A, role: 'teacher', user: TEACHER_A };
const principalB: Who = { school: B, role: 'principal', user: PRINCIPAL_B };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <R>(who: Who, fn: (client: any) => Promise<R>): Promise<R> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <R>(fn: (client: any) => Promise<R>): Promise<R> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const by = { userId: FOUNDER };
const founder = { userId: FOUNDER, role: 'super_admin' as const };
const rows = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;
// What a school's own session reads.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const read = (who: Who, sql: string, params: unknown[] = []): Promise<any[]> => as(who, async (c) => (await c.query(sql, params)).rows as any[]);

// India's date today, and days counted from it.
const TODAY = indiaDate();
const day = (n: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const noonOn = (d: string) => () => new Date(`${d}T12:00:00+05:30`);
const midnightStarting = (d: string) => new Date(`${d}T00:00:00+05:30`).toISOString();
const job = (payload: Record<string, unknown> = {}) => ({ jobId: 'j', type: BILLING_NIGHTLY_JOB, payload, attempts: 1, maxAttempts: 8, schoolId: null, idempotencyKey: 'k' });
const nightly = (onDay: string) => billingNightlyHandler({ platform, now: noonOn(onDay) })(job({ date: onDay }));
const stored = async (school: string) => (await rows(`select e.access_mode, e.grace_ends_at, s.paid_until::text as paid_until, s.billing_access, s.billing_access_since::text as since from school_subscriptions s left join school_entitlements e on e.school_id = s.school_id where s.school_id = $1`, [school]))[0];
const accessAudits = async (school: string) => (await rows(`select a.actor_user_id, a.before_state ->> 'access_mode' as was, a.after_state ->> 'access_mode' as now, a.after_state ->> 'by' as by, r.reason from audit_log a left join entitlement_change_reasons r on r.audit_id = a.audit_id where a.school_id = $1 and a.event_action = 'entitlement.access_changed' order by a.audit_id`, [school]));
const planInput = (over: Record<string, unknown> = {}) => ({ name: 'Made-up Plan', priceMinor: null, period: null, graceDays: 5, allWorkingModules: true, moduleIds: [], limits: {}, ...over });
// A school billed until `paidUntil`: a payment recorded on a day in the past, when it still covered the school.
const billed = async (school: string, paidUntil: string) => {
  const r = await platform((c) => recordPayment(c, by, school, { amountMinor: 50_000_00, paidOn: day(-60), coversUntil: paidUntil, reference: `made-up-ref-${school.slice(-2)}` }, day(-60)));
  if (!r.ok) throw new Error(r.reason);
};

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values
      ('${A}', 'School A', 'IN-HR', false), ('${B}', 'School B', 'IN-DL', false), ('${C}', 'School C', 'IN-UP', false), ('${D}', 'School D', 'IN-MH', false),
      ('${E}', 'School E', 'IN-RJ', false), ('${F}', 'School F', 'IN-PB', false), ('${G}', 'School G', 'IN-KA', false), ('${T}', 'Test School', 'IN-GJ', true);
    insert into users (user_id, school_id, email, role, display_name) values
      ('${FOUNDER}', null, 'founder@netcyber.example', 'super_admin', 'Farid Founder'),
      ('${PRINCIPAL_A}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal'),
      ('${TEACHER_A}', '${A}', 'teacher@school-a.example', 'teacher', 'Tara Teacher'),
      ('${PRINCIPAL_B}', '${B}', 'principal@school-b.example', 'principal', 'Bina Principal');
  `);
  // Every school starts as a new school does: on the plan the platform setting names.
  for (const school of [A, B, C, D, E, F, G, T]) await platform((c) => applyDefaultPlan(c, school, { userId: null, role: null }, 'school created for the test'));
}, 120_000);
afterAll(async () => db?.stop());

describe('plans are rows, not code', () => {
  it('the migration seeds one plan from what the constant was: every working module, a name, and no price', async () => {
    expect(await rows(`select plan_id, price_minor, period, all_working_modules, module_ids, retired_at from plans`)).toEqual([{ plan_id: SEEDED, price_minor: null, period: null, all_working_modules: true, module_ids: [], retired_at: null }]);
    expect((await rows(`select name from plans`))[0].name).toMatch(/\S/);
    const [plan] = await platform((c) => listPlans(c));
    expect(plan.moduleIds).toEqual(workingModules());
    expect(plan.priceMinor).toBeNull();
    // Which plan a new school gets is a platform setting, not a constant.
    expect(await platform((c) => defaultPlanId(c))).toBe(SEEDED);
    expect(await rows(`select value from platform_settings where key = 'billing.default_plan'`)).toEqual([{ value: SEEDED }]);
  });

  it('a new school gets the plan the setting names: its modules, its subscription row, not billed yet', async () => {
    expect(await rows(`select plan from school_entitlements where school_id = $1`, [C])).toEqual([{ plan: SEEDED }]);
    expect(await rows(`select plan_id, paid_until, billing_access from school_subscriptions where school_id = $1`, [C])).toEqual([{ plan_id: SEEDED, paid_until: null, billing_access: null }]);
    const on = (await rows(`select module_id from school_module_entitlements where school_id = $1 and enabled and source = 'plan' order by 1`, [C])).map((r: { module_id: string }) => r.module_id);
    expect(on).toEqual([...workingModules()].sort());
  });

  it('a school that was already on a plan when the migration ran gets a subscription row for it, with paid-until empty', async () => {
    const [onPlan, noPlan] = [s(71), s(72)];
    const small = await createTestDb({
      before: {
        migration: '_p5_billing_plans',
        sql: `insert into schools (school_id, name, jurisdiction) values ('${onPlan}', 'On a plan', 'IN-HR'), ('${noPlan}', 'On none', 'IN-DL');
              insert into school_entitlements (school_id, plan) values ('${onPlan}', '${SEEDED}'), ('${noPlan}', 'unassigned');`,
      },
    });
    expect((await small.query(`select school_id, plan_id, paid_until from school_subscriptions`)).rows).toEqual([{ school_id: onPlan, plan_id: SEEDED, paid_until: null }]);
    await small.pg.close();
  });

  it('no plan name, plan id or price is written anywhere in src: every plan in the table is searched for, in every file', async () => {
    // A second plan, with a name and a price, so the search has more than the seed to look for.
    const made = await platform((c) => createPlan(c, by, { ...planInput({ name: 'Zebra Quartz', priceMinor: 4_321_00, period: 'quarter' }), planId: 'zebra-quartz' }));
    expect(made).toMatchObject({ ok: true });
    const plans = await rows(`select plan_id, name, price_minor from plans order by plan_id`);
    expect(plans.length).toBeGreaterThanOrEqual(2);

    // Every .ts and .tsx file under src, the illustrative data of src/demo-fixture included: the website's showcase
    // and the development previews import it, so a plan written there would be a plan written in src.
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) return files(full);
        return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
      });
    const sources = files(path.join(ROOT, 'src'));
    expect(sources.length).toBeGreaterThan(500);
    expect(sources).toContain(path.join(ROOT, 'src/demo-fixture/control-entitlements.ts'));
    // One line is not about a plan and is left out of the search, by its own words: an option of the "Audit Logging"
    // field in the website showcase's illustrative form happens to be the same everyday word as the seeded plan's name.
    const NOT_A_PLAN: Record<string, RegExp> = { 'src/demo-fixture/principal-dashboard.ts': /^.*s\('Audit Logging', \[.*$/m };
    expect(readFileSync(path.join(ROOT, 'src/demo-fixture/principal-dashboard.ts'), 'utf8').match(new RegExp(NOT_A_PLAN['src/demo-fixture/principal-dashboard.ts'].source, 'gm')) ?? []).toHaveLength(1);
    // The files this slice is made of are in the search, by name.
    const mine = ['src/lib/frameworks/plans.ts', 'src/app/(admin)/control/billing-plans/page.tsx', 'src/components/control/BillingPlansView.tsx', 'src/components/control/BillingSchools.tsx', 'src/lib/control/billing.ts', 'src/lib/control/billing-nightly.ts', 'src/lib/control/billing-notice.ts', 'src/lib/onboarding/applications.ts', 'src/app/api/control/schools/route.ts'];
    for (const f of mine) expect(sources, f).toContain(path.join(ROOT, f));

    const quoted = (word: string) => new RegExp(`['"\`>]${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`<]`);
    const found: string[] = [];
    for (const file of sources) {
      const leftOut = NOT_A_PLAN[path.relative(ROOT, file)];
      const text = leftOut ? readFileSync(file, 'utf8').replace(leftOut, '') : readFileSync(file, 'utf8');
      for (const p of plans as { plan_id: string; name: string }[]) {
        if (quoted(p.plan_id).test(text)) found.push(`${path.relative(ROOT, file)}: the plan id ${p.plan_id}`);
        if (quoted(p.name).test(text)) found.push(`${path.relative(ROOT, file)}: the plan name ${p.name}`);
      }
      // A price: a currency sign or "Rs" before a digit, or an amount in paise written as a number.
      if (mine.includes(path.relative(ROOT, file)) && /(₹|\\u20b9|\bRs\.?)\s*\d|(price|amount)_?[mM]inor\s*[:=]\s*\d/.test(text)) found.push(`${path.relative(ROOT, file)}: a price`);
    }
    expect(found).toEqual([]);
    // The screen's own words name no plan either, in either language.
    for (const [key, text] of [...Object.entries(en), ...Object.entries(hi)].filter(([k]) => k.startsWith('billing.') || k.startsWith('accessNotice.'))) {
      for (const p of plans as { name: string }[]) expect(text.toLowerCase(), key).not.toContain(p.name.toLowerCase());
      expect(/(₹|\bRs\.?)\s*\d/.test(text), key).toBe(false);
    }
    // The file that held the constant exports no list and no id (also proven in src/lib/frameworks/plans.test.ts).
    const plansFile = readFileSync(path.join(ROOT, 'src/lib/frameworks/plans.ts'), 'utf8');
    expect(plansFile).not.toMatch(/export const (PLANS|DEFAULT_PLAN_ID)\b/);
    expect(plansFile).toMatch(/from plans/);
  });

  it('the list on the screen comes from the table: a row added is listed with its name, price and how many schools are on it', async () => {
    const o = await platform((c) => billingOverview(c));
    expect(o.plans.map((p) => [p.planId, p.name, p.priceMinor, p.period, p.schools])).toEqual([
      [SEEDED, (await rows(`select name from plans where plan_id = $1`, [SEEDED]))[0].name, null, null, 8],
      ['zebra-quartz', 'Zebra Quartz', 4_321_00, 'quarter', 0],
    ]);
    expect(o.defaultPlanId).toBe(SEEDED);
    expect(o.workingModules).toEqual(workingModules());
  });

  it('a plan is typed in rupees and kept in paise; what is typed wrongly is refused in plain codes', async () => {
    expect([rupeesFromBody('1,500.50'), rupeesFromBody(''), rupeesFromBody(null), rupeesFromBody('12 thousand'), rupeesFromBody(-5), rupeesFromBody(2500)]).toEqual([150050, null, null, undefined, undefined, 250000]);
    expect(planInputFromBody({ name: 'x', priceRupees: 'a lot' })).toEqual({ ok: false, reason: 'price' });
    const make = (over: Record<string, unknown>, planId = 'made-up') => platform((c) => createPlan(c, by, { ...planInput(over), planId }));
    expect(await make({}, 'Has Capitals')).toEqual({ ok: false, reason: 'plan_id' });
    expect(await make({}, 'unassigned')).toEqual({ ok: false, reason: 'plan_id' });
    expect(await make({ name: '   ' })).toEqual({ ok: false, reason: 'name' });
    expect(await make({ priceMinor: 10.5, period: 'year' })).toEqual({ ok: false, reason: 'price' });
    expect(await make({ priceMinor: 100_00 })).toEqual({ ok: false, reason: 'period' }); // a price is always for a period
    expect(await make({ period: 'fortnight' })).toEqual({ ok: false, reason: 'period' });
    expect(await make({ graceDays: 91 })).toEqual({ ok: false, reason: 'grace_days' });
    expect(await make({ graceDays: 2.5 })).toEqual({ ok: false, reason: 'grace_days' });
    expect(await make({ allWorkingModules: false, moduleIds: [] })).toEqual({ ok: false, reason: 'modules' });
    expect(await make({ allWorkingModules: false, moduleIds: ['students', 'students'] })).toEqual({ ok: false, reason: 'modules' });
    expect(await make({ allWorkingModules: false, moduleIds: ['payroll'] })).toEqual({ ok: false, reason: 'modules' }); // not built: not offered in a plan
    expect(await make({ limits: { students: { enrolled: -1 } } })).toEqual({ ok: false, reason: 'limits' });
    expect(await make({ allWorkingModules: false, moduleIds: ['students'], limits: { fees: { dues: 5 } } })).toEqual({ ok: false, reason: 'limits' }); // a limit for a module the plan does not give
    expect(await make({}, 'zebra-quartz')).toEqual({ ok: false, reason: 'id_taken' });
    expect(await make({ name: ' zebra  quartz ' })).toEqual({ ok: false, reason: 'name_taken' });
    // The database holds the same lines for anything that does not come through the screen.
    await expect(db.pg.query(`insert into plans (plan_id, name, grace_days, price_minor) values ('no-period', 'No period', 0, 100)`)).rejects.toThrow(/check constraint/);
    await expect(db.pg.query(`insert into plans (plan_id, name, grace_days, all_working_modules, module_ids) values ('both', 'Both', 0, true, '{students}')`)).rejects.toThrow(/check constraint/);
    await expect(db.pg.query(`insert into plans (plan_id, name, grace_days) values ('same-name', 'ZEBRA QUARTZ', 0)`)).rejects.toThrow(/unique/);
    expect(await rows(`select count(*)::int as n from plans`)).toEqual([{ n: 2 }]);
    // Each plan made or changed is audited as the platform's own event, which no school can read.
    expect(await rows(`select event_action, target_id, school_id, actor_user_id, after_state ->> 'price_minor' as price from audit_log where event_action like 'billing.plan%' order by audit_id`)).toEqual([{ event_action: 'billing.plan_created', target_id: 'zebra-quartz', school_id: null, actor_user_id: FOUNDER, price: '432100' }]);
    expect((await read(principalA, `select 1 from audit_log where event_action like 'billing.plan%'`))).toEqual([]);
  });
});

describe('applying a plan switches on exactly its modules', () => {
  const planRows = async (school: string) => Object.fromEntries((await rows(`select module_id, enabled, source from school_module_entitlements where school_id = $1`, [school])).map((r: { module_id: string; enabled: boolean; source: string }) => [r.module_id, `${r.enabled ? 'on' : 'off'}:${r.source}`]));
  const onFor = async (school: string) => {
    const e = await as({ school, role: 'principal', user: PRINCIPAL_A }, (c) => loadEntitlements(c, school));
    return Object.entries(e.modules).filter(([, m]) => m?.enabled).map(([id]) => id).sort();
  };

  it('a chosen list: those modules on, every other module the last plan gave off; what the founder set by hand keeps the founder’s choice', async () => {
    expect((await platform((c) => createPlan(c, by, { ...planInput({ name: 'Small Made-up', allWorkingModules: false, moduleIds: ['students', 'attendance', 'fees'], limits: { students: { enrolled: 500 } } }), planId: 'small-made-up' }))).ok).toBe(true);
    // By hand, before: Attendance off (the plan gives it), Exams on (no plan gives it).
    await platform((c) => changeModuleEntitlement(c, { schoolId: G, moduleId: 'attendance', enabled: false, reason: 'not yet' }, founder));
    await platform((c) => changeModuleEntitlement(c, { schoolId: G, moduleId: 'exams', enabled: true, reason: 'a pilot' }, founder));

    const applied = await platform((c) => applyPlan(c, G, 'small-made-up', founder, 'moved to the small plan'));
    expect(applied).toMatchObject({ ok: true, modules: ['fees', 'students'] });
    const after = await planRows(G);
    // Exactly the plan's modules are on from the plan...
    expect(Object.entries(after).filter(([id, v]) => v === 'on:plan' && !['help-center', 'raise-ticket'].includes(id)).map(([id]) => id).sort()).toEqual(['fees', 'students']);
    // ...everything else the first plan had given is off (Help is never switched off)...
    const others = workingModules().filter((m) => !['students', 'attendance', 'fees', 'help-center', 'raise-ticket'].includes(m));
    expect(others.length).toBeGreaterThan(3);
    for (const m of others) expect(after[m], m).toBe('off:plan');
    expect((applied as { switchedOff: string[] }).switchedOff).toEqual([...others].sort());
    expect([after['help-center'], after['raise-ticket']]).toEqual(['on:plan', 'on:plan']);
    // ...and the founder's two choices stand, one against the plan and one beyond it.
    expect([after.attendance, after.exams]).toEqual(['off:founder_override', 'on:founder_override']);
    expect(await onFor(G)).toEqual(['exams', 'fees', 'help-center', 'raise-ticket', 'students']);
    // The plan's limit came with its module.
    expect(await rows(`select limits from school_module_entitlements where school_id = $1 and module_id = 'students'`, [G])).toEqual([{ limits: { enrolled: 500 } }]);
    expect(await rows(`select e.plan, s.plan_id from school_entitlements e join school_subscriptions s on s.school_id = e.school_id where e.school_id = $1`, [G])).toEqual([{ plan: 'small-made-up', plan_id: 'small-made-up' }]);
  });

  it('applying it again changes nothing; another plan gives exactly that plan’s modules', async () => {
    const before = await planRows(G);
    expect(await platform((c) => applyPlan(c, G, 'small-made-up', founder, 'again'))).toMatchObject({ ok: true, modules: ['fees', 'students'], switchedOff: [] });
    expect(await planRows(G)).toEqual(before);

    expect((await platform((c) => createPlan(c, by, { ...planInput({ name: 'Other Made-up', allWorkingModules: false, moduleIds: ['students', 'parents'] }), planId: 'other-made-up' }))).ok).toBe(true);
    expect(await platform((c) => applyPlan(c, G, 'other-made-up', founder, 'moved again'))).toMatchObject({ ok: true, modules: ['parents', 'students'], switchedOff: ['fees'] });
    expect(await onFor(G)).toEqual(['exams', 'help-center', 'parents', 'raise-ticket', 'students']);
    // The limit belonged to the small plan: this plan gives Students without one.
    expect(await rows(`select limits from school_module_entitlements where school_id = $1 and module_id = 'students'`, [G])).toEqual([{ limits: {} }]);

    // Back on the plan that gives every working module: all of them, but still not the module the founder switched off.
    expect((await platform((c) => applyPlan(c, G, SEEDED, founder, 'back to everything'))).ok).toBe(true);
    expect(await onFor(G)).toEqual([...workingModules().filter((m) => m !== 'attendance'), 'exams'].sort());
  });

  it('each change of plan is in the school’s history with who and why; an unknown plan is refused', async () => {
    expect(await platform((c) => applyPlan(c, G, 'no-such-plan', founder, 'x y z'))).toEqual({ ok: false, error: 'unknown plan' });
    const history = (await platform((c) => entitlementHistory(c, G))).filter((h) => h.kind === 'plan_applied');
    expect(history.map((h) => [h.plan, h.actorName, h.reason])).toEqual([
      [SEEDED, 'Farid Founder', 'back to everything'],
      ['other-made-up', 'Farid Founder', 'moved again'],
      ['small-made-up', 'Farid Founder', 'again'],
      ['small-made-up', 'Farid Founder', 'moved to the small plan'],
      [SEEDED, null, 'school created for the test'],
    ]);
  });

  it('a retired plan is not given to a school that is not on it; a school on it keeps it; the plan new schools get cannot be retired', async () => {
    expect((await platform((c) => applyPlan(c, F, 'other-made-up', founder, 'on the plan before it is retired'))).ok).toBe(true);
    const kept = await planRows(F);
    expect(await platform((c) => setPlanRetired(c, by, SEEDED, true))).toEqual({ ok: false, reason: 'is_default' });
    expect(await platform((c) => setPlanRetired(c, by, 'no-such-plan', true))).toEqual({ ok: false, reason: 'not_found' });
    expect((await platform((c) => setPlanRetired(c, by, 'other-made-up', true))).ok).toBe(true);
    expect(await rows(`select retired_by, retired_at is not null as retired from plans where plan_id = 'other-made-up'`)).toEqual([{ retired_by: FOUNDER, retired: true }]);

    expect(await platform((c) => applyPlan(c, G, 'other-made-up', founder, 'to a retired plan'))).toEqual({ ok: false, error: 'plan retired' });
    expect(await platform((c) => setDefaultPlan(c, by, 'other-made-up'))).toEqual({ ok: false, reason: 'retired' });
    // The school on it keeps its plan and its modules, and the plan can still be applied to it again.
    expect(await planRows(F)).toEqual(kept);
    expect(await rows(`select plan_id from school_subscriptions where school_id = $1`, [F])).toEqual([{ plan_id: 'other-made-up' }]);
    expect((await platform((c) => applyPlan(c, F, 'other-made-up', founder, 'the same plan again'))).ok).toBe(true);
    const o = await platform((c) => billingOverview(c));
    expect(o.plans.find((p) => p.planId === 'other-made-up')).toMatchObject({ retired: true, schools: 1 });
    expect((await platform((c) => applyPlan(c, F, SEEDED, founder, 'back for the next tests'))).ok).toBe(true);
  });

  it('the plan new schools get is changed in Control, and the next new school starts on it', async () => {
    expect((await platform((c) => setDefaultPlan(c, by, 'small-made-up'))).ok).toBe(true);
    expect(await platform((c) => defaultPlanId(c))).toBe('small-made-up');
    const fresh = s(60);
    await db.pg.query(`insert into schools (school_id, name, jurisdiction) values ($1, 'Fresh School', 'IN-HR')`, [fresh]);
    expect(await platform((c) => applyDefaultPlan(c, fresh, founder, 'a new school'))).toEqual({ planId: 'small-made-up', modules: ['attendance', 'fees', 'students'] });
    expect(await rows(`select event_action, target_id, before_state ->> 'value' as was, after_state ->> 'value' as now from audit_log where event_action = 'platform_setting.update' and target_id = 'billing.default_plan'`)).toEqual([{ event_action: 'platform_setting.update', target_id: 'billing.default_plan', was: SEEDED, now: 'small-made-up' }]);
    expect((await platform((c) => setDefaultPlan(c, by, SEEDED))).ok).toBe(true);
    await db.pg.exec(`set session_replication_role = replica; delete from school_module_entitlements where school_id = '${fresh}'; delete from school_subscriptions where school_id = '${fresh}'; delete from school_entitlements where school_id = '${fresh}'; delete from schools where school_id = '${fresh}'; set session_replication_role = origin;`);
  });

  it('editing a plan is audited with what it was, and does not reach a school until the plan is applied to it again', async () => {
    expect((await platform((c) => applyPlan(c, E, 'small-made-up', founder, 'on the small plan'))).ok).toBe(true);
    const before = await planRows(E);
    const r = await platform((c) => updatePlan(c, by, 'small-made-up', planInput({ name: 'Small Made-up', priceMinor: 9_000_00, period: 'year', graceDays: 3, allWorkingModules: false, moduleIds: ['students', 'homework'] })));
    expect(r).toMatchObject({ ok: true, plan: { priceMinor: 9_000_00, period: 'year', graceDays: 3, moduleIds: ['students', 'homework'] } });
    expect(await planRows(E)).toEqual(before);
    expect(await rows(`select before_state -> 'module_ids' as was, after_state -> 'module_ids' as now, after_state ->> 'price_minor' as price from audit_log where event_action = 'billing.plan_changed'`)).toEqual([{ was: ['students', 'attendance', 'fees'], now: ['students', 'homework'], price: '900000' }]);
    expect(await platform((c) => updatePlan(c, by, 'no-such-plan', planInput()))).toEqual({ ok: false, reason: 'not_found' });
    expect((await platform((c) => applyPlan(c, E, SEEDED, founder, 'back for the next tests'))).ok).toBe(true);
  });
});

describe('the nightly check: grace, then read-only, on dates', () => {
  // A's plan gives five days of grace. Paid until yesterday: the last grace day is today + 4, read-only from today + 5.
  it('one day past paid-until the school is in grace, by the check and not because someone looked', async () => {
    expect((await platform((c) => createPlan(c, by, { ...planInput({ name: 'Five Days Made-up', graceDays: 5 }), planId: 'five-days' }))).ok).toBe(true);
    for (const school of [A, B, D, E, F, T]) expect((await platform((c) => applyPlan(c, school, 'five-days', founder, 'the plan with five days of grace'))).ok).toBe(true);
    await billed(A, day(-1));
    // Past its day, and nothing has changed yet: nothing is worked out when a screen is opened.
    expect(await stored(A)).toMatchObject({ access_mode: 'full', grace_ends_at: null, paid_until: day(-1), billing_access: null });
    expect((await as(principalA, (c) => loadEntitlements(c, A))).accessMode).toBe('full');
    expect(await as(principalA, async (c) => schoolAccessNotice(c, await loadEntitlements(c, A)))).toBeNull();

    await nightly(TODAY);
    const now = await stored(A);
    expect(now).toMatchObject({ access_mode: 'grace', paid_until: day(-1), billing_access: 'grace', since: TODAY });
    expect(new Date(now.grace_ends_at).toISOString()).toBe(midnightStarting(day(5)));
    // In grace everything still works.
    expect((await as(principalA, (c) => checkModuleAccess(c, { schoolId: A, role: 'principal' }, 'students', { write: true }))).ok).toBe(true);
    // Audited, by nobody (the platform itself), with the reason.
    expect(await accessAudits(A)).toEqual([{ actor_user_id: null, was: 'full', now: 'grace', by: 'billing.nightly', reason: `Billing check: paid until ${day(-1)}; the plan gives 5 days of grace. In grace until the end of ${day(4)}.` }]);
  });

  it('the school is told on its own screen, plainly and with the dates, in both languages, and with no amount', async () => {
    const notice = await as(teacherA, async (c) => schoolAccessNotice(c, await loadEntitlements(c, A)));
    expect(notice).toEqual({ kind: 'grace', paidUntil: day(-1), worksUntil: day(4) });
    const [english, hindi] = [accessNoticeText('en', notice!), accessNoticeText('hi', notice!)];
    const words = (d: string, locale: string) => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${d}T00:00:00Z`));
    expect(english).toBe(`Your school’s subscription was paid until ${words(day(-1), 'en-IN')}. Everything keeps working until the end of ${words(day(4), 'en-IN')}. After that the app can be opened and exported but not changed, until NetCyberAI records the payment.`);
    expect(hindi).toContain(words(day(4), 'hi-IN'));
    expect(/[ऀ-ॿ]/.test(hindi)).toBe(true);
    for (const text of [english, hindi]) expect(/₹|\bRs\b|50,?000|rupee|रुपय|रक़म/i.test(text)).toBe(false);
    // The app's layout is where it is shown, from this function and nothing else.
    const layout = readFileSync(path.join(ROOT, 'src/app/(school)/app/layout.tsx'), 'utf8');
    expect(layout).toMatch(/schoolAccessNotice\(db, loaded\)/);
    expect(layout).toMatch(/data-access-notice=\{accessNotice\.kind\}/);
  });

  it('run twice the same night, and again on the last grace day: nothing more changes', async () => {
    const before = [await stored(A), await accessAudits(A)];
    await nightly(TODAY);
    expect([await stored(A), await accessAudits(A)]).toEqual(before);
    await nightly(day(4)); // the last day of grace
    await nightly(day(4));
    expect([await stored(A), await accessAudits(A)]).toEqual(before);
    expect(await platform((c) => runBillingCheckForSchool(c, A, day(4)))).toBeNull();
  });

  it('the day after the grace days the school is read-only, stored and audited; run twice it stays as it is', async () => {
    await nightly(day(5));
    const now = await stored(A);
    expect(now).toMatchObject({ access_mode: 'read_only', paid_until: day(-1), billing_access: 'read_only', since: day(5) });
    expect(new Date(now.grace_ends_at).toISOString()).toBe(midnightStarting(day(5)));
    const audits = await accessAudits(A);
    expect(audits).toHaveLength(2);
    expect(audits[1]).toEqual({ actor_user_id: null, was: 'grace', now: 'read_only', by: 'billing.nightly', reason: `Billing check: paid until ${day(-1)}; the grace period ended. Read-only from ${day(5)}.` });
    await nightly(day(5));
    await nightly(day(9));
    expect([await stored(A), await accessAudits(A)]).toEqual([now, audits]);
    // The school reads, and cannot change; Help stays open.
    expect((await as(principalA, (c) => loadEntitlements(c, A))).accessMode).toBe('read_only');
    expect(await as(principalA, (c) => checkModuleAccess(c, { schoolId: A, role: 'principal' }, 'students', { write: true }))).toMatchObject({ ok: false, error: 'read_only' });
    expect((await as(principalA, (c) => checkModuleAccess(c, { schoolId: A, role: 'principal' }, 'students'))).ok).toBe(true);
    expect((await as(principalA, (c) => checkModuleAccess(c, { schoolId: A, role: 'principal' }, 'raise-ticket', { write: true }))).ok).toBe(true);
    const notice = await as(principalA, async (c) => schoolAccessNotice(c, await loadEntitlements(c, A)));
    expect(notice).toEqual({ kind: 'read_only', paidUntil: day(-1), since: day(5) });
    expect(accessNoticeText('en', notice!)).toMatch(/^Your school’s subscription was paid until .+\. Read-only since .+: everything can be opened and exported, but nothing can be changed\./);
    // The founder sees both steps in the school's history, done by nobody.
    const history = (await platform((c) => entitlementHistory(c, A))).filter((h) => h.kind === 'access_changed');
    expect(history.map((h) => [h.accessMode, h.actorName])).toEqual([[{ from: 'grace', to: 'read_only' }, null], [{ from: 'full', to: 'grace' }, null]]);
  });

  it('a school far past its day when the check first sees it goes straight to read-only; a plan with no grace days gives none', async () => {
    // E: paid until 30 days ago, five days of grace: long over.
    await billed(E, day(-30));
    await nightly(TODAY);
    const e = await stored(E);
    expect(e).toMatchObject({ access_mode: 'read_only', billing_access: 'read_only', since: TODAY });
    expect(new Date(e.grace_ends_at).toISOString()).toBe(midnightStarting(day(-24)));
    expect((await accessAudits(E))[0]).toMatchObject({ was: 'full', now: 'read_only', by: 'billing.nightly' });
    // No grace days: one day past is read-only.
    expect((await platform((c) => createPlan(c, by, { ...planInput({ name: 'No Grace Made-up', graceDays: 0 }), planId: 'no-grace' }))).ok).toBe(true);
    expect((await platform((c) => applyPlan(c, G, 'no-grace', founder, 'no days of grace'))).ok).toBe(true);
    await billed(G, day(-1));
    expect(await platform((c) => runBillingCheckForSchool(c, G, day(-1)))).toBeNull(); // on its paid-until day it is still paid
    expect(await platform((c) => runBillingCheckForSchool(c, G, TODAY))).toMatchObject({ from: 'full', to: 'read_only', graceDays: 0, since: TODAY });
  });

  it('it never touches a suspended school, a school with no paid-until day, or a test school', async () => {
    await billed(B, day(-40));
    await platform((c) => changeSchoolAccess(c, { schoolId: B, accessMode: 'suspended', reason: 'a dispute, nothing to do with the bill' }, founder));
    await billed(T, day(-40));
    const before = [await stored(B), await stored(C), await stored(T), (await rows(`select count(*)::int as n from audit_log where event_action = 'entitlement.access_changed' and school_id = any($1::uuid[])`, [[B, C, T]]))[0].n];
    expect(before[0]).toMatchObject({ access_mode: 'suspended', paid_until: day(-40), billing_access: null });
    expect(before[1]).toMatchObject({ access_mode: 'full', paid_until: null });
    expect(before[2]).toMatchObject({ access_mode: 'full', paid_until: day(-40), billing_access: null });
    await nightly(TODAY);
    await nightly(day(20));
    expect([await stored(B), await stored(C), await stored(T), (await rows(`select count(*)::int as n from audit_log where event_action = 'entitlement.access_changed' and school_id = any($1::uuid[])`, [[B, C, T]]))[0].n]).toEqual(before);
    for (const school of [B, C, T]) expect(await platform((c) => runBillingCheckForSchool(c, school, day(20)))).toBeNull();
  });

  it('it never touches an access mode a person set: read-only for another reason, a grace period set by hand, or full access given back', async () => {
    // D: read-only by hand before the check ever acted. The check does not make it its own.
    await billed(D, day(-3));
    await platform((c) => changeSchoolAccess(c, { schoolId: D, accessMode: 'read_only', reason: 'records under review, not the bill' }, founder));
    // F: a grace period set by hand, to a day of the founder's choosing.
    await billed(F, day(-3));
    await platform((c) => changeSchoolAccess(c, { schoolId: F, accessMode: 'grace', graceEndsAt: `${day(40)}T23:59:59+05:30`, reason: 'agreed with the school' }, founder));
    const before = [await stored(D), await stored(F)];
    await nightly(TODAY);
    await nightly(day(30)); // long past the plan's own five days
    expect([await stored(D), await stored(F)]).toEqual(before);
    expect(before[0]).toMatchObject({ access_mode: 'read_only', grace_ends_at: null, billing_access: null });
    expect(before[1]).toMatchObject({ access_mode: 'grace', billing_access: null });
    // The school is still told, without a paid-until day that is not the reason.
    expect(await as({ school: F, role: 'principal', user: PRINCIPAL_A }, async (c) => schoolAccessNotice(c, await loadEntitlements(c, F)))).toEqual({ kind: 'grace', paidUntil: null, worksUntil: day(40) });
    expect(accessNoticeText('en', (await as({ school: D, role: 'principal', user: PRINCIPAL_A }, async (c) => schoolAccessNotice(c, await loadEntitlements(c, D))))!)).toBe(en['modules.readOnly']);

    // E is read-only by the check. The founder gives full access back by hand: the check leaves that alone, night after night.
    await platform((c) => changeSchoolAccess(c, { schoolId: E, accessMode: 'full', reason: 'the cheque is on its way' }, founder));
    const given = await stored(E);
    expect(given).toMatchObject({ access_mode: 'full', billing_access: 'read_only' });
    await nightly(day(1));
    await nightly(day(15));
    expect(await stored(E)).toEqual(given);
  });

  it('a job with a date that is not a date is refused for good; one for a day still to come waits; the handler is registered', async () => {
    await expect(billingNightlyHandler({ platform })(job({ date: 'next week' }))).rejects.toThrow(/bad date/);
    await expect(billingNightlyHandler({ platform, now: noonOn(TODAY) })(job({ date: day(1) }))).rejects.toThrow(/has not begun in India/);
    const handlers = readFileSync(path.join(ROOT, 'src/lib/jobs/handlers.ts'), 'utf8');
    expect(handlers).toMatch(/\[BILLING_NIGHTLY_JOB\]: billingNightlyHandler\(\{ platform \}\)/);
    expect(BILLING_NIGHTLY_JOB).toBe('billing.nightly');
  });

  it('the clock queues one job a night, as the fees nightly is queued, and only the database’s own scheduler may call it', async () => {
    // With no school billed yet there is nothing to check, so nothing is queued: a night before the first payment
    // (or before the code that runs the job is deployed) leaves no job behind. Looked at inside a transaction that
    // is rolled back, so the other tests' rows stay as they are.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.pg.transaction(async (tx: any) => {
      await tx.query(`set local session_replication_role = replica`);
      await tx.query(`update school_subscriptions set paid_until = null, billing_access = null, billing_grace_ends_at = null, billing_access_since = null`);
      await tx.query(`delete from jobs where type = 'billing.nightly'`);
      await tx.query(`select billing_nightly_enqueue()`);
      expect((await tx.query(`select count(*)::int as n from jobs where type = 'billing.nightly'`)).rows[0].n).toBe(0);
      await tx.rollback();
    });
    // Once a school has a paid-until day (as some here do): one job a night, however often the clock calls.
    expect((await rows(`select count(*)::int as n from school_subscriptions where paid_until is not null`))[0].n).toBeGreaterThan(0);
    await db.pg.query(`select billing_nightly_enqueue()`);
    await db.pg.query(`select billing_nightly_enqueue()`);
    expect(await rows(`select type, status, school_id, payload ->> 'date' as date, idempotency_key from jobs where type = 'billing.nightly'`)).toEqual([{ type: 'billing.nightly', status: 'pending', school_id: null, date: TODAY, idempotency_key: `billing.nightly:${TODAY}` }]);
    await expect(as(principalA, (c) => c.query(`select billing_nightly_enqueue()`))).rejects.toThrow(/permission denied/);
    const migration = readFileSync(path.join(ROOT, 'supabase/migrations', readdirSync(path.join(ROOT, 'supabase/migrations')).find((f) => f.endsWith('_p5_billing_plans.sql'))!), 'utf8');
    expect(migration).toMatch(/perform cron\.schedule\('billing-nightly', '40 18 \* \* \*', 'select public\.billing_nightly_enqueue\(\)'\)/);
  });
});

describe('recording a payment', () => {
  it('moves paid-until forward, returns a school the check held back to full access, and is audited with who and when', async () => {
    // A is read-only by the check, paid until yesterday.
    const r = await platform((c) => recordPayment(c, by, A, { amountMinor: 1_20_000_00, paidOn: TODAY, coversUntil: day(300), reference: 'UPI made-up 4471', note: 'paid by the trust' }));
    expect(r).toMatchObject({ ok: true, paidUntil: day(300), accessMode: 'full' });
    expect(await stored(A)).toEqual({ access_mode: 'full', grace_ends_at: null, paid_until: day(300), billing_access: null, since: null });
    expect((await as(principalA, (c) => checkModuleAccess(c, { schoolId: A, role: 'principal' }, 'students', { write: true }))).ok).toBe(true);
    expect(await as(principalA, async (c) => schoolAccessNotice(c, await loadEntitlements(c, A)))).toBeNull();
    const [latest] = await platform((c) => schoolPayments(c, A));
    expect(latest).toMatchObject({ amountMinor: 1_20_000_00, paidOn: TODAY, coversUntil: day(300), reference: 'UPI made-up 4471', note: 'paid by the trust', recordedBy: 'Farid Founder', correctedBy: null, correctsPaymentId: null });
    // Two audit rows: the payment (with no amount in it), and the access change, by the person who recorded it.
    const paid = await rows(`select actor_user_id, target_id, before_state, after_state from audit_log where school_id = $1 and event_action = 'billing.payment_recorded' order by audit_id desc limit 1`, [A]);
    expect(paid).toEqual([{ actor_user_id: FOUNDER, target_id: latest.paymentId, before_state: { paid_until: day(-1) }, after_state: { paid_until: day(300), paid_on: TODAY, covers_until: day(300) } }]);
    expect((await accessAudits(A)).at(-1)).toEqual({ actor_user_id: FOUNDER, was: 'read_only', now: 'full', by: 'billing.payment', reason: `Payment recorded: paid until ${day(300)}.` });
    // The check has nothing to do for a paid school.
    await nightly(day(1));
    expect((await stored(A)).access_mode).toBe('full');
  });

  it('refuses what is not a payment, in plain codes, and writes nothing', async () => {
    const before = (await rows(`select count(*)::int as n from subscription_payments`))[0].n;
    const pay = (over: Record<string, unknown>, school = A) => platform((c) => recordPayment(c, by, school, { amountMinor: 10_000_00, paidOn: TODAY, coversUntil: day(400), reference: 'made-up ref', ...over }));
    expect(await pay({ amountMinor: 0 })).toEqual({ ok: false, reason: 'amount' });
    expect(await pay({ amountMinor: 10.5 })).toEqual({ ok: false, reason: 'amount' });
    expect(await pay({ paidOn: day(1) })).toEqual({ ok: false, reason: 'paid_on' });
    expect(await pay({ paidOn: 'yesterday' })).toEqual({ ok: false, reason: 'paid_on' });
    expect(await pay({ coversUntil: day(300) })).toEqual({ ok: false, reason: 'covers_until' }); // not later than the day already paid until
    expect(await pay({ coversUntil: null })).toEqual({ ok: false, reason: 'covers_until' });
    expect(await pay({ coversUntil: day(5000) })).toEqual({ ok: false, reason: 'covers_until' }); // a slip of the year
    expect(await pay({ reference: '   ' })).toEqual({ ok: false, reason: 'reference' });
    expect(await pay({ note: 'x'.repeat(501) })).toEqual({ ok: false, reason: 'note' });
    expect(await pay({}, s(59))).toEqual({ ok: false, reason: 'not_found' });
    expect(await pay({}, 'not-a-school')).toEqual({ ok: false, reason: 'not_found' });
    expect((await rows(`select count(*)::int as n from subscription_payments`))[0].n).toBe(before);
    // A school on no plan has nothing to pay for yet.
    const bare = s(58);
    await db.pg.query(`insert into schools (school_id, name, jurisdiction) values ($1, 'On no plan', 'IN-HR')`, [bare]);
    expect(await pay({}, bare)).toEqual({ ok: false, reason: 'no_plan' });
    await db.pg.query(`delete from schools where school_id = $1`, [bare]);
  });

  it('a payment is never edited or deleted: not by the platform role, and not by the database’s owner', async () => {
    const [{ payment_id: id }] = await rows(`select payment_id from subscription_payments where school_id = $1 order by recorded_at desc limit 1`, [A]);
    await expect(platform((c) => c.query(`update subscription_payments set amount_minor = 1 where payment_id = $1`, [id]))).rejects.toThrow(/permission denied/);
    await expect(platform((c) => c.query(`delete from subscription_payments where payment_id = $1`, [id]))).rejects.toThrow(/permission denied/);
    // The owner has every right on the table; the trigger still refuses.
    await expect(db.pg.query(`update subscription_payments set amount_minor = 1 where payment_id = $1`, [id])).rejects.toThrow(/never changed or removed/);
    await expect(db.pg.query(`delete from subscription_payments where payment_id = $1`, [id])).rejects.toThrow(/never changed or removed/);
    // Nor is one recorded for a day still to come, whatever asks.
    await expect(platform((c) => c.query(`insert into subscription_payments (school_id, plan_id, amount_minor, paid_on, covers_until, reference, recorded_by) values ($1, 'five-days', 100, $2::date, $3::date, 'made-up', $4)`, [A, day(2), day(900), FOUNDER]))).rejects.toThrow(/day still to come/);
    await expect(platform((c) => c.query(`insert into subscription_payments (school_id, plan_id, amount_minor, paid_on, covers_until, reference, recorded_by) values ($1, 'five-days', 0, $2::date, $3::date, 'made-up', $4)`, [A, TODAY, day(900), FOUNDER]))).rejects.toThrow(/check constraint/);
  });

  it('a wrong one is corrected by another row that says so: the wrong row stays, stops counting, and paid-until follows the rows that count', async () => {
    // Recorded with the year typed wrongly: covers until day 700.
    const wrong = await platform((c) => recordPayment(c, by, A, { amountMinor: 1_00_000_00, paidOn: TODAY, coversUntil: day(700), reference: 'cheque made-up 118' }));
    expect(wrong).toMatchObject({ ok: true, paidUntil: day(700) });
    const wrongId = (wrong as { paymentId: string }).paymentId;
    const correct = (over: Record<string, unknown>) => platform((c) => recordPayment(c, by, A, { amountMinor: 1_00_000_00, paidOn: TODAY, coversUntil: day(335), reference: 'cheque made-up 118', note: 'the year was typed wrongly', correctsPaymentId: wrongId, ...over }));
    expect(await correct({ note: '  ' })).toEqual({ ok: false, reason: 'note' });
    expect(await correct({ correctsPaymentId: s(57) })).toEqual({ ok: false, reason: 'corrects' });
    expect(await correct({ amountMinor: 0 })).toEqual({ ok: false, reason: 'covers_until' }); // nothing paid covers nothing
    const fixed = await correct({});
    expect(fixed).toMatchObject({ ok: true, paidUntil: day(335), accessMode: 'full' });
    expect((await stored(A)).paid_until).toBe(day(335));
    const list = await platform((c) => schoolPayments(c, A));
    const fixedId = (fixed as { paymentId: string }).paymentId;
    expect(list.find((p) => p.paymentId === wrongId)).toMatchObject({ coversUntil: day(700), correctedBy: fixedId });
    expect(list.find((p) => p.paymentId === fixedId)).toMatchObject({ coversUntil: day(335), correctsPaymentId: wrongId, note: 'the year was typed wrongly', correctedBy: null });
    // A row is corrected once (the code, and a unique index); the correction itself can be corrected.
    expect(await correct({})).toEqual({ ok: false, reason: 'corrects' });
    await expect(platform((c) => c.query(`insert into subscription_payments (school_id, plan_id, amount_minor, paid_on, covers_until, reference, note, corrects_payment_id, recorded_by) values ($1, 'five-days', 100, $2::date, $3::date, 'made-up', 'a second correction', $4, $5)`, [A, TODAY, day(20), wrongId, FOUNDER]))).rejects.toThrow(/unique/);
    // A correction cannot name another school's row, and must say what was wrong.
    await expect(platform((c) => c.query(`insert into subscription_payments (school_id, plan_id, amount_minor, paid_on, covers_until, reference, note, corrects_payment_id, recorded_by) values ($1, 'five-days', 100, $2::date, $3::date, 'made-up', 'across schools', $4, $5)`, [B, TODAY, day(20), fixedId, FOUNDER]))).rejects.toThrow(/foreign key/);
    await expect(platform((c) => c.query(`insert into subscription_payments (school_id, plan_id, amount_minor, paid_on, covers_until, reference, corrects_payment_id, recorded_by) values ($1, 'five-days', 100, $2::date, $3::date, 'made-up', $4, $5)`, [A, TODAY, day(20), fixedId, FOUNDER]))).rejects.toThrow(/check constraint/);
    expect((await rows(`select event_action, after_state ->> 'corrects' as corrects from audit_log where school_id = $1 and event_action = 'billing.payment_corrected'`, [A]))).toEqual([{ event_action: 'billing.payment_corrected', corrects: wrongId }]);

    // "Nothing was paid": the correction is taken back, and paid-until falls to the last row that still counts.
    const none = await platform((c) => recordPayment(c, by, A, { amountMinor: 0, paidOn: TODAY, coversUntil: null, reference: 'cheque made-up 118', note: 'the cheque was returned by the bank', correctsPaymentId: fixedId }));
    expect(none).toMatchObject({ ok: true, paidUntil: day(300) });
    expect((await stored(A)).paid_until).toBe(day(300));
    expect(await rows(`select count(*)::int as n from subscription_payments where school_id = $1`, [A])).toEqual([{ n: 5 }]); // nothing was removed
  });

  it('a payment that still leaves the school behind shows the true state at once; a person’s own access mode is not lifted by a payment', async () => {
    // E: full by the founder's hand, paid until 30 days ago. A part payment covering only until 2 days ago: in grace again, by the new day.
    const part = await platform((c) => recordPayment(c, by, E, { amountMinor: 5_000_00, paidOn: TODAY, coversUntil: day(-2), reference: 'bank made-up 9' }));
    expect(part).toMatchObject({ ok: true, paidUntil: day(-2), accessMode: 'grace' });
    const e = await stored(E);
    expect(e).toMatchObject({ access_mode: 'grace', paid_until: day(-2), billing_access: 'grace', since: TODAY });
    expect(new Date(e.grace_ends_at).toISOString()).toBe(midnightStarting(day(4)));
    // D: read-only by hand for another reason. Its payment moves the day and leaves the access alone.
    const d = await platform((c) => recordPayment(c, by, D, { amountMinor: 5_000_00, paidOn: TODAY, coversUntil: day(200), reference: 'bank made-up 10' }));
    expect(d).toMatchObject({ ok: true, paidUntil: day(200), accessMode: 'read_only' });
    expect(await stored(D)).toMatchObject({ access_mode: 'read_only', grace_ends_at: null, paid_until: day(200), billing_access: null });
    // B: suspended. The same.
    expect(await platform((c) => recordPayment(c, by, B, { amountMinor: 5_000_00, paidOn: TODAY, coversUntil: day(200), reference: 'bank made-up 11' }))).toMatchObject({ ok: true, accessMode: 'suspended' });
    expect((await stored(B)).access_mode).toBe('suspended');
  });

  it('Control lists every school by plan and state: plan, paid until, access, when grace ends, and whose doing it is', async () => {
    const o = await platform((c) => billingOverview(c));
    const of = (school: string) => o.schools.find((x) => x.schoolId === school)!;
    expect(o.schools).toHaveLength(8);
    expect(of(A)).toMatchObject({ schoolName: 'School A', planId: 'five-days', planName: 'Five Days Made-up', paidUntil: day(300), accessMode: 'full', state: 'paid', graceEndsAt: null, byBilling: false, isTest: false });
    expect(of(B)).toMatchObject({ state: 'suspended', accessMode: 'suspended', byBilling: false });
    expect(of(C)).toMatchObject({ planId: SEEDED, paidUntil: null, state: 'not_billed', accessMode: 'full' });
    expect(of(D)).toMatchObject({ state: 'read_only', byBilling: false });
    expect(of(E)).toMatchObject({ state: 'grace', accessMode: 'grace', graceEndsAt: midnightStarting(day(4)), byBilling: true });
    expect(of(F)).toMatchObject({ state: 'grace', byBilling: false });
    expect(of(G)).toMatchObject({ planId: 'no-grace', state: 'read_only', byBilling: true });
    expect(of(T)).toMatchObject({ isTest: true, paidUntil: day(-40), state: 'due', accessMode: 'full' }); // a test school is listed, and never moved
    expect(o.plans.find((p) => p.planId === 'five-days')!.schools).toBe(6);
  });
});

describe('the check’s own work, and a person’s, are told apart by what is stored', () => {
  it('a grace period the founder sets over the check’s own is the founder’s from then on: the check does not end it; a payment that brings the school up to date does', async () => {
    // E is in grace by the check, ending when day 3 ends. The founder gives it until day 60 instead.
    expect(await stored(E)).toMatchObject({ access_mode: 'grace', billing_access: 'grace' });
    await platform((c) => changeSchoolAccess(c, { schoolId: E, accessMode: 'grace', graceEndsAt: `${day(60)}T23:59:59+05:30`, reason: 'agreed a later day with the school' }, founder));
    const mine = await stored(E);
    expect((await platform((c) => billingOverview(c))).schools.find((x) => x.schoolId === E)).toMatchObject({ state: 'grace', byBilling: false });
    await nightly(day(10)); // the check's own grace would be over
    await nightly(day(61)); // and so is the founder's: reading it now says read-only, but the check does not make that its own
    expect(await stored(E)).toEqual(mine);
    expect(await platform((c) => runBillingCheckForSchool(c, E, day(61)))).toBeNull();
    // The school was behind and is now paid up: the day the founder gave it to pay by has done its work, so the grace
    // period goes with the payment and cannot turn a paid school read-only later (test/control/billing-payment-access.test.ts).
    expect(await platform((c) => recordPayment(c, by, E, { amountMinor: 20_000_00, paidOn: TODAY, coversUntil: day(250), reference: 'bank made-up 12' }))).toMatchObject({ ok: true, paidUntil: day(250), accessMode: 'full', handGraceEnded: true });
    expect(await stored(E)).toMatchObject({ access_mode: 'full', grace_ends_at: null, paid_until: day(250), billing_access: null });
    expect((await accessAudits(E)).at(-1)).toEqual({ actor_user_id: FOUNDER, was: 'grace', now: 'full', by: 'billing.payment', reason: `Payment recorded: paid until ${day(250)}. The grace period set by hand, to the end of ${day(60)}, is over.` });
    // A correction is for the plan of the row it corrects, even after the school has moved to another plan.
    const [{ payment_id: last }] = await rows(`select payment_id from subscription_payments where school_id = $1 and reference = 'bank made-up 12'`, [E]);
    expect((await platform((c) => applyPlan(c, E, SEEDED, founder, 'moved after paying'))).ok).toBe(true);
    expect(await platform((c) => recordPayment(c, by, E, { amountMinor: 20_000_00, paidOn: TODAY, coversUntil: day(249), reference: 'bank made-up 12', note: 'a day too far', correctsPaymentId: last }))).toMatchObject({ ok: true, paidUntil: day(249) });
    expect(await rows(`select plan_id from subscription_payments where corrects_payment_id = $1`, [last])).toEqual([{ plan_id: 'five-days' }]);
  });

  it('read-only the founder sets over the check’s own is the founder’s too: a payment moves the day and leaves the school read-only', async () => {
    // G is read-only by the check. The founder sets read-only by hand, for a reason that is not the bill.
    expect(await stored(G)).toMatchObject({ access_mode: 'read_only', billing_access: 'read_only' });
    await platform((c) => changeSchoolAccess(c, { schoolId: G, accessMode: 'read_only', reason: 'a data request is being answered' }, founder));
    expect((await platform((c) => billingOverview(c))).schools.find((x) => x.schoolId === G)).toMatchObject({ state: 'read_only', byBilling: false });
    expect(await platform((c) => recordPayment(c, by, G, { amountMinor: 20_000_00, paidOn: TODAY, coversUntil: day(250), reference: 'bank made-up 13' }))).toMatchObject({ ok: true, paidUntil: day(250), accessMode: 'read_only' });
    expect(await stored(G)).toMatchObject({ access_mode: 'read_only', grace_ends_at: null, paid_until: day(250), billing_access: null });
    expect((await accessAudits(G)).map((a: { by: string | null }) => a.by)).toEqual(['billing.nightly', null]); // the check's step, then the founder's; the payment changed no access
  });
});

describe('who can read and write: the three tables are the platform’s', () => {
  it('a school’s session reads its own subscription row and nothing of another school', async () => {
    expect((await read(principalA, `select school_id, plan_id, paid_until::text as paid_until from school_subscriptions`))).toEqual([{ school_id: A, plan_id: 'five-days', paid_until: day(300) }]);
    expect((await read(teacherA, `select school_id from school_subscriptions`))).toEqual([{ school_id: A }]);
    expect((await read(principalB, `select school_id from school_subscriptions`))).toEqual([{ school_id: B }]);
    expect((await read(principalA, `select 1 from school_subscriptions where school_id = $1`, [B]))).toEqual([]);
    // Staff only: a parent's or a student's role reads nothing, even for its own school.
    for (const role of ['parent', 'student', '']) expect((await read({ school: A, role, user: PRINCIPAL_A }, `select 1 from school_subscriptions`)), role).toEqual([]);
  });

  it('a school’s session cannot read any payment, or any plan or price', async () => {
    expect((await rows(`select count(*)::int as n from subscription_payments where school_id = $1`, [A]))[0].n).toBeGreaterThan(0);
    for (const who of [principalA, teacherA, principalB]) {
      await expect(as(who, (c) => c.query(`select 1 from subscription_payments`))).rejects.toThrow(/permission denied/);
      await expect(as(who, (c) => c.query(`select 1 from subscription_payments where school_id = $1`, [who.school]))).rejects.toThrow(/permission denied/);
      await expect(as(who, (c) => c.query(`select name, price_minor from plans`))).rejects.toThrow(/permission denied/);
    }
    // What a school can read about a payment is its own audit row, and that row holds no amount, reference or note.
    const audit = (await read(principalA, `select after_state, before_state from audit_log where event_action like 'billing.payment%'`));
    expect(audit.length).toBeGreaterThan(0);
    for (const row of audit) expect(Object.keys({ ...row.after_state, ...row.before_state }).sort().filter((k) => !['corrects', 'covers_until', 'paid_on', 'paid_until'].includes(k))).toEqual([]);
    expect((await read(principalB, `select 1 from audit_log where event_action like 'billing.payment%' and school_id = $1`, [A]))).toEqual([]);
  });

  it('a school’s session cannot write any of the three, nor its own entitlements', async () => {
    for (const who of [principalA, teacherA]) {
      await expect(as(who, (c) => c.query(`update school_subscriptions set paid_until = $2::date where school_id = $1`, [A, day(999)]))).rejects.toThrow(/permission denied/);
      await expect(as(who, (c) => c.query(`insert into school_subscriptions (school_id, plan_id) values ($1, 'five-days')`, [A]))).rejects.toThrow(/permission denied/);
      await expect(as(who, (c) => c.query(`delete from school_subscriptions where school_id = $1`, [A]))).rejects.toThrow(/permission denied/);
      await expect(as(who, (c) => c.query(`insert into subscription_payments (school_id, plan_id, amount_minor, paid_on, covers_until, reference, recorded_by) values ($1, 'five-days', 100, $2::date, $3::date, 'made-up', $4)`, [A, TODAY, day(999), who.user]))).rejects.toThrow(/permission denied/);
      await expect(as(who, (c) => c.query(`insert into plans (plan_id, name, grace_days) values ('mine', 'Mine', 0)`))).rejects.toThrow(/permission denied/);
      await expect(as(who, (c) => c.query(`update plans set price_minor = 1, period = 'year'`))).rejects.toThrow(/permission denied/);
      await expect(as(who, (c) => c.query(`update school_entitlements set access_mode = 'full' where school_id = $1`, [A]))).rejects.toThrow(/permission denied/);
      await expect(as(who, (c) => c.query(`update platform_settings set value = '"mine"'::jsonb`))).rejects.toThrow(/permission denied/);
    }
    expect((await stored(A)).paid_until).toBe(day(300));
  });

  it('the Control routes are for NetCyberAI staff alone, and take the school from the address, never from what is sent', () => {
    const routes = ['src/app/api/control/billing/route.ts', 'src/app/api/control/billing/plans/[planId]/route.ts', 'src/app/api/control/schools/[schoolId]/subscription/route.ts'].map((f) => readFileSync(path.join(ROOT, f), 'utf8'));
    for (const text of routes) {
      const handlers = text.split(/export async function (?:GET|POST)/).slice(1);
      expect(handlers.length).toBeGreaterThan(0);
      for (const h of handlers) expect(h).toMatch(/^[^\n]*\n\s*const guard = await requireSuperAdmin\(req\);\n\s*if \('error' in guard\) return guard\.error;/);
      expect(text).not.toMatch(/\bb\.schoolId\b|body\.schoolId/);
    }
    expect(routes[2]).toMatch(/recordPayment\(db, \{ userId: guard\.claims\.sub \}, params\.schoolId,/);
  });
});
