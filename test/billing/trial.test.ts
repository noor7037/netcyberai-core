import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { recordPayment } from '@/lib/control/billing';
import { schoolTrialNotice, trialNoticeText, type TrialNotice } from '@/lib/control/billing-notice';
import { BILLING_NIGHTLY_JOB, billingNightlyHandler } from '@/lib/control/billing-nightly';
import { addTerm } from '@/lib/control/billing-terms';
import { extendTrial, listTrials, startTrial, trialHistory } from '@/lib/control/trial';
import { ALWAYS_ON_MODULES } from '@/lib/contracts/entitlements';
import type { ModuleId } from '@/lib/contracts/modules';
import { changeModuleEntitlement, loadEntitlements } from '@/lib/frameworks/entitlements';
import { applyPlan, loadPlan, PLAN_FEATURES, planHasFeature, workingModules } from '@/lib/frameworks/plans';
import { indiaDate } from '@/lib/time/india';

// C226 (C223-A answer 2): the free first month (docs/30_FREE_MONTH_TRIAL.md). The acceptance sentences:
//   "Control starts a 30-day trial for a school (trial_ends_on = India's today + 30 days by default; day 30 is the last
//    day) and may extend the date, each time with a reason kept as the founder's reasons are and an audit row that
//    holds no reason text. In the trial the school has every working module and every plan feature. The nightly
//    billing job moves the school to its plan after the trial ends (Asia/Kolkata midnight; a job that runs late or
//    twice moves it once), audited. The principal sees N days left, and from 7 days before the end a notice. Control
//    lists schools by trial end, soonest first."
// On every migration, as the app's own database roles. Every school, person and reason here is made up.

const s = (n: number) => `c2260000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
// A: Starter, the plain free month. B: put on Growth when it starts; extended. M: India's midnight. C: extended on day
// 31 before the move. N: no free month. T: a test school on the test schools' plan. P: already pays. F: a hand switch
// and a complimentary term. Q: a payment during the free month. R: who reads what. O: another school.
const [A, B, M, C, N, T, P, F, Q, R, O] = [s(1), s(2), s(3), s(4), s(5), s(6), s(7), s(8), s(9), s(10), s(11)];
const FOUNDER = s(90);
const [PRINCIPAL_R, ADMIN_R, TEACHER_R, ACCOUNTANT_R, COORD_R, PRINCIPAL_O, PRINCIPAL_A] = [s(91), s(92), s(93), s(94), s(95), s(96), s(97)];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { school: string; role: string; user: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <X>(who: Who, fn: (client: any) => Promise<X>): Promise<X> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <X>(fn: (client: any) => Promise<X>): Promise<X> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const founder = { userId: FOUNDER, role: 'super_admin' as const };
const rows = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;
const TODAY = indiaDate();
const day = (n: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const job = (date: string) => ({ jobId: 'j', type: BILLING_NIGHTLY_JOB, payload: { date }, attempts: 1, maxAttempts: 8, schoolId: null, idempotencyKey: 'k' });
// The nightly job as it runs at noon in India on that day, or at an exact instant.
const nightlyAt = (at: Date) => billingNightlyHandler({ platform, now: () => at })(job(indiaDate(at)));
const nightly = (onDay: string) => nightlyAt(new Date(`${onDay}T12:00:00+05:30`));
const start = (school: string, input: Record<string, unknown> = {}) => platform((c) => startTrial(c, founder, school, { reason: 'made-up: agreed at the demo', ...input }));
const trialRow = async (school: string) => (await rows(`select starts_on::text as starts_on, ends_on::text as ends_on, ended_at is not null as ended, ended_plan_id from school_trials where school_id = $1`, [school]))[0] ?? null;
const switches = async (school: string) =>
  Object.fromEntries((await rows(`select module_id, enabled, source from school_module_entitlements where school_id = $1 order by module_id`, [school])).map((r: { module_id: string; enabled: boolean; source: string }) => [r.module_id, `${r.enabled ? 'on' : 'off'}:${r.source}`]));
const onModules = async (school: string) => (await rows(`select module_id from school_module_entitlements where school_id = $1 and enabled order by module_id`, [school])).map((r: { module_id: string }) => r.module_id);
const principalOf = (school: string, user = PRINCIPAL_A): Who => ({ school, role: 'principal', user });
const featuresFor = async (school: string) => {
  const out: Record<string, boolean> = {};
  for (const f of PLAN_FEATURES) out[f] = await as(principalOf(school), (c) => planHasFeature(c, school, f));
  return out;
};
const audits = async (school: string, action: string) => rows(`select audit_id, actor_user_id, before_state, after_state from audit_log where school_id = $1 and event_action = $2 order by audit_id`, [school, action]);
const working = () => [...workingModules()].sort();

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values
      ('${A}', 'Made-up Starter School', 'IN-HR', false), ('${B}', 'Made-up Extended School', 'IN-DL', false), ('${M}', 'Made-up Midnight School', 'IN-UP', false),
      ('${C}', 'Made-up Late School', 'IN-MH', false), ('${N}', 'Made-up School Without', 'IN-RJ', false), ('${T}', 'Made-up Test School', 'IN-KA', true),
      ('${P}', 'Made-up Paying School', 'IN-TN', false), ('${F}', 'Made-up Hand School', 'IN-GJ', false), ('${Q}', 'Made-up Paying-ahead School', 'IN-PB', false),
      ('${R}', 'Made-up Reading School', 'IN-WB', false), ('${O}', 'Made-up Other School', 'IN-KL', false);
    insert into users (user_id, school_id, email, role, display_name) values
      ('${FOUNDER}', null, 'founder@netcyber.example', 'super_admin', 'Farid Founder'),
      ('${PRINCIPAL_A}', '${A}', 'principal@a.example', 'principal', 'Asha Principal'),
      ('${PRINCIPAL_R}', '${R}', 'principal@r.example', 'principal', 'Ravi Principal'),
      ('${ADMIN_R}', '${R}', 'admin@r.example', 'school_admin', 'Rina Admin'),
      ('${TEACHER_R}', '${R}', 'teacher@r.example', 'teacher', 'Rahul Teacher'),
      ('${ACCOUNTANT_R}', '${R}', 'accounts@r.example', 'accountant', 'Ritu Accountant'),
      ('${COORD_R}', '${R}', 'coord@r.example', 'academic_coordinator', 'Rohan Coordinator'),
      ('${PRINCIPAL_O}', '${O}', 'principal@o.example', 'principal', 'Omar Principal');
  `);
  // Each school on the plan it chose at onboarding (Starter, the plan for new schools), the test school on the test
  // schools' plan.
  for (const school of [A, B, M, C, N, P, F, Q, R, O]) {
    const r = await platform((c) => applyPlan(c, school, 'starter', founder, 'made-up: put on its plan for the test'));
    if (!r.ok) throw new Error(r.error);
  }
  const t = await platform((c) => applyPlan(c, T, 'standard', founder, 'made-up: the test schools’ plan'));
  if (!t.ok) throw new Error(t.error);
}, 120_000);
afterAll(async () => db?.stop());

