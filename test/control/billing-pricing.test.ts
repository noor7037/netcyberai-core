import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { createTestDb } from '../db/pglite-harness';
import { billingOverview, updatePlan } from '@/lib/control/billing';
import { amountDue, bpToPercent, computeAmountDue, percentToBp, proposeYearMinor } from '@/lib/control/billing-amount';
import { termInputFromBody } from '@/lib/control/billing-input';
import { BILLING_NIGHTLY_JOB, billingNightlyHandler } from '@/lib/control/billing-nightly';
import { addTerm, endTerm, listTerms, setBillingPeriod, syncComplimentaryModules } from '@/lib/control/billing-terms';
import { isModuleId, type ModuleId } from '@/lib/contracts/modules';
import { changeModuleEntitlement, checkModuleAccess, entitlementHistory, loadEntitlements } from '@/lib/frameworks/entitlements';
import { applyPlan, listPlans, loadPlan, planHasFeature, workingModules } from '@/lib/frameworks/plans';
import { indiaDate } from '@/lib/time/india';
import { TODAY_PROVIDERS } from '@/lib/today/cards';

// C212 (founder, 2026-10-14): plans priced per enrolled student (C219: the website's word), a school's own terms, the amount due. The acceptance
// test:
//   "The three plans exist with their per-student monthly and yearly prices and modules, editable in Control; a
//    school's subscription records its period; a negotiated price, complimentary modules with an end date, a discount
//    and a minimum each carry a reason, dates and an audit row; the amount due equals max(enrolled students, minimum)
//    x the price for the period - the discount, to the rupee, monthly and yearly; complimentary modules are on until
//    their end date; no price is written in src."
// On every migration, as the app's own database roles. Every school, person and term here is made up; the three
// plans and their prices are the migration's seed, read from the database. C219 renamed the seed's Essential and
// Premium to the founder's Starter and Compass (C198-A), put Teacher Copilot in Compass and made the first plan,
// 'standard', a plan for test schools only.

const ROOT = path.resolve(__dirname, '../..');
const s = (n: number) => `c2120000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
// P: Compass. G: Growth, the school whose amount is worked out. E: Starter. S: the first plan, no price (a test school). N: on no plan.
// C and D: complimentary modules (D's terms are added only after C's nightly runs, so the two do not meet).
const [P, G, E, S, N, C, D] = [s(1), s(2), s(3), s(4), s(5), s(6), s(7)];
const FOUNDER = s(90);
const [PRINCIPAL_G, ADMIN_G, ACCOUNTANT_G, TEACHER_G, PRINCIPAL_P] = [s(91), s(92), s(93), s(94), s(95)];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { school: string; role: string; user: string };
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
const TODAY = indiaDate();
const day = (n: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const job = (date: string) => ({ jobId: 'j', type: BILLING_NIGHTLY_JOB, payload: { date }, attempts: 1, maxAttempts: 8, schoolId: null, idempotencyKey: 'k' });
const nightly = (onDay: string) => billingNightlyHandler({ platform, now: () => new Date(`${onDay}T12:00:00+05:30`) })(job(onDay));
const principalG: Who = { school: G, role: 'principal', user: PRINCIPAL_G };
const schoolRoles: Who[] = [principalG, { school: G, role: 'school_admin', user: ADMIN_G }, { school: G, role: 'accountant', user: ACCOUNTANT_G }, { school: G, role: 'teacher', user: TEACHER_G }, { school: G, role: 'super_admin', user: PRINCIPAL_G }];
const moduleRow = async (school: string, moduleId: string) => (await rows(`select enabled, source from school_module_entitlements where school_id = $1 and module_id = $2`, [school, moduleId]))[0] ?? null;
const isOnFor = async (school: string, moduleId: string) => (await as({ school, role: 'principal', user: PRINCIPAL_G }, (c) => loadEntitlements(c, school))).modules[moduleId as ModuleId]?.enabled === true;
const term = (school: string, input: Record<string, unknown>) => platform((c) => addTerm(c, by, school, { startsOn: TODAY, reason: 'agreed with the made-up school', ...input } as never));
const due = (school: string, onDay = TODAY) => platform((c) => amountDue(c, school, onDay));

// The founder's mapping (the migration's header table, and the PR).
const ALWAYS = ['setup', 'compliance', 'help-center', 'raise-ticket'];
const STARTER = ['students', 'attendance', 'fees', 'communication', 'pulse', 'dashboard', 'academics', 'homework', 'timetable', 'recovery', 'staff', ...ALWAYS];
const GROWTH_ADDS = ['exams', 'ptm', 'events', 'complaints', 'parents', 'proxy', 'reports', 'documents'];
const COMPASS_ADDS = ['parent-ai', 'early-warning', 'school-auditor', 'learning-genome', 'curriculum-gap', 'teacher-copilot'];
const IN_NO_PLAN = ['admissions', 'payroll', 'career', 'twin', 'automation'];

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values
      ('${P}', 'Compass School', 'IN-HR', false), ('${G}', 'Growth School', 'IN-DL', false), ('${E}', 'Starter School', 'IN-UP', false),
      ('${S}', 'First Plan School', 'IN-MH', true), ('${N}', 'No Plan School', 'IN-RJ', false), ('${C}', 'Complimentary School', 'IN-KA', false),
      ('${D}', 'Second Complimentary School', 'IN-TN', false);
    insert into users (user_id, school_id, email, role, display_name) values
      ('${FOUNDER}', null, 'founder@netcyber.example', 'super_admin', 'Farid Founder'),
      ('${PRINCIPAL_G}', '${G}', 'principal@growth.example', 'principal', 'Priya Principal'),
      ('${ADMIN_G}', '${G}', 'admin@growth.example', 'school_admin', 'Asha Admin'),
      ('${ACCOUNTANT_G}', '${G}', 'accounts@growth.example', 'accountant', 'Arun Accountant'),
      ('${TEACHER_G}', '${G}', 'teacher@growth.example', 'teacher', 'Tara Teacher'),
      ('${PRINCIPAL_P}', '${P}', 'principal@compass.example', 'principal', 'Pooja Principal');
    -- G: 37 enrolled students (status active), and 6 who do not count (waiting for consent, inactive, moved to another school).
    insert into students (school_id, admission_no, name, status)
      select '${G}', 'G-' || g, 'Made-up Student ' || g, (case when g <= 37 then 'active' when g <= 40 then 'pending_consent' when g <= 42 then 'inactive' else 'transferred' end)::student_status
        from generate_series(1, 43) g;
  `);
  for (const [school, plan] of [[P, 'compass'], [G, 'growth'], [E, 'starter'], [S, 'standard'], [C, 'growth'], [D, 'growth']]) {
    const r = await platform((c) => applyPlan(c, school, plan, founder, 'put on its plan for the test'));
    if (!r.ok) throw new Error(r.error);
  }
}, 120_000);
afterAll(async () => db?.stop());

