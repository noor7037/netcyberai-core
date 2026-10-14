import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { BillingSchools } from '@/components/control/BillingSchools';
import { SchoolEntitlementsPanel, type EntitlementsApi, type EntitlementsData } from '@/components/control/SchoolEntitlementsPanel';
import { ControlDashboardView } from '@/components/dashboards/ControlDashboardView';
import { controlDashboardFixture } from '@/demo-fixture/visual-foundation';
import { billingOverview, createPlan, recordPayment, type BillingOverview } from '@/lib/control/billing';
import { BILLING_NIGHTLY_JOB, billingNightlyHandler, runBillingCheckForSchool } from '@/lib/control/billing-nightly';
import { accessNoticeText, dayInWords, schoolAccessNotice } from '@/lib/control/billing-notice';
import { lastGraceDay } from '@/lib/control/grace-day';
import { changeSchoolAccess, checkModuleAccess, loadEntitlements } from '@/lib/frameworks/entitlements';
import { applyPlan } from '@/lib/frameworks/plans';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';
import { indiaDate } from '@/lib/time/india';

// Control → Billing & Plans (docs/26 slice 8e, C204): what a payment does to a school's access, and what it leaves
// alone. Each case here is one a second pair of eyes found wrong after the slice was built:
//
//   1. a correction that moves no date must change nothing about access, nor restart "read-only since";
//   2. a grace period set by hand must end when the payment brings the school up to date;
//   3. the last day of grace is the same day on every screen;
//   4. full access set by hand after the check acted switches the check off for that school: Control says so;
//   5. the check runs at ten past midnight in India, when the UTC date is still yesterday's.
//
// On every migration, as the app's own database roles. Every school, person, plan, amount and reference is made up.

const ROOT = path.resolve(__dirname, '../..');
const s = (n: number) => `bf000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const SCHOOLS = Array.from({ length: 16 }, (_, i) => s(i + 1));
const [H, I, J, K, L, M, N, O, P, Q, R, S, U, V, W, X] = SCHOOLS;
const FOUNDER = s(90);
const STAFF = s(91);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asPrincipal = <R>(school: string, fn: (client: any) => Promise<R>): Promise<R> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', school], ['app.current_role', 'principal'], ['app.current_user_id', STAFF]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
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

// India's date today, and days counted from it.
const TODAY = indiaDate();
const day = (n: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const midnightStarting = (d: string) => new Date(`${d}T00:00:00+05:30`).toISOString();
const endOf = (d: string) => `${d}T23:59:59+05:30`;
const job = (payload: Record<string, unknown> = {}) => ({ jobId: 'j', type: BILLING_NIGHTLY_JOB, payload, attempts: 1, maxAttempts: 8, schoolId: null, idempotencyKey: 'k' });
// The check for one school, as the night of `onDay` would run it.
const check = (school: string, onDay: string) => platform((c) => runBillingCheckForSchool(c, school, onDay));
const stored = async (school: string) =>
  (await rows(`select e.access_mode, e.grace_ends_at, s.paid_until::text as paid_until, s.billing_access, s.billing_grace_ends_at, s.billing_access_since::text as since from school_subscriptions s left join school_entitlements e on e.school_id = s.school_id where s.school_id = $1`, [school]))[0];
const accessAudits = async (school: string) =>
  rows(`select a.actor_user_id, a.before_state ->> 'access_mode' as was, a.after_state ->> 'access_mode' as now, a.after_state ->> 'by' as by, r.reason from audit_log a left join entitlement_change_reasons r on r.audit_id = a.audit_id where a.school_id = $1 and a.event_action = 'entitlement.access_changed' order by a.audit_id`, [school]);
const inControl = async (school: string) => (await platform((c) => billingOverview(c))).schools.find((x) => x.schoolId === school)!;
const notice = (school: string) => asPrincipal(school, async (c) => schoolAccessNotice(c, await loadEntitlements(c, school)));
const canChange = async (school: string) => (await asPrincipal(school, (c) => checkModuleAccess(c, { schoolId: school, role: 'principal' }, 'students', { write: true }))).ok;
const setAccess = (school: string, accessMode: 'full' | 'grace' | 'read_only' | 'suspended', reason: string, graceEndsAt?: string) => platform((c) => changeSchoolAccess(c, { schoolId: school, accessMode, graceEndsAt, reason }, founder));
// A payment recorded on a day in the past, when it still covered the school: the check has nothing to do at that moment.
const paidInThePast = async (school: string, recordedOn: string, coversUntil: string, reference: string) => {
  const r = await platform((c) => recordPayment(c, by, school, { amountMinor: 40_000_00, paidOn: recordedOn, coversUntil, reference }, recordedOn));
  if (!r.ok) throw new Error(r.reason);
  return r.paymentId;
};
const pay = (school: string, coversUntil: string | null, over: Record<string, unknown> = {}) => platform((c) => recordPayment(c, by, school, { amountMinor: 40_000_00, paidOn: TODAY, coversUntil, reference: 'bank made-up 7', ...over }));

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values ${SCHOOLS.map((id, i) => `('${id}', 'Made-up School ${i + 1}', 'IN-HR', false)`).join(', ')};
    insert into users (user_id, school_id, email, role, display_name) values ('${FOUNDER}', null, 'founder@netcyber.example', 'super_admin', 'Farid Founder');
  `);
  const made = await platform((c) => createPlan(c, by, { planId: 'five-days', name: 'Five Days Made-up', priceMinor: null, period: null, graceDays: 5, allWorkingModules: true, moduleIds: [], limits: {} }));
  if (!made.ok) throw new Error(made.reason);
  for (const school of SCHOOLS) await platform((c) => applyPlan(c, school, 'five-days', founder, 'the plan with five days of grace'));
}, 120_000);
afterAll(async () => db?.stop());