describe('Control starts the free month', () => {
  it('today is day 0 and day 30 is the last day by default; every working module and every feature; the reason is the founder’s alone', async () => {
    const before = await featuresFor(A);
    expect(before['staff-leave']).toBe(false); // Starter has no staff leave
    const r = await start(A);
    expect(r).toEqual({ ok: true, endsOn: day(30), planId: 'starter', modules: expect.any(Array) });
    expect(await trialRow(A)).toEqual({ starts_on: TODAY, ends_on: day(30), ended: false, ended_plan_id: null });
    // Every module that works today is on, as the free month's own switch.
    const sw = await switches(A);
    for (const m of working()) expect(sw[m], m).toBe('on:trial');
    expect(await onModules(A)).toEqual(working());
    // Every feature, though Starter gives none (the database's own answer, as the school's session asks it).
    expect(Object.values(await featuresFor(A)).every(Boolean)).toBe(true);
    expect((await as(principalOf(A), (c) => loadEntitlements(c, A))).modules['early-warning' as ModuleId]?.enabled).toBe(true);
    // One audit row: dates, the plan and the modules, never the reason; the reason is in the founder's own table.
    const [row] = await audits(A, 'entitlement.trial_started');
    expect(row.actor_user_id).toBe(FOUNDER);
    expect(row.after_state).toEqual({ starts_on: TODAY, ends_on: day(30), plan: 'starter', modules: working() });
    expect(JSON.stringify(row.after_state)).not.toMatch(/reason|demo/i);
    expect(await rows(`select reason from entitlement_change_reasons where audit_id = $1`, [row.audit_id])).toEqual([{ reason: 'made-up: agreed at the demo' }]);
    // The school sees that its free month started and when; never why.
    expect(await as(principalOf(A), async (c) => (await c.query(`select after_state ->> 'ends_on' as ends_on from audit_log where event_action = 'entitlement.trial_started'`)).rows)).toEqual([{ ends_on: day(30) }]);
    await expect(as(principalOf(A), (c) => c.query(`select reason from entitlement_change_reasons`))).rejects.toThrow(/permission denied/);
    // Control's history has the reason, by whom.
    expect(await platform((c) => trialHistory(c, A))).toMatchObject([{ kind: 'started', endsOn: day(30), endsOnBefore: null, planId: 'starter', actorName: 'Farid Founder', reason: 'made-up: agreed at the demo' }]);
  });

  it('refuses a second free month, a school that already pays, a last day out of range, no reason, an unknown, retired or test schools’ plan', async () => {
    expect(await start(A)).toEqual({ ok: false, reason: 'trial_used' });
    await platform((c) => recordPayment(c, { userId: FOUNDER }, P, { amountMinor: 1500, paidOn: TODAY, coversUntil: day(60), reference: 'made-up UPI 1' }));
    expect(await start(P)).toEqual({ ok: false, reason: 'billed' });
    for (const endsOn of [TODAY, day(-1), day(91), 'tomorrow', '2026-02-30x']) expect(await start(B, { endsOn }), String(endsOn)).toEqual({ ok: false, reason: 'ends_on' });
    expect(await start(B, { reason: '  a ' })).toEqual({ ok: false, reason: 'reason' });
    expect(await start(B, { planId: 'a-plan-that-does-not-exist' })).toEqual({ ok: false, reason: 'plan' });
    expect(await start(B, { planId: 7 })).toEqual({ ok: false, reason: 'plan' });
    await db.pg.query(`insert into plans (plan_id, name, grace_days, all_working_modules, retired_at, retired_by) values ('made-up-retired', 'Made-up Retired', 5, true, now(), $1)`, [FOUNDER]);
    expect(await start(B, { planId: 'made-up-retired' })).toEqual({ ok: false, reason: 'retired' });
    expect(await start(B, { planId: 'standard' })).toEqual({ ok: false, reason: 'test_only' });
    expect(await start('c2260000-0000-4000-8000-000000000099')).toEqual({ ok: false, reason: 'not_found' });
    expect(await start('not-a-school')).toEqual({ ok: false, reason: 'not_found' });
    // Nothing was started by any of them.
    expect(await rows(`select school_id from school_trials where school_id in ($1, $2) order by 1`, [B, P])).toEqual([]);
  });

  // Each school's last day differs, so that one school's night in a test below does not move another before its turn:
  // M day 20, A day 30, B day 45 (extended to 55), R day 60.
  it('the plan after the free month: the one Control chooses is applied first, as “Change plan” would; day 90 is the furthest', async () => {
    expect(await start(B, { planId: 'growth', endsOn: day(45) })).toMatchObject({ ok: true, endsOn: day(45), planId: 'growth' });
    expect(await rows(`select plan_id from school_subscriptions where school_id = $1`, [B])).toEqual([{ plan_id: 'growth' }]);
    expect((await audits(B, 'entitlement.plan_applied')).map((a: { after_state: { plan: string } }) => a.after_state.plan)).toEqual(['starter', 'growth']);
    expect(await start(M, { endsOn: day(90) })).toMatchObject({ ok: true, endsOn: day(90) });
    // M's last day is brought to day 20 for the midnight test below, as Control cannot (a last day only moves later).
    await db.pg.exec(`set session_replication_role = replica; update school_trials set ends_on = '${day(20)}' where school_id = '${M}'; set session_replication_role = origin;`);
  });

  it('a test school may have one, and its plan after may be the test schools’ plan; a real school never', async () => {
    expect(await start(T)).toMatchObject({ ok: true, planId: 'standard' });
    expect(await start(B, { planId: 'standard' })).toEqual({ ok: false, reason: 'trial_used' });
    await expect(db.pg.query(`update school_subscriptions set plan_id = 'standard' where school_id = $1`, [B])).rejects.toThrow(/test schools only/);
  });
});

