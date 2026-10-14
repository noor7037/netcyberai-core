import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { recordPayment } from '@/lib/control/billing';
import { setSchoolBoard } from '@/lib/exams/boards';
import { applyDefaultPlan, applyPlan, defaultPlanId } from '@/lib/frameworks/plans';
import { indiaDate } from '@/lib/time/india';
import { setSchoolBudget } from '@/lib/whatsapp/cost';

// C219 (supervisor, C218-A): "only the principal and school admin may change their school's row, and only its
// profile columns"; and "'standard' is for test schools only, a real school is put on Starter, Growth or Compass at
// onboarding". On the whole schema, as the app's own database role and as the platform role. Every school and person
// here is made up.

const ROOT = path.resolve(__dirname, '../..');
const u = (n: number) => `c2190000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B, T] = [u(1), u(2), u(3)];
const [PRINCIPAL, ADMIN, COORDINATOR, TEACHER, ACCOUNTANT, PARENT, B_PRINCIPAL, FOUNDER] = [u(11), u(12), u(13), u(14), u(15), u(16), u(21), u(91)];
// The profile columns: the school's own name and address (the migration's header lists them).
const PROFILE = ['address', 'name'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school?: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const coordinator: Who = { role: 'academic_coordinator', user: COORDINATOR };
const teacher: Who = { role: 'teacher', user: TEACHER };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
const parent: Who = { role: 'parent', user: PARENT };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <R>(who: Who, fn: (client: any) => Promise<R>): Promise<R> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school ?? A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// The platform role as Control uses it: a NetCyberAI staff session (withTenantContext sets these for super_admin).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <R>(fn: (client: any) => Promise<R>): Promise<R> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    for (const [k, v] of [['app.current_tenant_id', '00000000-0000-0000-0000-000000000000'], ['app.current_role', 'super_admin'], ['app.current_user_id', FOUNDER]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// What happened to a statement: how many rows it changed, or the database's refusal.
const attempt = (who: Who, sql: string, params: unknown[] = []) =>
  as(who, (c) => c.query(sql, params).then((r: { rowCount: number }) => `changed ${r.rowCount}`, (e: Error) => e.message));
const row = async (school: string) => (await db.pg.query(`select * from schools where school_id = $1`, [school])).rows[0];
const founder = { userId: FOUNDER, role: 'super_admin' as const };

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, address, jurisdiction, is_test_fixture) values
      ('${A}', 'Made-up School A', 'Old Road', 'IN-HR', false), ('${B}', 'Made-up School B', 'Far Road', 'IN-DL', false), ('${T}', 'Made-up Test School', null, 'IN-UP', true);
    insert into users (user_id, school_id, email, role, display_name) values
      ('${PRINCIPAL}', '${A}', 'principal@a.example', 'principal', 'Priya Principal'), ('${ADMIN}', '${A}', 'admin@a.example', 'school_admin', 'Asif Admin'),
      ('${COORDINATOR}', '${A}', 'coordinator@a.example', 'academic_coordinator', 'Chitra Coordinator'), ('${TEACHER}', '${A}', 'teacher@a.example', 'teacher', 'Tara Teacher'),
      ('${ACCOUNTANT}', '${A}', 'accounts@a.example', 'accountant', 'Anil Accountant'), ('${PARENT}', '${A}', 'parent@a.example', 'parent', 'Pooja Parent'),
      ('${B_PRINCIPAL}', '${B}', 'principal@b.example', 'principal', 'Bela Principal'), ('${FOUNDER}', null, 'founder@platform.example', 'super_admin', 'Farid Founder');
  `);
}, 120_000);
afterAll(async () => db?.stop());