describe('a correction that moves no date changes nothing about access', () => {
  it('full access the founder gave by hand stays: the school is not locked by a retyped reference', async () => {
    // H: two past payments, paid until 20 days ago. Five days of grace are long over: the check makes it read-only.
    const first = await paidInThePast(H, day(-80), day(-50), 'cheque made-up 0041');
    await paidInThePast(H, day(-50), day(-20), 'cheque made-up 0042');
    expect(await check(H, TODAY)).toMatchObject({ from: 'full', to: 'read_only' });
    // The founder gives full access back by hand. The next night leaves that alone.
    expect(await setAccess(H, 'full', 'the cheque is on its way')).toEqual({ ok: true });
    expect(await check(H, day(1))).toBeNull();
    const before = [await stored(H), await accessAudits(H)];
    expect(before[0]).toMatchObject({ access_mode: 'full', paid_until: day(-20), billing_access: 'read_only', since: TODAY });

    // The FIRST, older entry is corrected: same amount, same days, the reference retyped. No date moves.
    const fixed = await platform((c) => recordPayment(c, by, H, { amountMinor: 40_000_00, paidOn: day(-80), coversUntil: day(-50), reference: 'cheque made-up 0014', note: 'two digits of the reference were swapped', correctsPaymentId: first }));
    expect(fixed).toMatchObject({ ok: true, paidUntil: day(-20), accessMode: 'full' });
    expect([await stored(H), await accessAudits(H)]).toEqual(before);
    expect(await canChange(H)).toBe(true);
    expect(await notice(H)).toBeNull();
    // The correction itself is on record, with the day unmoved.
    expect(await rows(`select actor_user_id, before_state ->> 'paid_until' as was, after_state ->> 'paid_until' as now from audit_log where school_id = $1 and event_action = 'billing.payment_corrected'`, [H])).toEqual([{ actor_user_id: FOUNDER, was: day(-20), now: day(-20) }]);
    // And the founder's choice still stands the night after.
    expect(await check(H, day(2))).toBeNull();
    expect([await stored(H), await accessAudits(H)]).toEqual(before);
  });

  it('a school the check made read-only keeps the day it is told it has been read-only since', async () => {
    // I: read-only by the check since 14 days ago.
    const first = await paidInThePast(I, day(-80), day(-50), 'cheque made-up 0051');
    await paidInThePast(I, day(-50), day(-20), 'cheque made-up 0052');
    expect(await check(I, day(-14))).toMatchObject({ to: 'read_only', since: day(-14) });
    const before = [await stored(I), await accessAudits(I), await notice(I)];
    expect(before[2]).toEqual({ kind: 'read_only', paidUntil: day(-20), since: day(-14) });

    const fixed = await platform((c) => recordPayment(c, by, I, { amountMinor: 40_000_00, paidOn: day(-80), coversUntil: day(-50), reference: 'cheque made-up 0015', note: 'two digits of the reference were swapped', correctsPaymentId: first }));
    expect(fixed).toMatchObject({ ok: true, paidUntil: day(-20), accessMode: 'read_only' });
    // Nothing about access was written: not full and back, and no new "since".
    expect([await stored(I), await accessAudits(I), await notice(I)]).toEqual(before);
    expect(before[1]).toHaveLength(1);
    expect(accessNoticeText('en', (await notice(I))!)).toContain(`Read-only since ${dayInWords('en', day(-14))}`);
    expect(await inControl(I)).toMatchObject({ state: 'read_only', byBilling: true });
  });
});