describe('the principal’s line, and who reads the free month', () => {
  it('the principal and the school admin read their own; nobody else of the school, and no other school', async () => {
    expect(await start(R, { planId: 'growth', endsOn: day(60) })).toMatchObject({ ok: true });
    const read = (who: Who) => as(who, async (c) => (await c.query(`select school_id, ends_on::text as ends_on from school_trials`)).rows);
    expect(await read({ school: R, role: 'principal', user: PRINCIPAL_R })).toEqual([{ school_id: R, ends_on: day(60) }]);
    expect(await read({ school: R, role: 'school_admin', user: ADMIN_R })).toEqual([{ school_id: R, ends_on: day(60) }]);
    for (const [role, user] of [['teacher', TEACHER_R], ['accountant', ACCOUNTANT_R], ['academic_coordinator', COORD_R], ['parent', TEACHER_R]]) expect(await read({ school: R, role, user }), role).toEqual([]);
    expect(await read({ school: O, role: 'principal', user: PRINCIPAL_O })).toEqual([]);
    // Its audit rows (dates and ids) the same: the office of the school, nobody else.
    const trialAudits = (who: Who) => as(who, async (c) => (await c.query(`select event_action from audit_log where event_action like 'entitlement.trial%'`)).rows.map((x: { event_action: string }) => x.event_action));
    expect(await trialAudits({ school: R, role: 'principal', user: PRINCIPAL_R })).toEqual(['entitlement.trial_started']);
    expect(await trialAudits({ school: R, role: 'school_admin', user: ADMIN_R })).toEqual(['entitlement.trial_started']);
    for (const [role, user] of [['teacher', TEACHER_R], ['accountant', ACCOUNTANT_R], ['academic_coordinator', COORD_R]]) expect(await trialAudits({ school: R, role, user }), role).toEqual([]);
    // The plan applied with it stays visible to every role of the school, as every plan change is (C124).
    // Review of C226: every one of the school's plan-change rows, the free month's included, not just some row.
    const allPlanRows = (await db.pg.query(`select count(*)::int as n from audit_log where school_id = $1 and event_action = 'entitlement.plan_applied'`, [R])).rows[0].n;
    expect(allPlanRows).toBeGreaterThanOrEqual(2);
    expect((await as({ school: R, role: 'teacher', user: TEACHER_R }, async (c) => (await c.query(`select count(*)::int as n from audit_log where event_action = 'entitlement.plan_applied'`)).rows[0].n))).toBe(allPlanRows);
    // The plan's name: for the office of the school, while the free month is in force; nothing for anyone else.
    const name = (who: Who, school: string) => as(who, async (c) => (await c.query(`select school_trial_plan_name($1::uuid) as name`, [school])).rows[0].name);
    expect(await name({ school: R, role: 'principal', user: PRINCIPAL_R }, R)).toBe('Growth');
    expect(await name({ school: R, role: 'teacher', user: TEACHER_R }, R)).toBeNull();
    expect(await name({ school: O, role: 'principal', user: PRINCIPAL_O }, R)).toBeNull();
    expect(await name({ school: O, role: 'principal', user: PRINCIPAL_O }, O)).toBeNull(); // no free month
    // The school's session never writes it, whatever its role.
    const principalR = { school: R, role: 'principal', user: PRINCIPAL_R };
    await expect(as(principalR, (c) => c.query(`update school_trials set ends_on = ends_on + 30 where school_id = $1`, [R]))).rejects.toThrow(/permission denied/);
    await expect(as(principalR, (c) => c.query(`insert into school_trials (school_id, starts_on, ends_on, started_by) values ($1, $2, $3, $4)`, [O, TODAY, day(30), PRINCIPAL_R]))).rejects.toThrow(/permission denied/);
    await expect(as(principalR, (c) => c.query(`delete from school_trials where school_id = $1`, [R]))).rejects.toThrow(/permission denied/);
    // No other database role reads it or calls the functions.
    for (const role of ['anon', 'authenticated']) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tryAs = (sql: string) => db.pg.transaction(async (tx: any) => {
        await tx.query(`set local role ${role}`);
        await tx.query(`select set_config('app.current_tenant_id', $1, true)`, [R]); // even claiming the school
        return tx.query(sql);
      });
      await expect(tryAs(`select * from school_trials`), role).rejects.toThrow(/permission denied/);
      await expect(tryAs(`select school_trial_plan_name('${R}')`), role).rejects.toThrow(/permission denied/);
    }
  });

  it('days left, then from 7 days before the end the notice, then the last day; for the office only, never an amount', async () => {
    const notice = (today: string, role = 'principal', user = PRINCIPAL_R) => as({ school: R, role, user }, (c) => schoolTrialNotice(c, R, role, today));
    // R's last day is day 60.
    expect(await notice(TODAY)).toEqual({ kind: 'days_left', daysLeft: 60, endsOn: day(60), planName: 'Growth' });
    expect(await notice(day(52))).toMatchObject({ kind: 'days_left', daysLeft: 8 });
    expect(await notice(day(53))).toMatchObject({ kind: 'ending', daysLeft: 7 });
    expect(await notice(day(59))).toMatchObject({ kind: 'ending', daysLeft: 1 });
    expect(await notice(day(60))).toMatchObject({ kind: 'last_day', daysLeft: 0 });
    expect(await notice(day(61))).toMatchObject({ kind: 'ended', daysLeft: -1 });
    expect(await notice(day(53), 'school_admin', ADMIN_R)).toMatchObject({ kind: 'ending' });
    for (const [role, user] of [['teacher', TEACHER_R], ['accountant', ACCOUNTANT_R], ['academic_coordinator', COORD_R]]) expect(await notice(day(53), role, user), role).toBeNull();
    // A school with no free month reads nothing.
    expect(await as({ school: O, role: 'principal', user: PRINCIPAL_O }, (c) => schoolTrialNotice(c, O, 'principal', TODAY))).toBeNull();

    const text = (n: TrialNotice, lang: 'en' | 'hi' = 'en') => trialNoticeText(lang, n);
    const last = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${day(30)}T00:00:00Z`));
    const next = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${day(31)}T00:00:00Z`));
    expect(text({ kind: 'days_left', daysLeft: 30, endsOn: day(30), planName: 'Growth' })).toBe(`Free month: 30 days left, to the end of ${last}.`);
    expect(text({ kind: 'ending', daysLeft: 1, endsOn: day(30), planName: 'Growth' })).toBe(`Your free month ends with ${last}: 1 day left. From ${next} the school is on the Growth plan, and modules that plan does not include switch off. To talk about your plan, raise a ticket.`);
    expect(text({ kind: 'last_day', daysLeft: 0, endsOn: day(30), planName: null })).toMatch(/^Today is the last day of your free month\. From .* the school is on the plan it chose,/);
    expect(text({ kind: 'ended', daysLeft: -1, endsOn: day(30), planName: 'Growth' })).toBe(`Your free month ended with ${last}. The school is being moved to the Growth plan.`);
    const hindi = text({ kind: 'ending', daysLeft: 7, endsOn: day(30), planName: 'Growth' }, 'hi');
    expect(hindi).toMatch(/[ऀ-ॿ]/);
    expect(hindi).toContain('Growth प्लान');
    for (const kind of ['days_left', 'ending', 'last_day', 'ended'] as const) expect(text({ kind, daysLeft: 3, endsOn: day(30), planName: 'Growth' })).not.toMatch(/₹|rupee|pay online/i);
  });
});