describe('the schools row: only the principal and the school admin, and only the profile columns', () => {
  it('the principal and the school admin change their own school’s name and address; the day it changed moves with it', async () => {
    const before = await row(A);
    expect(await attempt(principal, `update schools set name = 'Made-up School A Renamed', address = 'New Road' where school_id = $1`, [A])).toBe('changed 1');
    const after = await row(A);
    expect([after.name, after.address]).toEqual(['Made-up School A Renamed', 'New Road']);
    expect(new Date(after.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(before.updated_at).getTime());
    expect(await attempt(admin, `update schools set address = 'Old Road' where school_id = $1`, [A])).toBe('changed 1');
    expect((await row(A)).address).toBe('Old Road');
    // The app's role holds UPDATE on those two columns only, and no INSERT or DELETE at all.
    const granted = (await db.pg.query(`select column_name from information_schema.column_privileges where table_name = 'schools' and grantee = 'app_user' and privilege_type = 'UPDATE' order by 1`)).rows.map((r: { column_name: string }) => r.column_name);
    expect(granted).toEqual(PROFILE);
    const migration = readFileSync(path.join(ROOT, 'supabase/migrations', readdirSync(path.join(ROOT, 'supabase/migrations')).find((f) => f.endsWith('_c219_p6_closeout.sql'))!), 'utf8');
    expect(migration).toContain('grant update (name, address) on schools to app_user;');
  });

  it('every other role is refused: the coordinator, a teacher, the accountant, a parent account, and a session claiming the platform', async () => {
    for (const who of [coordinator, teacher, accountant, parent, { role: 'super_admin', user: FOUNDER }]) {
      expect(await attempt(who, `update schools set name = 'Taken Over' where school_id = $1`, [A]), who.role).toBe('changed 0');
      expect(await attempt(who, `update schools set address = 'Taken Over' where school_id = $1`, [A]), who.role).toBe('changed 0');
    }
    expect((await row(A)).name).toBe('Made-up School A Renamed');
  });

  it('the principal and the school admin are refused on every column that is not a profile column', async () => {
    const columns = (await db.pg.query(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'schools' order by ordinal_position`)).rows.map((r: { column_name: string }) => r.column_name);
    const others = columns.filter((c: string) => !PROFILE.includes(c));
    // Plan, billing, pilot, test fixture, budget and board among them, by name.
    for (const c of ['plan', 'subscription_status', 'monthly_budget_paise', 'is_pilot', 'pilot_allow_outbound', 'is_test_fixture', 'board', 'board_id', 'board_set_by', 'board_set_at', 'onboarding_stage', 'jurisdiction', 'timezone', 'quiet_hours_start', 'at_risk_parent_dispatch_enabled', 'recognition_class_ranking_enabled', 'school_id', 'updated_at']) expect(others).toContain(c);
    const before = await row(A);
    for (const who of [principal, admin]) {
      for (const c of others) expect(await attempt(who, `update schools set ${c} = ${c} where school_id = $1`, [A]), `${who.role} ${c}`).toMatch(/permission denied/);
      // Two at once is refused as a whole: the profile column is not changed either.
      expect(await attempt(who, `update schools set name = 'Sneaked', pilot_allow_outbound = true where school_id = $1`, [A]), who.role).toMatch(/permission denied/);
    }
    expect(await row(A)).toEqual(before);
  });

  it('another school’s row is not theirs: nothing changes there', async () => {
    expect(await attempt(principal, `update schools set name = 'Taken Over' where school_id = $1`, [B])).toBe('changed 0');
    expect(await attempt({ ...admin }, `update schools set address = 'Taken Over' where school_id = $1`, [B])).toBe('changed 0');
    // B's own principal changes B, and not A.
    const bPrincipal: Who = { role: 'principal', user: B_PRINCIPAL, school: B };
    expect(await attempt(bPrincipal, `update schools set address = 'Far Road Two' where school_id = $1`, [B])).toBe('changed 1');
    expect(await attempt(bPrincipal, `update schools set name = 'Taken Over' where school_id = $1`, [A])).toBe('changed 0');
    expect([(await row(A)).name, (await row(B)).name, (await row(B)).address]).toEqual(['Made-up School A Renamed', 'Made-up School B', 'Far Road Two']);
  });

  it('no school role makes or removes a school', async () => {
    for (const who of [principal, admin, teacher]) {
      expect(await attempt(who, `insert into schools (school_id, name, jurisdiction) values ($1, 'Another', 'IN-HR')`, [u(4)]), who.role).toMatch(/permission denied/);
      expect(await attempt(who, `delete from schools where school_id = $1`, [A]), who.role).toMatch(/permission denied/);
    }
  });

  it('the trigger holds the same line even if a later migration granted more: only the profile columns change from the app’s role', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const got = await db.pg.transaction(async (tx: any) => {
      await tx.query('grant update on schools to app_user'); // undone with the transaction
      await tx.query('set local role app_user');
      for (const [k, v] of [['app.current_tenant_id', A], ['app.current_role', 'principal'], ['app.current_user_id', PRINCIPAL]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
      await tx.query('savepoint try');
      const refused = await tx.query(`update schools set is_pilot = false where school_id = $1`, [A]).then(() => 'changed', (e: Error) => e.message);
      await tx.query('rollback to savepoint try');
      const allowed = await tx.query(`update schools set name = name where school_id = $1`, [A]).then((r: { rowCount: number }) => `changed ${r.rowCount}`);
      await tx.rollback();
      return [refused, allowed];
    });
    expect(got).toEqual([expect.stringMatching(/a school changes only its own name and address/), 'changed 1']);
    expect((await db.pg.query(`select count(*)::int as n from information_schema.table_privileges where table_name = 'schools' and grantee = 'app_user' and privilege_type = 'UPDATE'`)).rows[0].n).toBe(0);
  });

  it('the platform role changes the plan, billing, pilot, test-fixture, budget and board fields, as Control does', async () => {
    await platform((c) => c.query(`update schools set pilot_allow_outbound = true, is_pilot = false, subscription_status = 'active', plan = 'growth' where school_id = $1`, [A]));
    expect(await platform((c) => setSchoolBudget(c, { userId: FOUNDER }, A, 500000, 'a made-up limit'))).toEqual({ ok: true });
    expect(await platform((c) => setSchoolBoard(c, founder, A, 'cbse'))).toEqual({ ok: true, changed: true });
    await platform((c) => c.query(`update schools set is_test_fixture = true where school_id = $1`, [B]));
    const a = await row(A);
    expect([a.pilot_allow_outbound, a.is_pilot, a.subscription_status, a.plan, Number(a.monthly_budget_paise), a.board_id, a.board_set_by]).toEqual([true, false, 'active', 'growth', 500000, 'cbse', FOUNDER]);
    expect((await row(B)).is_test_fixture).toBe(true);
    await platform((c) => c.query(`update schools set is_test_fixture = false where school_id = $1`, [B]));
  });
});

describe('the plan for test schools only (C219)', () => {
  it('the database refuses a real school’s subscription to it, and lets a test school have one', async () => {
    expect((await db.pg.query(`select plan_id from plans where test_schools_only`)).rows).toEqual([{ plan_id: 'standard' }]);
    await expect(platform((c) => c.query(`insert into school_subscriptions (school_id, plan_id) values ($1, 'standard')`, [A]))).rejects.toThrow(/for test schools only/);
    await platform((c) => c.query(`insert into school_subscriptions (school_id, plan_id) values ($1, 'standard')`, [T]));
    await platform((c) => c.query(`insert into school_subscriptions (school_id, plan_id) values ($1, 'growth')`, [A]));
    await expect(platform((c) => c.query(`update school_subscriptions set plan_id = 'standard' where school_id = $1`, [A]))).rejects.toThrow(/for test schools only/);
    // Other changes to a row keep working (only the plan is checked).
    await platform((c) => c.query(`update school_subscriptions set billing_period = 'year' where school_id = $1`, [A]));
    // In the app's code too, before the database is asked.
    expect(await platform((c) => applyPlan(c, A, 'standard', founder, 'to the test schools plan'))).toEqual({ ok: false, error: 'test schools only' });
    expect((await platform((c) => applyPlan(c, T, 'standard', founder, 'a test school'))).ok).toBe(true);
  });

  it('a test school on it is not made a real school, and a plan a real school is on is not made test-only', async () => {
    await expect(platform((c) => c.query(`update schools set is_test_fixture = false where school_id = $1`, [T]))).rejects.toThrow(/plan for test schools only/);
    await expect(platform((c) => c.query(`update plans set test_schools_only = true where plan_id = 'growth'`))).rejects.toThrow(/a real school is on this plan/);
    expect([(await row(T)).is_test_fixture, (await db.pg.query(`select test_schools_only from plans where plan_id = 'growth'`)).rows[0].test_schools_only]).toEqual([true, false]);
  });

  it('a real school recorded on it before subscriptions existed is not given it: Control is told the school has no plan yet', async () => {
    const [legacy, legacyTest] = [u(7), u(8)];
    await db.pg.query(`insert into schools (school_id, name, jurisdiction, is_test_fixture) values ($1, 'Made-up Legacy School', 'IN-PB', false), ($2, 'Made-up Legacy Test School', 'IN-PB', true)`, [legacy, legacyTest]);
    await db.pg.query(`insert into school_entitlements (school_id, plan) values ($1, 'standard'), ($2, 'standard')`, [legacy, legacyTest]);
    const today = indiaDate();
    const later = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
    const pay = (school: string) => platform((c) => recordPayment(c, { userId: FOUNDER }, school, { amountMinor: 100000, paidOn: today, coversUntil: later, reference: 'made-up cheque 1' }, today));
    expect(await pay(legacy)).toEqual({ ok: false, reason: 'no_plan' });
    expect((await db.pg.query(`select count(*)::int as n from school_subscriptions where school_id = $1`, [legacy])).rows[0].n).toBe(0);
    // A test school recorded on it gets its row, as before.
    expect(await pay(legacyTest)).toMatchObject({ ok: true });
    expect((await db.pg.query(`select plan_id from school_subscriptions where school_id = $1`, [legacyTest])).rows).toEqual([{ plan_id: 'standard' }]);
  });

  it('onboarding puts a real school on a plan for schools: the plan for new schools is Starter, as the migration left it', async () => {
    expect(await platform((c) => defaultPlanId(c))).toBe('starter');
    const fresh = u(5);
    await db.pg.query(`insert into schools (school_id, name, jurisdiction) values ($1, 'Made-up New School', 'IN-RJ')`, [fresh]);
    expect(await platform((c) => applyDefaultPlan(c, fresh, founder, 'a new school'))).toMatchObject({ planId: 'starter' });
    expect((await db.pg.query(`select plan_id from school_subscriptions where school_id = $1`, [fresh])).rows).toEqual([{ plan_id: 'starter' }]);
    // Were the setting ever to name the test schools' plan (it cannot be set so in Control), a new school would be refused rather than put on it.
    await db.pg.query(`update platform_settings set value = '"standard"'::jsonb where key = 'billing.default_plan'`);
    try {
      const other = u(6);
      await db.pg.query(`insert into schools (school_id, name, jurisdiction) values ($1, 'Made-up Other School', 'IN-RJ')`, [other]);
      await expect(platform((c) => applyDefaultPlan(c, other, founder, 'a new school'))).rejects.toThrow(/test schools only/);
      expect((await db.pg.query(`select count(*)::int as n from school_subscriptions where school_id = $1`, [other])).rows[0].n).toBe(0);
    } finally {
      await db.pg.query(`update platform_settings set value = '"starter"'::jsonb where key = 'billing.default_plan'`);
    }
  });
});