describe('a correction that does move the day', () => {
  it('still read-only: the "since" day is kept and no access change is written; the school is told the new paid-until day', async () => {
    await paidInThePast(J, day(-80), day(-50), 'cheque made-up 0061');
    const latest = await paidInThePast(J, day(-50), day(-20), 'cheque made-up 0062');
    expect(await check(J, day(-14))).toMatchObject({ to: 'read_only', since: day(-14) });
    const before = [await stored(J), await accessAudits(J)];

    // The latest entry covered two days too many.
    const fixed = await platform((c) => recordPayment(c, by, J, { amountMinor: 40_000_00, paidOn: day(-50), coversUntil: day(-22), reference: 'cheque made-up 0062', note: 'two days too far', correctsPaymentId: latest }));
    expect(fixed).toMatchObject({ ok: true, paidUntil: day(-22), accessMode: 'read_only' });
    expect(await stored(J)).toEqual({ ...before[0], paid_until: day(-22) });
    expect(await accessAudits(J)).toEqual(before[1]);
    expect(await notice(J)).toEqual({ kind: 'read_only', paidUntil: day(-22), since: day(-14) });
    // It is still the check's own work: a payment that covers the school opens it.
    expect(await inControl(J)).toMatchObject({ state: 'read_only', byBilling: true });
    expect(await pay(J, day(200))).toMatchObject({ ok: true, accessMode: 'full' });
    expect(await stored(J)).toMatchObject({ access_mode: 'full', grace_ends_at: null, billing_access: null, since: null });
  });

  it('a lock that happens when the entry is recorded is the entry’s doing: audited with the person, not as the nightly check by nobody', async () => {
    // K: paid until 3 days ago, in grace by the check since 2 days ago.
    const only = await paidInThePast(K, day(-60), day(-3), 'cheque made-up 0071');
    expect(await check(K, day(-2))).toMatchObject({ from: 'full', to: 'grace', since: day(-2) });
    // The month was typed wrongly: it covered until 30 days ago. The five days of grace are over.
    const fixed = await platform((c) => recordPayment(c, by, K, { amountMinor: 40_000_00, paidOn: day(-60), coversUntil: day(-30), reference: 'cheque made-up 0071', note: 'the month was typed wrongly', correctsPaymentId: only }));
    expect(fixed).toMatchObject({ ok: true, paidUntil: day(-30), accessMode: 'read_only' });
    const now = await stored(K);
    expect(now).toMatchObject({ access_mode: 'read_only', paid_until: day(-30), billing_access: 'read_only', since: TODAY });
    expect(new Date(now.grace_ends_at).toISOString()).toBe(midnightStarting(day(-24)));
    expect(await accessAudits(K)).toEqual([
      { actor_user_id: null, was: 'full', now: 'grace', by: 'billing.nightly', reason: `Billing check: paid until ${day(-3)}; the plan gives 5 days of grace. In grace until the end of ${day(2)}.` },
      { actor_user_id: FOUNDER, was: 'grace', now: 'read_only', by: 'billing.payment', reason: `Payment corrected: paid until ${day(-30)}; the plan gives 5 days of grace, which ended with ${day(-25)}. Read-only from ${TODAY}.` },
    ]);
    expect(await canChange(K)).toBe(false);
    // It is the check's own state from here: the next night changes nothing, and a payment opens it.
    expect(await check(K, day(1))).toBeNull();
    expect(await inControl(K)).toMatchObject({ state: 'read_only', byBilling: true });
  });

  it('still in grace, with a later last day: one audited change by the person, and the check carries on from it', async () => {
    await paidInThePast(L, day(-60), day(-3), 'cheque made-up 0081');
    expect(await check(L, day(-2))).toMatchObject({ to: 'grace', since: day(-2) });
    // A part payment covering two more days: paid until yesterday, so grace runs to the end of day 4.
    expect(await pay(L, day(-1))).toMatchObject({ ok: true, paidUntil: day(-1), accessMode: 'grace' });
    const now = await stored(L);
    expect(now).toMatchObject({ access_mode: 'grace', paid_until: day(-1), billing_access: 'grace', since: day(-2) });
    expect(new Date(now.grace_ends_at).toISOString()).toBe(midnightStarting(day(5)));
    expect((await accessAudits(L)).slice(1)).toEqual([{ actor_user_id: FOUNDER, was: 'grace', now: 'grace', by: 'billing.payment', reason: `Payment recorded: paid until ${day(-1)}; the plan gives 5 days of grace. In grace until the end of ${day(4)}.` }]);
    expect(await inControl(L)).toMatchObject({ state: 'grace', byBilling: true });
    expect(await notice(L)).toEqual({ kind: 'grace', paidUntil: day(-1), worksUntil: day(4) });
    expect(await check(L, day(4))).toBeNull();
    expect(await check(L, day(5))).toMatchObject({ from: 'grace', to: 'read_only', since: day(5) });
  });

  it('full access by hand, then a part payment: the check starts again for the new day, and that step is the payment’s', async () => {
    await paidInThePast(M, day(-60), day(-30), 'cheque made-up 0091');
    expect(await check(M, TODAY)).toMatchObject({ to: 'read_only' });
    await setAccess(M, 'full', 'the cheque is on its way');
    expect(await pay(M, day(-2))).toMatchObject({ ok: true, paidUntil: day(-2), accessMode: 'grace' });
    expect(await stored(M)).toMatchObject({ access_mode: 'grace', billing_access: 'grace', since: TODAY });
    expect((await accessAudits(M)).at(-1)).toMatchObject({ actor_user_id: FOUNDER, was: 'full', now: 'grace', by: 'billing.payment' });
  });
});