describe('the nightly move to the school’s plan', () => {
  it('India’s midnight: at 18:29:59 UTC of the last day the school is still in its free month; at 18:30 UTC the next day has begun and it moves', async () => {
    await nightlyAt(new Date(`${day(20)}T18:29:59Z`));
    expect(await trialRow(M)).toMatchObject({ ended: false });
    await nightlyAt(new Date(`${day(20)}T18:30:00Z`));
    expect(await trialRow(M)).toMatchObject({ ended: true, ended_plan_id: 'starter' });
    expect((await audits(M, 'entitlement.trial_ended'))[0].after_state.checked_for).toBe(day(21));
    // Nobody else's last day had passed.
    expect(await rows(`select school_id from school_trials where ended_at is not null`)).toEqual([{ school_id: M }]);
  });

  it('day 30 is the last day: nothing moves on it; on day 31 the school is on Starter, once, audited; a second or a late run moves nothing', async () => {
    const plansApplied = async () => (await audits(A, 'entitlement.plan_applied')).length;
    const appliedBefore = await plansApplied();
    await nightly(day(30));
    expect(await trialRow(A)).toMatchObject({ ended: false });
    expect(await onModules(A)).toEqual(working());

    await nightly(day(31));
    expect(await trialRow(A)).toEqual({ starts_on: TODAY, ends_on: day(30), ended: true, ended_plan_id: 'starter' });
    const starter = (await platform((c) => loadPlan(c, 'starter')))!;
    expect(await onModules(A)).toEqual([...new Set([...starter.moduleIds, ...ALWAYS_ON_MODULES])].sort());
    const sw = await switches(A);
    expect(Object.values(sw).every((v) => String(v).endsWith(':plan'))).toBe(true);
    expect(sw['early-warning']).toBe('off:plan');
    // Features are the plan's again, as the school's own session asks.
    expect(await featuresFor(A)).toEqual(Object.fromEntries(PLAN_FEATURES.map((f) => [f, starter.features.includes(f)])));
    // Audited by nobody, the nightly job, with the day it checked; the plan applied by the same night.
    const ended = await audits(A, 'entitlement.trial_ended');
    expect(ended).toHaveLength(1);
    expect(ended[0].actor_user_id).toBeNull();
    expect(ended[0].before_state).toEqual({ ends_on: day(30) });
    expect(ended[0].after_state).toMatchObject({ ends_on: day(30), plan: 'starter', by: 'billing.nightly', checked_for: day(31) });
    expect(ended[0].after_state.switched_off).toContain('early-warning');
    expect(JSON.stringify(ended[0].after_state)).not.toMatch(/reason/i);
    expect(await rows(`select count(*)::int as n from entitlement_change_reasons where audit_id = $1`, [ended[0].audit_id])).toEqual([{ n: 1 }]);
    expect(await plansApplied()).toBe(appliedBefore + 1);

    // Twice the same night, and days late: moved once.
    await nightly(day(31));
    await nightly(day(33));
    expect(await audits(A, 'entitlement.trial_ended')).toHaveLength(1);
    expect(await plansApplied()).toBe(appliedBefore + 1);
    // The office reads no line any more.
    expect(await as(principalOf(A), (c) => schoolTrialNotice(c, A, 'principal', day(33)))).toBeNull();
  });

  it('an extension: a later day with the founder’s reason and an audit row of dates; the move follows the new day; over once moved', async () => {
    const extend = (school: string, endsOn: unknown, today = TODAY, reason = 'made-up: the trust meets next week') => platform((c) => extendTrial(c, founder, school, { endsOn, reason }, today));
    // B's last day is day 45.
    for (const endsOn of [day(45), day(44), day(91), 'later']) expect(await extend(B, endsOn), String(endsOn)).toEqual({ ok: false, reason: 'ends_on' });
    expect(await extend(B, day(55), TODAY, 'no')).toEqual({ ok: false, reason: 'reason' });
    expect(await extend(N, day(55))).toEqual({ ok: false, reason: 'no_trial' });
    expect(await extend('c2260000-0000-4000-8000-000000000099', day(55))).toEqual({ ok: false, reason: 'not_found' });
    expect(await extend(B, day(55))).toEqual({ ok: true, endsOn: day(55) });
    const [row] = await audits(B, 'entitlement.trial_extended');
    expect([row.actor_user_id, row.before_state, row.after_state]).toEqual([FOUNDER, { ends_on: day(45) }, { ends_on: day(55) }]);
    expect(JSON.stringify(row.after_state)).not.toMatch(/reason|trust/i);
    expect(await rows(`select reason from entitlement_change_reasons where audit_id = $1`, [row.audit_id])).toEqual([{ reason: 'made-up: the trust meets next week' }]);
    // Day 90 after day 0 is the furthest; then put back to day 55 for the nights below.
    expect(await extend(B, day(90))).toEqual({ ok: true, endsOn: day(90) });
    await db.pg.exec(`set session_replication_role = replica; update school_trials set ends_on = '${day(55)}' where school_id = '${B}'; set session_replication_role = origin;`);

    await nightly(day(46)); // the old last day has passed: not moved
    expect(await trialRow(B)).toMatchObject({ ended: false });
    await nightly(day(55));
    expect(await trialRow(B)).toMatchObject({ ended: false });
    await nightly(day(56));
    expect(await trialRow(B)).toMatchObject({ ended: true, ended_plan_id: 'growth' });
    expect(await onModules(B)).toContain('exams'); // Growth's
    expect(await onModules(B)).not.toContain('early-warning'); // not Growth's
    expect(await extend(B, day(60), day(56))).toEqual({ ok: false, reason: 'trial_over' });

    // On day 31, before the job has run, the free month can still be extended; the move then waits for the new day.
    expect(await start(C)).toMatchObject({ ok: true, endsOn: day(30) });
    expect(await extend(C, day(35), day(31))).toEqual({ ok: true, endsOn: day(35) });
    await nightly(day(31));
    expect(await trialRow(C)).toMatchObject({ ended: false });
    await nightly(day(36));
    expect(await trialRow(C)).toMatchObject({ ended: true });
    expect((await platform((c) => trialHistory(c, C))).map((e) => e.kind)).toEqual(['ended', 'extended', 'started']);
  });

  it('a school with no free month is left as it was: its switches, its features and no line', async () => {
    const before = await switches(N);
    await nightly(day(31));
    expect(await switches(N)).toEqual(before);
    expect(await trialRow(N)).toBeNull();
    expect(await as(principalOf(N), (c) => planHasFeature(c, N, 'staff-leave'))).toBe(false);
    expect(await as(principalOf(N), (c) => schoolTrialNotice(c, N, 'principal', TODAY))).toBeNull();
  });

  it('a test school moves to its own plan, the test schools’ plan', async () => {
    await nightly(day(31));
    expect(await trialRow(T)).toMatchObject({ ended: true, ended_plan_id: 'standard' });
    expect(await onModules(T)).toEqual([...new Set([...working(), ...ALWAYS_ON_MODULES])].sort()); // 'standard' gives every working module
  });

  it('the founder’s hand switch stands through it; a complimentary term in force is on after it', async () => {
    await platform((c) => changeModuleEntitlement(c, { schoolId: F, moduleId: 'attendance', enabled: false, reason: 'made-up: the school asked' }, founder));
    expect((await platform((c) => addTerm(c, { userId: FOUNDER }, F, { kind: 'complimentary', moduleId: 'early-warning', startsOn: TODAY, endsOn: day(40), reason: 'made-up: a pilot of early warning' }))).ok).toBe(true);
    expect((await switches(F))['early-warning']).toBe('on:complimentary');
    expect(await start(F)).toMatchObject({ ok: true });
    expect(await switches(F)).toMatchObject({ attendance: 'off:founder_override', 'early-warning': 'on:trial', 'parent-ai': 'on:trial' });
    await nightly(day(31));
    expect(await switches(F)).toMatchObject({ attendance: 'off:founder_override', 'early-warning': 'on:complimentary', 'parent-ai': 'off:plan' });
    const [ended] = await audits(F, 'entitlement.trial_ended');
    expect(ended.after_state.switched_off).toContain('parent-ai');
    expect(ended.after_state.switched_off).not.toContain('early-warning');
  });

  it('a module that starts working during the free month is switched on that night, audited', async () => {
    expect(await start(Q)).toMatchObject({ ok: true });
    // As if the module had just started working: the school has no switch for it yet.
    await db.pg.exec(`set session_replication_role = replica; delete from school_module_entitlements where school_id = '${Q}' and module_id = 'pulse'; set session_replication_role = origin;`);
    await nightly(day(1));
    expect((await switches(Q)).pulse).toBe('on:trial');
    expect((await audits(Q, 'entitlement.module_changed')).filter((a: { after_state: { source: string } }) => a.after_state.source === 'trial')).toHaveLength(1);
    await nightly(day(1));
    expect((await audits(Q, 'entitlement.module_changed')).filter((a: { after_state: { source: string } }) => a.after_state.source === 'trial')).toHaveLength(1);
  });

  it('the payment check leaves a school alone in its free month and resumes the night it is moved', async () => {
    // A payment recorded during the free month that covers only days already past.
    const paid = await platform((c) => recordPayment(c, { userId: FOUNDER }, Q, { amountMinor: 1500, paidOn: TODAY, coversUntil: day(-20), reference: 'made-up UPI 2' }));
    expect(paid).toMatchObject({ ok: true, paidUntil: day(-20), accessMode: 'full' });
    await nightly(day(2));
    expect(await rows(`select access_mode from school_entitlements where school_id = $1`, [Q])).toEqual([{ access_mode: 'full' }]);
    await nightly(day(31));
    expect(await trialRow(Q)).toMatchObject({ ended: true });
    // Paid until day -20 with Starter's 15 days of grace: read-only from the night it is moved.
    expect(await rows(`select access_mode from school_entitlements where school_id = $1`, [Q])).toEqual([{ access_mode: 'read_only' }]);
  });
});