describe('the three plans are data: per-student prices a month and a year, and the founder’s modules', () => {
  it('the migrations seed Starter, Growth and Compass with their prices in paise per enrolled student, a year being ten months', async () => {
    const seeded = await rows(`select plan_id, name, price_month_minor, price_year_minor, grace_days, all_working_modules, whatsapp_messages_per_student_month, retired_at, test_schools_only from plans where plan_id in ('starter', 'growth', 'compass') order by price_month_minor`);
    expect(seeded).toEqual([
      { plan_id: 'starter', name: 'Starter', price_month_minor: 1500, price_year_minor: 15000, grace_days: 15, all_working_modules: false, whatsapp_messages_per_student_month: null, retired_at: null, test_schools_only: false },
      { plan_id: 'growth', name: 'Growth', price_month_minor: 3000, price_year_minor: 30000, grace_days: 15, all_working_modules: false, whatsapp_messages_per_student_month: null, retired_at: null, test_schools_only: false },
      { plan_id: 'compass', name: 'Compass', price_month_minor: 5000, price_year_minor: 50000, grace_days: 15, all_working_modules: false, whatsapp_messages_per_student_month: null, retired_at: null, test_schools_only: false },
    ]);
    // No plan keeps the names C212 gave by mistake.
    expect(await rows(`select plan_id from plans where plan_id in ('essential', 'premium') or lower(name) in ('essential', 'premium')`)).toEqual([]);
    // To the rupee: 15 and 150, 30 and 300, 50 and 500.
    expect(seeded.map((p: { price_month_minor: number; price_year_minor: number }) => [p.price_month_minor / 100, p.price_year_minor / 100])).toEqual([[15, 150], [30, 300], [50, 500]]);
    for (const p of seeded) expect(p.price_year_minor).toBe(proposeYearMinor(p.price_month_minor));
    // Each was audited as made by the C212 migration, with its prices (under the id it was made with), and the two
    // renamed by C219 say so: one 'billing.plan_renamed' row each, from the old id and name to the new.
    expect(await rows(`select target_id, actor_user_id, (after_state ->> 'price_month_minor')::int as month from audit_log where event_action = 'billing.plan_created' and target_id in ('essential', 'growth', 'premium') order by target_id`)).toEqual([
      { target_id: 'essential', actor_user_id: null, month: 1500 },
      { target_id: 'growth', actor_user_id: null, month: 3000 },
      { target_id: 'premium', actor_user_id: null, month: 5000 },
    ]);
    expect(await rows(`select target_id, actor_user_id, before_state, after_state ->> 'plan_id' as plan_id, after_state ->> 'name' as name from audit_log where event_action = 'billing.plan_renamed' order by target_id`)).toEqual([
      { target_id: 'compass', actor_user_id: null, before_state: { plan_id: 'premium', name: 'Premium' }, plan_id: 'compass', name: 'Compass' },
      { target_id: 'starter', actor_user_id: null, before_state: { plan_id: 'essential', name: 'Essential' }, plan_id: 'starter', name: 'Starter' },
    ]);
  });

  it('their modules are the founder’s words mapped to the registry: each plan the one before it and more; Personal Best a feature of Compass; Teacher Copilot in Compass; Documents in Growth', async () => {
    const listed = Object.fromEntries((await rows(`select plan_id, module_ids, features from plans where plan_id in ('starter', 'growth', 'compass')`)).map((r: { plan_id: string; module_ids: string[]; features: string[] }) => [r.plan_id, r]));
    expect(listed.starter.module_ids).toEqual(STARTER);
    expect([...listed.growth.module_ids].sort()).toEqual([...STARTER, ...GROWTH_ADDS].sort());
    expect([...listed.compass.module_ids].sort()).toEqual([...STARTER, ...GROWTH_ADDS, ...COMPASS_ADDS].sort());
    expect([listed.starter.module_ids.includes('teacher-copilot'), listed.growth.module_ids.includes('teacher-copilot'), listed.compass.module_ids.includes('teacher-copilot')]).toEqual([false, false, true]);
    expect([listed.starter.module_ids.includes('documents'), listed.growth.module_ids.includes('documents')]).toEqual([false, true]);
    // Adding Teacher Copilot to Compass is audited.
    expect(await rows(`select actor_user_id, after_state -> 'module_ids' ? 'teacher-copilot' as added, before_state -> 'module_ids' ? 'teacher-copilot' as was from audit_log where event_action = 'billing.plan_changed' and target_id = 'compass'`)).toEqual([{ actor_user_id: null, added: true, was: false }]);
    for (const p of Object.values(listed) as { module_ids: string[] }[]) {
      for (const m of p.module_ids) expect(isModuleId(m), m).toBe(true);
      for (const m of ALWAYS) expect(p.module_ids).toContain(m); // help and the DPDP duties, whatever the plan
      for (const m of IN_NO_PLAN) expect(p.module_ids).not.toContain(m);
    }
    expect([listed.starter.features, listed.growth.features, listed.compass.features]).toEqual([[], ['principal-dashboard', 'staff-leave'], ['principal-dashboard', 'staff-leave', 'personal-best']]);
    // Modules a plan sells that are not built yet wait: applying Compass switches on only what works today. Exams
    // (C213), Curriculum Gap (C216) and Learning Genome (C217) work now; Teacher Copilot waits.
    const compass = (await platform((c) => loadPlan(c, 'compass')))!;
    expect(compass.waitingModuleIds.sort()).toEqual(['teacher-copilot']);
    const on = (await rows(`select module_id from school_module_entitlements where school_id = $1 and enabled order by 1`, [P])).map((r: { module_id: string }) => r.module_id);
    expect(on).toEqual([...STARTER, ...GROWTH_ADDS, ...COMPASS_ADDS].filter((m) => workingModules().includes(m as never)).sort());
    expect(on).not.toContain('teacher-copilot');
  });

  it('a plan’s own feature is read for the school’s own plan only: yes on Compass, no on Growth, nothing about another school', async () => {
    expect(await as({ school: P, role: 'principal', user: PRINCIPAL_P }, (c) => planHasFeature(c, P, 'personal-best'))).toBe(true);
    expect(await as(principalG, (c) => planHasFeature(c, G, 'personal-best'))).toBe(false);
    expect(await as(principalG, (c) => planHasFeature(c, G, 'staff-leave'))).toBe(true);
    // A school's session asking about another school learns nothing, and reads no plan at all.
    expect(await as(principalG, (c) => planHasFeature(c, P, 'personal-best'))).toBe(false);
    await expect(as(principalG, (c) => c.query(`select features from plans`))).rejects.toThrow(/permission denied/);
    // The platform role may ask about any school.
    expect(await platform((c) => planHasFeature(c, P, 'personal-best'))).toBe(true);
    // No other database role may call it.
    for (const role of ['anon', 'authenticated']) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const asRole = db.pg.transaction(async (tx: any) => {
        await tx.query(`set local role ${role}`);
        return tx.query(`select school_plan_has_feature($1::uuid, 'personal-best')`, [P]);
      });
      await expect(asRole, role).rejects.toThrow(/permission denied/);
    }
  });

  it('the features gate the parts of a module: Starter has no staff leave and no principal dashboard; a plan with every module (a test school’s), or no subscription, has them all', async () => {
    const asPrincipal = (school: string) => ({ school, role: 'principal', user: PRINCIPAL_G });
    for (const feature of ['staff-leave', 'principal-dashboard', 'personal-best'] as const) {
      expect(await as(asPrincipal(E), (c) => planHasFeature(c, E, feature)), `starter ${feature}`).toBe(false);
      expect(await as(asPrincipal(S), (c) => planHasFeature(c, S, feature)), `standard ${feature}`).toBe(true);
      expect(await as(asPrincipal(N), (c) => planHasFeature(c, N, feature)), `no subscription ${feature}`).toBe(true);
    }
    expect(await as(principalG, (c) => planHasFeature(c, G, 'principal-dashboard'))).toBe(true);
    // My Day's "leave waiting" card is a part of staff leave: a waiting request counts on Growth, not on Starter.
    const [TEACHER_E, PRINCIPAL_E] = [s(96), s(97)];
    await db.pg.exec(`
      insert into users (user_id, school_id, email, role, display_name) values
        ('${TEACHER_E}', '${E}', 'teacher@starter.example', 'teacher', 'Esha Teacher'), ('${PRINCIPAL_E}', '${E}', 'principal@starter.example', 'principal', 'Eshan Principal');
      insert into staff_leave (school_id, user_id, from_date, to_date, kind, reason, status, recorded_by) values
        ('${E}', '${TEACHER_E}', '${day(5)}', '${day(5)}', 'casual', 'A family function.', 'waiting', '${TEACHER_E}'),
        ('${G}', '${TEACHER_G}', '${day(5)}', '${day(5)}', 'casual', 'A family function.', 'waiting', '${TEACHER_G}');
    `);
    const card = (who: Who) => as(who, (c) => TODAY_PROVIDERS.find((x) => x.type === 'leave-waiting')!.load(c, { schoolId: who.school, userId: who.user, role: who.role as never, sunday: false }));
    expect((await card(principalG)).map((x) => x.count)).toEqual([1]);
    expect(await card({ school: E, role: 'principal', user: PRINCIPAL_E })).toEqual([]);
  });

  it('they are editable in Control: a price and its proposal, features and the messages included, audited; the messages field starts empty', async () => {
    const growth = (await platform((c) => loadPlan(c, 'growth')))!;
    expect(growth.messagesPerStudentMonth).toBeNull();
    const input = { name: growth.name, priceMonthMinor: 3200, priceYearMinor: proposeYearMinor(3200), graceDays: 10, allWorkingModules: false, moduleIds: [...growth.moduleIds, ...growth.waitingModuleIds], limits: {}, features: ['staff-leave'], messagesPerStudentMonth: 20 };
    const r = await platform((c) => updatePlan(c, by, 'growth', input));
    expect(r).toMatchObject({ ok: true, plan: { priceMonthMinor: 3200, priceYearMinor: 32000, graceDays: 10, features: ['staff-leave'], messagesPerStudentMonth: 20 } });
    expect(await rows(`select (before_state ->> 'price_month_minor')::int as was, (after_state ->> 'price_month_minor')::int as now, after_state -> 'whatsapp_messages_per_student_month' as messages, actor_user_id from audit_log where event_action = 'billing.plan_changed' and target_id = 'growth'`)).toEqual([{ was: 3000, now: 3200, messages: 20, actor_user_id: FOUNDER }]);
    // Put back as the founder decided, for the amounts below.
    expect((await platform((c) => updatePlan(c, by, 'growth', { ...input, priceMonthMinor: 3000, priceYearMinor: 30000, graceDays: 15, features: ['principal-dashboard', 'staff-leave'], messagesPerStudentMonth: null }))).ok).toBe(true);
  });

  it('a plan that had a price for the whole school keeps it in the audit log; its prices per student start empty; the first plan keeps none', async () => {
    const small = await createTestDb({
      before: { migration: '_c212_pricing', sql: `insert into plans (plan_id, name, grace_days, price_minor, period) values ('old-priced', 'Old Priced', 5, 1200000, 'year');` },
    });
    expect((await small.query(`select plan_id, price_month_minor, price_year_minor from plans where plan_id in ('old-priced', 'standard') order by plan_id`)).rows).toEqual([
      { plan_id: 'old-priced', price_month_minor: null, price_year_minor: null },
      { plan_id: 'standard', price_month_minor: null, price_year_minor: null },
    ]);
    expect((await small.query(`select before_state from audit_log where event_action = 'billing.plan_changed' and target_id = 'old-priced'`)).rows).toEqual([{ before_state: { price_minor: 1200000, period: 'year' } }]);
    // The old columns were retired by C212, not dropped, while the code before C212 still read them (this small
    // database stops at C212); the C219 cleanup drops them once that code was gone.
    expect((await small.query(`select col_description('plans'::regclass, attnum) as said from pg_attribute where attrelid = 'plans'::regclass and attname = 'price_minor'`)).rows[0].said).toMatch(/^Retired by C212/);
    await small.pg.close();
    expect(await rows(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'plans' and column_name in ('price_minor', 'period')`)).toEqual([]);
  });
});

describe('a school’s subscription records its period', () => {
  it('a month or a year, with a reason, audited where only Control reads it; nothing else is a period', async () => {
    expect(await platform((c) => setBillingPeriod(c, by, G, { period: 'quarter', reason: 'a made-up reason' }))).toEqual({ ok: false, reason: 'billing_period' });
    expect(await platform((c) => setBillingPeriod(c, by, G, { period: 'month', reason: ' ' }))).toEqual({ ok: false, reason: 'reason' });
    expect(await platform((c) => setBillingPeriod(c, by, N, { period: 'month', reason: 'no plan yet' }))).toEqual({ ok: false, reason: 'no_plan' });
    expect(await platform((c) => setBillingPeriod(c, by, G, { period: 'month', reason: 'the school pays each month' }))).toEqual({ ok: true, period: 'month' });
    expect(await rows(`select billing_period from school_subscriptions where school_id = $1`, [G])).toEqual([{ billing_period: 'month' }]);
    expect(await rows(`select before_state, after_state, actor_user_id from audit_log where school_id = $1 and event_action = 'billing.terms.period_changed'`, [G])).toEqual([{ before_state: { billing_period: null }, after_state: { billing_period: 'month', reason: 'the school pays each month' }, actor_user_id: FOUNDER }]);
    await expect(db.pg.query(`update school_subscriptions set billing_period = 'quarter' where school_id = $1`, [G])).rejects.toThrow(/check constraint/);
    // The school's own session reads its own row (8e), and so its period; it cannot change it.
    expect(await as(principalG, async (c) => (await c.query(`select billing_period from school_subscriptions`)).rows)).toEqual([{ billing_period: 'month' }]);
    await expect(as(principalG, (c) => c.query(`update school_subscriptions set billing_period = 'year' where school_id = $1`, [G]))).rejects.toThrow(/permission denied/);
  });
});

describe('the amount due: max(enrolled students, minimum) × the price for the period − the discount', () => {
  it('the rule on its own, to the paisa, the discount rounded half up', () => {
    expect(computeAmountDue({ enrolledStudents: 37, minimumStudents: null, pricePerStudentMinor: 3000, discountBp: null })).toEqual({ billedStudents: 37, grossMinor: 111000, discountMinor: 0, amountMinor: 111000 });
    expect(computeAmountDue({ enrolledStudents: 37, minimumStudents: 50, pricePerStudentMinor: 3000, discountBp: null })).toEqual({ billedStudents: 50, grossMinor: 150000, discountMinor: 0, amountMinor: 150000 });
    expect(computeAmountDue({ enrolledStudents: 37, minimumStudents: 30, pricePerStudentMinor: 30000, discountBp: 1250 })).toEqual({ billedStudents: 37, grossMinor: 1110000, discountMinor: 138750, amountMinor: 971250 });
    // 101 paise less 50%: 50.5 paise of discount is 51.
    expect(computeAmountDue({ enrolledStudents: 1, minimumStudents: null, pricePerStudentMinor: 101, discountBp: 5000 })).toEqual({ billedStudents: 1, grossMinor: 101, discountMinor: 51, amountMinor: 50 });
    // A whole discount leaves nothing; none leaves everything.
    expect(computeAmountDue({ enrolledStudents: 9, minimumStudents: null, pricePerStudentMinor: 777, discountBp: 10000 }).amountMinor).toBe(0);
    expect(computeAmountDue({ enrolledStudents: 0, minimumStudents: null, pricePerStudentMinor: 777, discountBp: null }).amountMinor).toBe(0);
    expect(() => computeAmountDue({ enrolledStudents: 1.5, minimumStudents: null, pricePerStudentMinor: 1, discountBp: null })).toThrow();
    expect([percentToBp('12.5'), percentToBp('12.50'), percentToBp(100), percentToBp('0'), percentToBp('100.01'), percentToBp('12.345'), percentToBp('-1'), percentToBp('ten')]).toEqual([1250, 1250, 10000, 0, null, null, null, null]);
    expect([bpToPercent(1250), bpToPercent(5), bpToPercent(10000)]).toEqual(['12.50', '0.05', '100.00']);
  });

  it('on the school’s rows, to the rupee, monthly and yearly: the plan’s price, a minimum, a negotiated price, a discount; complimentary modules change nothing', async () => {
    const rupees = async () => {
      const a = (await due(G))!;
      return a.amountMinor === null ? null : a.amountMinor / 100;
    };
    const both = async () => {
      await platform((c) => setBillingPeriod(c, by, G, { period: 'month', reason: 'compare the two' }));
      const month = await rupees();
      await platform((c) => setBillingPeriod(c, by, G, { period: 'year', reason: 'compare the two' }));
      const year = await rupees();
      return [month, year];
    };
    // 37 enrolled students counted (the 6 waiting, inactive or moved are not), Growth's ₹30 a month and ₹300 a year.
    const a = (await due(G))!;
    expect(a).toMatchObject({ enrolledStudents: 37, minimumStudents: null, billedStudents: 37, priceSource: 'plan', discountBp: null, missing: null });
    expect(await both()).toEqual([1110, 11100]);

    // A minimum above the students counted: billed for the minimum.
    expect(await term(G, { kind: 'minimum', minimumStudents: 50 })).toMatchObject({ ok: true });
    expect(await both()).toEqual([1500, 15000]);
    // A negotiated price: ₹25 a month, ₹240 a year (not ten months: typed by hand).
    expect(await term(G, { kind: 'price', priceMonthMinor: 2500, priceYearMinor: 24000 })).toMatchObject({ ok: true });
    expect(await both()).toEqual([1250, 12000]);
    // A discount of 12.5%: 156.25 off a month's 1,250, and 1,500 off a year's 12,000.
    expect(await term(G, { kind: 'discount', discountBp: 1250 })).toMatchObject({ ok: true });
    expect(await both()).toEqual([1093.75, 10500]);
    // A complimentary module is listed and never charged.
    expect(await term(G, { kind: 'complimentary', moduleId: 'parent-ai', endsOn: day(30) })).toMatchObject({ ok: true });
    expect(await both()).toEqual([1093.75, 10500]);
    const year = (await due(G))!;
    expect(year).toMatchObject({ period: 'year', enrolledStudents: 37, minimumStudents: 50, billedStudents: 50, priceSource: 'negotiated', pricePerStudentMinor: 24000, grossMinor: 1200000, discountBp: 1250, discountMinor: 150000, amountMinor: 1050000, complimentary: [{ moduleId: 'parent-ai', endsOn: day(30) }] });
    // A minimum below the students counted: billed for the students. A discount that rounds: 33.33% of 1,110,000 paise.
    expect(await term(G, { kind: 'minimum', minimumStudents: 30, startsOn: TODAY })).toMatchObject({ ok: true, replaced: [expect.any(String)] });
    expect(await term(G, { kind: 'discount', discountBp: 3333, startsOn: TODAY })).toMatchObject({ ok: true });
    expect((await due(G))!).toMatchObject({ billedStudents: 37, grossMinor: 888000, discountMinor: 295970, amountMinor: 592030 });
    expect(Math.round(888000 * 0.3333)).toBe(295970); // checked by hand: 295,970.4 rounds to 295,970
  });

  it('what is missing is said, never a zero: no plan, no period chosen, no price for the period', async () => {
    expect(await due(N)).toMatchObject({ planId: null, amountMinor: null, missing: 'no_plan' });
    expect(await due(E)).toMatchObject({ planId: 'starter', period: null, amountMinor: null, missing: 'no_period' });
    await platform((c) => setBillingPeriod(c, by, S, { period: 'year', reason: 'the first plan has no price' }));
    expect(await due(S)).toMatchObject({ period: 'year', amountMinor: null, missing: 'no_price', priceSource: null });
    // A negotiated price makes an amount even on a plan with none.
    expect(await term(S, { kind: 'price', priceMonthMinor: 1000, priceYearMinor: 10000 })).toMatchObject({ ok: true });
    expect(await due(S)).toMatchObject({ amountMinor: 0, missing: null, priceSource: 'negotiated' }); // no enrolled student yet
    expect(await due(s(77))).toBeNull();
  });

  it('every screen reads the one rule: the overview’s amount for each school is amountDue’s', async () => {
    const o = await platform((c) => billingOverview(c));
    for (const school of o.schools) expect(school.amount, school.schoolName).toEqual(await due(school.schoolId, o.today));
    expect(o.schools.find((x) => x.schoolId === G)).toMatchObject({ period: 'year', amount: { amountMinor: 592030 } });
    // The screens show the server's numbers: no amount is multiplied on the page.
    for (const f of ['src/components/control/BillingTerms.tsx', 'src/components/control/BillingSchools.tsx']) {
      const text = readFileSync(path.join(ROOT, f), 'utf8');
      expect(text, f).not.toMatch(/(enrolledStudents|billedStudents|minimumStudents)\s*\*/);
      expect(text, f).toMatch(/amount/);
    }
  });
});

describe('each term carries a reason, dates and an audit row, is never edited, and is read in Control only', () => {
  it('stored with its reason and dates; a new term of the same kind ends the old one the day before it begins; each audited', async () => {
    const list = await platform((c) => listTerms(c, G));
    const minimums = list.filter((t) => t.kind === 'minimum');
    expect(minimums.map((t) => [t.minimumStudents, t.startsOn, t.endsOn, t.state, t.reason, t.createdBy])).toEqual([
      [30, TODAY, null, 'in_force', 'agreed with the made-up school', 'Farid Founder'],
      // Replaced on its own first day: never in force.
      [50, TODAY, day(-1), 'never', 'agreed with the made-up school', 'Farid Founder'],
    ]);
    expect(minimums[1].replacedBy).toBe(minimums[0].termId);
    const audits = await rows(`select event_action, target_id, after_state, actor_user_id from audit_log where school_id = $1 and event_action = 'billing.terms.added' order by audit_id`, [G]);
    expect(audits.map((r: { after_state: { kind: string } }) => r.after_state.kind)).toEqual(['minimum', 'price', 'discount', 'complimentary', 'minimum', 'discount']);
    for (const r of audits) expect(r).toMatchObject({ actor_user_id: FOUNDER, after_state: { starts_on: TODAY, reason: 'agreed with the made-up school' } });
    expect(audits[0].after_state).toMatchObject({ minimum_students: 50, ends_on: null, replaced: [] });
    expect(audits[1].after_state).toMatchObject({ price_month_minor: 2500, price_year_minor: 24000 });
    expect(audits[3].after_state).toMatchObject({ module_id: 'parent-ai', ends_on: day(30) });
    expect(audits[4].after_state.replaced).toEqual([{ term_id: minimums[1].termId, ends_on: { from: null, to: day(-1) } }]);
  });

  it('a term begins later and is replaced before it begins; ending one brings its last day forward, with a reason, audited', async () => {
    const later = await term(G, { kind: 'price', priceMonthMinor: 2000, priceYearMinor: 20000, startsOn: day(10), endsOn: day(40) });
    expect(later).toMatchObject({ ok: true, replaced: [expect.any(String)] }); // the open price from today now ends on day 9
    const id = (later as { termId: string }).termId;
    expect((await due(G, day(9)))!.pricePerStudentMinor).toBe(24000);
    expect((await due(G, day(10)))!.pricePerStudentMinor).toBe(20000);
    expect((await due(G, day(41)))!).toMatchObject({ priceSource: 'plan', pricePerStudentMinor: 30000 }); // back to the plan's price
    const end = (input: { endsOn: string; reason?: string }) => platform((c) => endTerm(c, by, G, { termId: id, reason: 'the school asked to stop early', ...input }));
    expect(await end({ endsOn: day(-2) })).toEqual({ ok: false, reason: 'ends_on' }); // a day already past
    expect(await end({ endsOn: day(41) })).toEqual({ ok: false, reason: 'term' }); // later than it already ends
    expect(await end({ endsOn: day(20), reason: '' })).toEqual({ ok: false, reason: 'reason' });
    expect(await platform((c) => endTerm(c, by, G, { termId: s(66), endsOn: day(20), reason: 'no such term' }))).toEqual({ ok: false, reason: 'not_found' });
    expect(await platform((c) => endTerm(c, by, P, { termId: id, endsOn: day(20), reason: 'another school’s term' }))).toEqual({ ok: false, reason: 'not_found' });
    expect(await end({ endsOn: day(20) })).toMatchObject({ ok: true });
    expect((await platform((c) => listTerms(c, G))).find((t) => t.termId === id)).toMatchObject({ endsOn: day(20), endedBy: 'Farid Founder', endReason: 'the school asked to stop early', state: 'later', replacedBy: null });
    expect(await rows(`select before_state, after_state from audit_log where event_action = 'billing.terms.ended' and target_id = $1`, [id])).toEqual([{ before_state: { ends_on: day(40) }, after_state: { kind: 'price', ends_on: day(20), reason: 'the school asked to stop early' } }]);
  });

  it('what is not a term is refused in plain codes and writes nothing', async () => {
    const before = (await rows(`select count(*)::int as n from school_billing_terms`))[0].n;
    expect(await term(G, { kind: 'coupon' })).toEqual({ ok: false, reason: 'kind' });
    expect(await term(G, { kind: 'price', priceMonthMinor: 2500 })).toEqual({ ok: false, reason: 'price' });
    expect(await term(G, { kind: 'price', priceMonthMinor: 25.5, priceYearMinor: 255 })).toEqual({ ok: false, reason: 'price' });
    expect(await term(G, { kind: 'discount', discountBp: 10001 })).toEqual({ ok: false, reason: 'percent' });
    expect(await term(G, { kind: 'minimum', minimumStudents: -1 })).toEqual({ ok: false, reason: 'minimum' });
    expect(await term(G, { kind: 'complimentary', moduleId: 'payroll', endsOn: day(5) })).toEqual({ ok: false, reason: 'module' }); // not built
    expect(await term(G, { kind: 'complimentary', moduleId: 'help-center', endsOn: day(5) })).toEqual({ ok: false, reason: 'module' }); // always on anyway
    expect(await term(G, { kind: 'complimentary', moduleId: 'events' })).toEqual({ ok: false, reason: 'ends_on' }); // always has a last day
    expect(await term(G, { kind: 'minimum', minimumStudents: 5, startsOn: day(-1) })).toEqual({ ok: false, reason: 'starts_on' });
    expect(await term(G, { kind: 'minimum', minimumStudents: 5, startsOn: day(5), endsOn: day(4) })).toEqual({ ok: false, reason: 'ends_on' });
    expect(await term(G, { kind: 'minimum', minimumStudents: 5, reason: 'no' })).toEqual({ ok: false, reason: 'reason' });
    expect(await term(s(77), { kind: 'minimum', minimumStudents: 5 })).toEqual({ ok: false, reason: 'not_found' });
    expect(await term('not-a-school', { kind: 'minimum', minimumStudents: 5 })).toEqual({ ok: false, reason: 'not_found' });
    expect((await rows(`select count(*)::int as n from school_billing_terms`))[0].n).toBe(before);
    // What Control sends, typed in rupees and percent.
    expect(termInputFromBody({ kind: 'price', priceMonthRupees: '25', priceYearRupees: '240.00' })).toMatchObject({ ok: true, value: { priceMonthMinor: 2500, priceYearMinor: 24000 } });
    expect(termInputFromBody({ kind: 'price', priceMonthRupees: '25' })).toEqual({ ok: false, reason: 'price' });
    expect(termInputFromBody({ kind: 'discount', percent: '12.5' })).toMatchObject({ ok: true, value: { discountBp: 1250 } });
    expect(termInputFromBody({ kind: 'discount', percent: '12.555' })).toEqual({ ok: false, reason: 'percent' });
    expect(termInputFromBody({ kind: 'minimum', minimumStudents: '1,200' })).toMatchObject({ ok: true, value: { minimumStudents: 1200 } });
    expect(termInputFromBody({ kind: 'minimum', minimumStudents: 'many' })).toEqual({ ok: false, reason: 'minimum' });
  });

  it('the database holds the same rules for anything that does not come through Control: never removed, never changed, no two of a kind on a day, no past day rewritten', async () => {
    const [{ term_id: id }] = await rows(`select term_id from school_billing_terms where school_id = $1 and kind = 'discount' and ends_on is null`, [G]);
    for (const run of [platform, (fn: (c: { query: (q: string, p?: unknown[]) => Promise<unknown> }) => Promise<unknown>) => fn(db.pg)]) {
      await expect(run((c) => c.query(`delete from school_billing_terms where term_id = $1`, [id]))).rejects.toThrow(/permission denied|never removed/);
      await expect(run((c) => c.query(`update school_billing_terms set discount_bp = 1 where term_id = $1`, [id]))).rejects.toThrow(/never changed/);
      await expect(run((c) => c.query(`update school_billing_terms set reason = 'rewritten' where term_id = $1`, [id]))).rejects.toThrow(/never changed/);
      await expect(run((c) => c.query(`update school_billing_terms set ends_on = $2::date, ended_by = $3, ended_at = now(), end_reason = 'into the past' where term_id = $1`, [id, day(-5), FOUNDER]))).rejects.toThrow(/never rewritten/);
      await expect(run((c) => c.query(`insert into school_billing_terms (school_id, kind, discount_bp, starts_on, reason, created_by) values ($1, 'discount', 100, $2::date, 'a second discount', $3)`, [G, day(3), FOUNDER]))).rejects.toThrow(/in force on some of these days/);
      await expect(run((c) => c.query(`insert into school_billing_terms (school_id, kind, minimum_students, starts_on, reason, created_by) values ($1, 'minimum', 10, $2::date, 'backdated', $3)`, [P, day(-3), FOUNDER]))).rejects.toThrow(/today or later/);
      await expect(run((c) => c.query(`insert into school_billing_terms (school_id, kind, module_id, starts_on, reason, created_by) values ($1, 'complimentary', 'events', $2::date, 'no last day', $3)`, [P, TODAY, FOUNDER]))).rejects.toThrow(/check constraint/);
      await expect(run((c) => c.query(`insert into school_billing_terms (school_id, kind, discount_bp, minimum_students, starts_on, reason, created_by) values ($1, 'discount', 100, 5, $2::date, 'two values', $3)`, [P, TODAY, FOUNDER]))).rejects.toThrow(/check constraint/);
    }
    // A term replaced names a row of its own school.
    await expect(platform((c) => c.query(`update school_billing_terms set ends_on = $2::date, ended_by = $3, ended_at = now(), replaced_by = $4 where term_id = $1`, [id, day(5), FOUNDER, s(66)]))).rejects.toThrow(/foreign key/);
  });

  it('no school role reads or writes a term, or the audit rows about them; the platform role does', async () => {
    expect((await rows(`select count(*)::int as n from school_billing_terms where school_id = $1`, [G]))[0].n).toBeGreaterThan(3);
    expect((await rows(`select count(*)::int as n from audit_log where school_id = $1 and event_action like 'billing.terms.%'`, [G]))[0].n).toBeGreaterThan(3);
    for (const who of schoolRoles) {
      await expect(as(who, (c) => c.query(`select 1 from school_billing_terms`))).rejects.toThrow(/permission denied/);
      await expect(as(who, (c) => c.query(`insert into school_billing_terms (school_id, kind, minimum_students, starts_on, reason, created_by) values ($1, 'minimum', 1, $2::date, 'from the school', $3)`, [G, TODAY, who.user]))).rejects.toThrow(/permission denied/);
      // Its own school's audit rows are read by every role of a school; these are not among them.
      expect(await as(who, async (c) => (await c.query(`select 1 from audit_log where event_action like 'billing.terms.%'`)).rows), who.role).toEqual([]);
      expect((await as(who, async (c) => (await c.query(`select count(*)::int as n from audit_log where school_id = $1`, [G])).rows[0].n)), who.role).toBeGreaterThan(0);
    }
    expect((await platform(async (c) => (await c.query(`select count(*)::int as n from audit_log where event_action like 'billing.terms.%'`)).rows[0].n))).toBeGreaterThan(3);
    expect((await platform((c) => listTerms(c, G))).length).toBeGreaterThan(3);
  });
});

describe('complimentary modules are on until their last day, whatever the plan, then back to what the plan gives', () => {
  it('switched on at once, as complimentary; on through its last day; off after it by the nightly job; audited', async () => {
    // C is on Growth, which does not give Parent AI: the school has no row for it.
    expect(await moduleRow(C, 'parent-ai')).toBeNull();
    const r = await term(C, { kind: 'complimentary', moduleId: 'parent-ai', endsOn: day(10) });
    expect(r).toMatchObject({ ok: true, switchedOn: ['parent-ai'], switchedOff: [] });
    expect(await moduleRow(C, 'parent-ai')).toEqual({ enabled: true, source: 'complimentary' });
    expect(await isOnFor(C, 'parent-ai')).toBe(true);
    expect((await as({ school: C, role: 'principal', user: PRINCIPAL_G }, (c) => checkModuleAccess(c, { schoolId: C, role: 'principal' }, 'parent-ai', { write: true }))).ok).toBe(true);
    // The amount does not change with it.
    await platform((c) => setBillingPeriod(c, by, C, { period: 'month', reason: 'monthly' }));
    expect((await due(C))!).toMatchObject({ amountMinor: 0, complimentary: [{ moduleId: 'parent-ai', endsOn: day(10) }] });

    await nightly(day(5));
    await nightly(day(10)); // its last day: still on
    expect(await moduleRow(C, 'parent-ai')).toEqual({ enabled: true, source: 'complimentary' });
    await nightly(day(11)); // the day after: back to the plan, which does not give it
    expect(await moduleRow(C, 'parent-ai')).toEqual({ enabled: false, source: 'plan' });
    expect(await isOnFor(C, 'parent-ai')).toBe(false);
    await nightly(day(12));
    const history = (await platform((c) => entitlementHistory(c, C))).filter((h) => h.kind === 'module_changed' && h.moduleId === 'parent-ai');
    expect(history.map((h) => [h.enabled, h.actorName, h.reason])).toEqual([
      [{ from: true, to: false }, null, 'The complimentary period is over; the plan does not give this module.'],
      [{ from: null, to: true }, 'Farid Founder', `Complimentary until the end of ${day(10)}.`],
    ]);
  });

  // The nightly runs below go forward from day 13, after the days the test above has already run. D is a school of its
  // own: C's Parent AI term (today to day 10) is in force today, so a term added for C today would switch it on again.
  it('one the plan gives stays on after its last day, from the plan; one that begins later is switched on that morning; another plan does not switch it off', async () => {
    expect(await term(D, { kind: 'complimentary', moduleId: 'events', endsOn: day(13) })).toMatchObject({ ok: true, switchedOn: ['events'] });
    expect(await moduleRow(D, 'events')).toEqual({ enabled: true, source: 'complimentary' });
    expect(await term(D, { kind: 'complimentary', moduleId: 'school-auditor', startsOn: day(14), endsOn: day(16) })).toMatchObject({ ok: true, switchedOn: [] });
    expect(await moduleRow(D, 'school-auditor')).toBeNull();
    // Moved to Starter (no Events) while Events is complimentary: it stays on.
    expect((await platform((c) => applyPlan(c, D, 'starter', founder, 'a smaller plan'))).ok).toBe(true);
    expect(await moduleRow(D, 'events')).toEqual({ enabled: true, source: 'complimentary' });
    expect(await moduleRow(D, 'ptm')).toEqual({ enabled: false, source: 'plan' }); // what Starter does not give is off
    expect(await platform((c) => applyPlan(c, D, 'growth', founder, 'back on Growth'))).toMatchObject({ ok: true });
    await nightly(day(13)); // Events' last day: still complimentary; the auditor's not begun
    expect([await moduleRow(D, 'events'), await moduleRow(D, 'school-auditor')]).toEqual([{ enabled: true, source: 'complimentary' }, null]);
    await nightly(day(14)); // Growth gives Events: on, from the plan; the auditor's first day
    expect([await moduleRow(D, 'events'), await moduleRow(D, 'school-auditor')]).toEqual([{ enabled: true, source: 'plan' }, { enabled: true, source: 'complimentary' }]);
    await nightly(day(17));
    expect(await moduleRow(D, 'school-auditor')).toEqual({ enabled: false, source: 'plan' });
  });

  it('ended early, it is off at once; a module the founder set by hand keeps the founder’s choice', async () => {
    const r = await term(C, { kind: 'complimentary', moduleId: 'early-warning', endsOn: day(20) });
    expect(await moduleRow(C, 'early-warning')).toEqual({ enabled: true, source: 'complimentary' });
    expect(await platform((c) => endTerm(c, by, C, { termId: (r as { termId: string }).termId, endsOn: day(-1), reason: 'the trial was not wanted' }))).toMatchObject({ ok: true, switchedOff: ['early-warning'] });
    expect(await moduleRow(C, 'early-warning')).toEqual({ enabled: false, source: 'plan' });
    // By hand: Parent AI switched off by the founder; a complimentary term does not override that.
    await platform((c) => changeModuleEntitlement(c, { schoolId: C, moduleId: 'parent-ai', enabled: false, reason: 'not for this school' }, founder));
    expect(await term(C, { kind: 'complimentary', moduleId: 'parent-ai', startsOn: TODAY, endsOn: day(9) })).toMatchObject({ ok: true, switchedOn: [] });
    expect(await moduleRow(C, 'parent-ai')).toEqual({ enabled: false, source: 'founder_override' });
    // Run again, nothing changes: the founder's choice stands, and a module already complimentary stays as it is.
    const before = await rows(`select module_id, enabled, source from school_module_entitlements where school_id = $1 order by 1`, [C]);
    await platform((c) => syncComplimentaryModules(c, C, TODAY, null));
    expect(await platform((c) => syncComplimentaryModules(c, C, TODAY, null))).toEqual({ on: [], off: [] });
    expect(await rows(`select module_id, enabled, source from school_module_entitlements where school_id = $1 order by 1`, [C])).toEqual(before);
  });

  it('the nightly job is queued for a complimentary module even when no school has a paid-until day', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.pg.transaction(async (tx: any) => {
      await tx.query(`delete from jobs where type = 'billing.nightly'`);
      expect((await tx.query(`select count(*)::int as n from school_subscriptions where paid_until is not null`)).rows[0].n).toBe(0);
      await tx.query(`select billing_nightly_enqueue()`);
      expect((await tx.query(`select count(*)::int as n from jobs where type = 'billing.nightly'`)).rows[0].n).toBe(1);
      await tx.rollback();
    });
  });
});

describe('no price is written in src', () => {
  it('no plan’s price, in paise, is a number in the code of this slice; the migration is where the prices are', () => {
    const files = ['src/lib/control/billing-amount.ts', 'src/lib/control/billing-terms.ts', 'src/lib/control/billing-input.ts', 'src/lib/control/billing.ts', 'src/lib/frameworks/plans.ts', 'src/components/control/BillingTerms.tsx', 'src/components/control/BillingPlansView.tsx', 'src/components/control/BillingSchools.tsx', 'src/app/api/control/schools/[schoolId]/subscription/route.ts'];
    const prices = ['1500', '15000', '3000', '30000', '5000', '50000'];
    for (const f of files) {
      const numbers = readFileSync(path.join(ROOT, f), 'utf8').replace(/(\d)_(?=\d)/g, '$1').match(/\b\d+\b/g) ?? [];
      expect(numbers.filter((n) => prices.includes(n)), f).toEqual([]);
    }
    const migration = readFileSync(path.join(ROOT, 'supabase/migrations', readdirSync(path.join(ROOT, 'supabase/migrations')).find((f) => f.endsWith('_c212_pricing.sql'))!), 'utf8');
    expect(migration).toMatch(/\('essential', 'Essential', 1500, 15000,/);
    expect(migration).toMatch(/\('growth', 'Growth', 3000, 30000,/);
    expect(migration).toMatch(/\('premium', 'Premium', 5000, 50000,/);
  });

  it('the plans on the screen are the table’s: names and prices come from the rows', async () => {
    const plans = await platform((c) => listPlans(c));
    expect(plans.map((p) => p.planId)).toEqual(expect.arrayContaining(['starter', 'growth', 'compass', 'standard']));
    expect(plans.map((p) => p.planId)).not.toEqual(expect.arrayContaining(['essential']));
    expect(plans.find((p) => p.planId === 'standard')).toMatchObject({ testSchoolsOnly: true });
  });
});