describe('a grace period set by hand ends when a payment brings the school up to date', () => {
  it('the hand-set grace had already run out, so the school read as read-only: the payment opens it', async () => {
    // N: past its paid-until day. The founder set grace by hand, to the end of yesterday.
    await paidInThePast(N, day(-60), day(-10), 'cheque made-up 0101');
    await setAccess(N, 'grace', 'payment late', endOf(day(-1)));
    expect((await asPrincipal(N, (c) => loadEntitlements(c, N))).accessMode).toBe('read_only');
    expect(await canChange(N)).toBe(false);

    expect(await pay(N, day(300))).toMatchObject({ ok: true, paidUntil: day(300), accessMode: 'full', handGraceEnded: true });
    expect(await stored(N)).toMatchObject({ access_mode: 'full', grace_ends_at: null, paid_until: day(300), billing_access: null });
    expect(await canChange(N)).toBe(true);
    expect(await notice(N)).toBeNull();
    expect((await accessAudits(N)).at(-1)).toEqual({ actor_user_id: FOUNDER, was: 'grace', now: 'full', by: 'billing.payment', reason: `Payment recorded: paid until ${day(300)}. The grace period set by hand, to the end of ${day(-1)}, is over.` });
  });

  it('the hand-set grace was still running: it does not stay behind to lock a paid school on the old day', async () => {
    await paidInThePast(O, day(-60), day(-10), 'cheque made-up 0111');
    await setAccess(O, 'grace', 'payment late', endOf(day(3)));
    expect(await pay(O, day(300))).toMatchObject({ ok: true, paidUntil: day(300), accessMode: 'full', handGraceEnded: true });
    // Nothing is left that could turn the school read-only on day 4.
    expect(await stored(O)).toMatchObject({ access_mode: 'full', grace_ends_at: null, paid_until: day(300), billing_access: null });
    expect(await check(O, day(4))).toBeNull();
    expect(await inControl(O)).toMatchObject({ state: 'paid', accessMode: 'full', graceEndsAt: null });
  });

  it('a school never billed before, put in grace by hand: its first payment opens it', async () => {
    await setAccess(P, 'grace', 'payment late', endOf(day(2)));
    expect(await stored(P)).toMatchObject({ access_mode: 'grace', paid_until: null });
    expect(await pay(P, day(365))).toMatchObject({ ok: true, paidUntil: day(365), accessMode: 'full', handGraceEnded: true });
    expect(await stored(P)).toMatchObject({ access_mode: 'full', grace_ends_at: null });
  });

  it('a part payment that still leaves the school behind leaves the founder’s day alone', async () => {
    await paidInThePast(Q, day(-60), day(-10), 'cheque made-up 0121');
    await setAccess(Q, 'grace', 'agreed a later day with the school', endOf(day(20)));
    const before = await stored(Q);
    expect(await pay(Q, day(-2))).toMatchObject({ ok: true, paidUntil: day(-2), accessMode: 'grace', handGraceEnded: false });
    expect(await stored(Q)).toEqual({ ...before, paid_until: day(-2) });
    expect((await accessAudits(Q)).map((a: { by: string | null }) => a.by)).toEqual([null]); // the founder's own change, nothing since
  });

  it('a school that was already paid up keeps a grace period set for another reason; paused and read-only by hand stay too', async () => {
    await paidInThePast(R, day(-60), day(100), 'cheque made-up 0131');
    await setAccess(R, 'grace', 'a records move, not the bill', endOf(day(20)));
    const before = await stored(R);
    expect(await pay(R, day(465))).toMatchObject({ ok: true, paidUntil: day(465), accessMode: 'grace', handGraceEnded: false });
    expect(await stored(R)).toEqual({ ...before, paid_until: day(465) });

    await paidInThePast(W, day(-60), day(-10), 'cheque made-up 0141');
    await setAccess(W, 'suspended', 'a dispute, not the bill');
    expect(await pay(W, day(300))).toMatchObject({ ok: true, accessMode: 'suspended', handGraceEnded: false });
    await paidInThePast(X, day(-60), day(-10), 'cheque made-up 0151');
    await setAccess(X, 'read_only', 'records under review, not the bill');
    expect(await pay(X, day(300))).toMatchObject({ ok: true, accessMode: 'read_only', handGraceEnded: false });
    expect([(await stored(W)).access_mode, (await stored(X)).access_mode]).toEqual(['suspended', 'read_only']);
  });

  it('the Billing screen says so when it happens, in both languages', () => {
    const view = readFileSync(path.join(ROOT, 'src/components/control/BillingSchools.tsx'), 'utf8');
    expect(view).toMatch(/handGraceEnded \? 'billing\.pay\.doneGraceEnded' : 'billing\.pay\.done'/);
    const route = readFileSync(path.join(ROOT, 'src/app/api/control/schools/[schoolId]/subscription/route.ts'), 'utf8');
    expect(route).toMatch(/handGraceEnded: r\.handGraceEnded/);
    const words = en as Record<string, string>;
    expect(words['billing.pay.doneGraceEnded']).toMatch(/payment is recorded.+grace period.+set by hand.+full access/i);
    expect(/[ऀ-ॿ]/.test((hi as Record<string, string>)['billing.pay.doneGraceEnded'] ?? '')).toBe(true);
  });
});