describe('Control’s list, and the database’s own rules', () => {
  it('lists schools by the free month’s last day, soonest first, then those that have ended', async () => {
    const listed = await platform((c) => listTrials(c, TODAY));
    const inForce = listed.filter((x) => x.inForce);
    expect(inForce.map((x) => x.endsOn)).toEqual([...inForce.map((x) => x.endsOn)].sort());
    expect(inForce.map((x) => x.schoolId)).toContain(R);
    expect(listed.findIndex((x) => !x.inForce)).toBeGreaterThan(listed.findIndex((x) => x.inForce));
    expect(listed.find((x) => x.schoolId === B)).toMatchObject({ inForce: false, endsOn: day(55), planId: 'growth', planName: 'Growth', extensions: 2 });
    expect(listed.find((x) => x.schoolId === R)).toMatchObject({ inForce: true, daysLeft: 60, planName: 'Growth', isTest: false, startedBy: 'Farid Founder' });
    // The school's own session cannot read Control's list (no plan, no founder's name).
    await expect(as({ school: R, role: 'principal', user: PRINCIPAL_R }, (c) => listTrials(c, TODAY))).rejects.toThrow(/permission denied/);
  });

  it('tried directly as the platform role: never removed, the start day is today, the last day only later and within 90 days, an ended one never changes', async () => {
    const tryIt = (sql: string, params: unknown[] = []) => platform((c) => c.query(sql, params));
    // The platform role holds no DELETE; even the owner, who does, is refused by the trigger.
    await expect(tryIt(`delete from school_trials where school_id = $1`, [R])).rejects.toThrow(/permission denied/);
    await expect(db.pg.query(`delete from school_trials where school_id = $1`, [R])).rejects.toThrow(/never removed/);
    await expect(tryIt(`update school_trials set ends_on = ends_on - 1 where school_id = $1`, [R])).rejects.toThrow(/only moves later/);
    await expect(tryIt(`update school_trials set starts_on = starts_on - 1 where school_id = $1`, [R])).rejects.toThrow(/only the last day/);
    await expect(tryIt(`insert into school_trials (school_id, starts_on, ends_on, started_by) values ($1, $2, $3, $4)`, [O, day(-1), day(29), FOUNDER])).rejects.toThrow(/starts on the day it is started/);
    await expect(tryIt(`insert into school_trials (school_id, starts_on, ends_on, started_by) values ($1, $2, $3, $4)`, [O, TODAY, day(91), FOUNDER])).rejects.toThrow(/check constraint/);
    await expect(tryIt(`insert into school_trials (school_id, starts_on, ends_on, started_by) values ($1, $2, $3, $4)`, [O, TODAY, TODAY, FOUNDER])).rejects.toThrow(/check constraint/);
    await expect(tryIt(`insert into school_trials (school_id, starts_on, ends_on, started_by, ended_at, ended_plan_id) values ($1, $2, $3, $4, now(), 'starter')`, [O, TODAY, day(30), FOUNDER])).rejects.toThrow(/has not ended/);
    await expect(tryIt(`insert into school_trials (school_id, starts_on, ends_on, started_by) values ($1, $2, $3, $4)`, [R, TODAY, day(30), FOUNDER])).rejects.toThrow(/duplicate key|unique/);
    await expect(tryIt(`update school_trials set ends_on = ends_on + 5 where school_id = $1`, [A])).rejects.toThrow(/has ended is never changed/);
    await expect(tryIt(`update school_trials set ended_at = now() where school_id = $1`, [R])).rejects.toThrow(/check constraint/); // the plan with it
    expect(await trialRow(O)).toBeNull();
  });

  it('the clock queues the night’s job while a free month is in force, and only then', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queued = (inForce: boolean) => db.pg.transaction(async (tx: any) => {
      await tx.query(`set local session_replication_role = replica`);
      await tx.query(`update school_subscriptions set paid_until = null, billing_access = null, billing_grace_ends_at = null, billing_access_since = null`);
      await tx.query(`delete from school_billing_terms`);
      await tx.query(`update school_module_entitlements set source = 'plan' where source = 'complimentary'`);
      if (!inForce) await tx.query(`update school_trials set ended_at = coalesce(ended_at, now()), ended_plan_id = coalesce(ended_plan_id, 'starter')`);
      await tx.query(`delete from jobs where type = 'billing.nightly'`);
      await tx.query(`select billing_nightly_enqueue()`);
      const n = (await tx.query(`select count(*)::int as n from jobs where type = 'billing.nightly'`)).rows[0].n;
      await tx.rollback();
      return n;
    });
    expect(await queued(true)).toBe(1);
    expect(await queued(false)).toBe(0);
  });
});