describe('full access set by hand after the check acted: Control says the check is off for that school', () => {
  const card = (overview: BillingOverview, school: string) => {
    const html = renderToStaticMarkup(h(BillingSchools, { data: { ...overview, schools: overview.schools.filter((x) => x.schoolId === school) }, busy: false, send: async () => true }));
    return html;
  };
  const off = (en as Record<string, string>)['billing.access.checkOff'];

  it('also when that full access only ended a pause for another reason', async () => {
    // S: in grace by the check. Paused for a dispute, then given full access to end the pause.
    await paidInThePast(S, day(-60), day(-3), 'cheque made-up 0161');
    expect(await check(S, TODAY)).toMatchObject({ to: 'grace' });
    expect(await inControl(S)).toMatchObject({ state: 'grace', byBilling: true, checkOff: false });
    await setAccess(S, 'suspended', 'a dispute, not the bill');
    expect(await inControl(S)).toMatchObject({ state: 'suspended', checkOff: false });
    await setAccess(S, 'full', 'the dispute is settled');
    // Past its day, on full access, and the check will not act: that is now said, not only shown as "past the paid-until day".
    expect(await check(S, day(30))).toBeNull();
    const overview = await platform((c) => billingOverview(c));
    expect(overview.schools.find((x) => x.schoolId === S)).toMatchObject({ state: 'due', accessMode: 'full', checkOff: true });
    expect(off).toMatch(/nightly check/);
    expect(card(overview, S)).toContain(off);
    expect(/[ऀ-ॿ]/.test((hi as Record<string, string>)['billing.access.checkOff'] ?? '')).toBe(true);
  });

  it('not for a school the check has simply not reached yet; and a payment that moves the day switches the check back on', async () => {
    // U: one day past, no check has run.
    await paidInThePast(U, day(-60), day(-1), 'cheque made-up 0171');
    const overview = await platform((c) => billingOverview(c));
    expect(overview.schools.find((x) => x.schoolId === U)).toMatchObject({ state: 'due', checkOff: false });
    expect(card(overview, U)).not.toContain(off);
    // S pays part: the day moves, the check's memory of the old day is gone, and it acts for the new one.
    expect(await pay(S, day(-2))).toMatchObject({ ok: true, accessMode: 'grace' });
    expect(await inControl(S)).toMatchObject({ state: 'grace', byBilling: true, checkOff: false });
  });
});

describe('the check runs just after midnight in India, when the UTC date is still yesterday’s', () => {
  const nightlyAt = (instant: string, date: string) => billingNightlyHandler({ platform, now: () => new Date(instant) })(job({ date }));

  it('at 23:50 on the paid-until day nothing changes; at 00:10 the next day the school is in grace', async () => {
    // V: paid until yesterday.
    await paidInThePast(V, day(-60), day(-1), 'cheque made-up 0181');
    const before = [await stored(V), await accessAudits(V)];
    await nightlyAt(`${day(-1)}T23:50:00+05:30`, day(-1));
    expect([await stored(V), await accessAudits(V)]).toEqual(before);

    // Ten past midnight in India is 18:40 UTC of the day before: the job the clock queues carries India's date.
    const tenPast = `${TODAY}T00:10:00+05:30`;
    expect(new Date(tenPast).toISOString().slice(0, 10)).toBe(day(-1));
    await nightlyAt(tenPast, TODAY);
    const now = await stored(V);
    expect(now).toMatchObject({ access_mode: 'grace', paid_until: day(-1), billing_access: 'grace', since: TODAY });
    expect(new Date(now.grace_ends_at).toISOString()).toBe(midnightStarting(day(5)));
    expect(await accessAudits(V)).toEqual([{ actor_user_id: null, was: 'full', now: 'grace', by: 'billing.nightly', reason: `Billing check: paid until ${day(-1)}; the plan gives 5 days of grace. In grace until the end of ${day(4)}.` }]);
  });
});

describe('the last day of grace is the same day on every screen', () => {
  const api: EntitlementsApi = { load: async () => panel('2099-10-18T18:30:00.000Z'), change: async () => undefined };
  const panel = (graceEndsAt: string): EntitlementsData => ({ entitlements: { schoolId: 's', plan: 'made-up', accessMode: 'grace', graceEndsAt, modules: {} }, plans: [], history: [] });
  const shown = (graceEndsAt: string) => renderToStaticMarkup(h(SchoolEntitlementsPanel, { api, initial: panel(graceEndsAt) }));

  it('one helper: the check ends grace at midnight, Control at 23:59:59, and both name the same last day', () => {
    expect(lastGraceDay('2026-10-18T18:30:00.000Z')).toBe('2026-10-18'); // 00:00 on the 19th in India: the check's own end
    expect(lastGraceDay('2026-10-18T18:29:59.000Z')).toBe('2026-10-18'); // 23:59:59 on the 18th in India: set by hand
    for (const file of ['src/components/control/BillingSchools.tsx', 'src/components/control/SchoolEntitlementsPanel.tsx', 'src/lib/control/billing-notice.ts']) expect(readFileSync(path.join(ROOT, file), 'utf8'), file).toMatch(/lastGraceDay\(/);
  });

  it('Control → school → Modules & access shows the last day of grace, not the day after', () => {
    expect(shown('2099-10-18T18:30:00.000Z')).toContain('Grace ends 18 Oct 2099');
    expect(shown('2099-10-18T18:29:59.000Z')).toContain('Grace ends 18 Oct 2099');
    expect(shown('2020-01-31T18:30:00.000Z')).toContain('Grace ended 31 Jan 2020');
  });

  it('for a school the check put in grace: Billing, the school’s own line and the school page agree', async () => {
    // V is in grace by the check: paid until yesterday, five days of grace, so the last day is day 4.
    const v = await stored(V);
    const end = new Date(v.grace_ends_at).toISOString();
    expect(lastGraceDay(end)).toBe(day(4));
    expect(await notice(V)).toMatchObject({ kind: 'grace', worksUntil: day(4) });
    const short = (d: string) => new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${d}T00:00:00Z`));
    const overview = await platform((c) => billingOverview(c));
    const billing = renderToStaticMarkup(h(BillingSchools, { data: { ...overview, schools: overview.schools.filter((x) => x.schoolId === V) }, busy: false, send: async () => true }));
    expect(billing).toContain(short(day(4)));
    expect(billing).not.toContain(short(day(5)));
    expect(shown(end)).toContain(`Grace ends ${short(day(4))}`);
  });
});

describe('the Control dashboard’s fees tile counts parents’ fees, a different money from this page', () => {
  it('it does not open Billing & Plans', () => {
    const html = renderToStaticMarkup(h(ControlDashboardView, { data: controlDashboardFixture, schoolsTable: null, now: new Date('2026-10-14T06:00:00Z') }));
    expect(html).toContain('Fees marked paid');
    expect(html).not.toContain('href="/control/billing-plans"');
  });
});
