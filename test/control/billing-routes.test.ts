import { randomUUID } from 'crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The Control billing routes themselves (docs/26 slice 8e, C204), on real Postgres (PGlite) with the billing
// migration applied verbatim: who is let in, what each answers, and that a payment and a plan change reach the
// database as the platform role. Only the connection is replaced: the routes' own transaction helper runs on the
// test database, with the same role and settings. Every school, person, plan and amount is made up.

const h = vi.hoisted(() => ({
  db: null as unknown as import('../db/pglite-harness').TestDb,
  revoked: false,
}));

vi.mock('@/lib/auth/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/auth/db')>();
  return {
    ...real,
    withTenantContext: (claims: never, fn: (db: unknown) => Promise<unknown>) => {
      // What the real helper does when the account was signed out everywhere, deactivated or is no longer staff.
      if (h.revoked) return Promise.reject(new real.SessionRevokedError('super_admin authority revoked'));
      return h.db.tenant(claims, fn as never);
    },
  };
});

import { createTestDb } from '../db/pglite-harness';
import { signAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { GET as overviewRoute, POST as createPlanRoute } from '@/app/api/control/billing/route';
import { POST as planRoute } from '@/app/api/control/billing/plans/[planId]/route';
import { GET as subscriptionRoute, POST as subscriptionPost } from '@/app/api/control/schools/[schoolId]/subscription/route';
import { GET as entitlementsRoute } from '@/app/api/control/schools/[schoolId]/entitlements/route';
import { POST as createSchoolRoute } from '@/app/api/control/schools/route';
import { indiaDate } from '@/lib/time/india';

const FOUNDER = randomUUID();
const PRINCIPAL = randomUUID();
const SCHOOL = randomUUID();
const OTHER = randomUUID();
const TODAY = indiaDate();
const day = (n: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function req(path: string, body?: unknown, cookie?: string): NextRequest {
  return new NextRequest(`https://www.netcyberai.test${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  });
}
async function cookieFor(sub: string, role: string, schoolId: string | null) {
  const token = await signAccessToken({ sub, role: role as never, schoolId, membershipId: schoolId ? randomUUID() : null, tokenVersion: 0, aal: role === 'super_admin' ? 'aal2' : 'aal1', sessionId: randomUUID() });
  return `${ACCESS_COOKIE}=${token}`;
}
const q = async (sql: string, params: unknown[] = []) => (await h.db.platform((db) => db.query(sql, params))).rows;
let founder = '';
let principal = '';
const plan = (over: Record<string, unknown> = {}) => ({ planId: 'made-up-yearly', name: 'Made-up Yearly', priceMonthRupees: '4,500', priceYearRupees: '45,000', graceDays: 10, allWorkingModules: false, moduleIds: ['students', 'attendance'], limits: {}, ...over });
// The plans the C212 migration seeds as data: rows like any other, left out where a test counts its own.
const SEEDS = ['essential', 'growth', 'premium'];
const at = (schoolId: string) => ({ params: { schoolId } });

beforeAll(async () => {
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-billing-route-tests-0123456789';
  h.db = await createTestDb();
  await h.db.platform(async (db) => {
    await db.query(`insert into schools (school_id, name, jurisdiction) values ($1, 'Made-up School', 'IN-HR'), ($2, 'Other Made-up School', 'IN-DL')`, [SCHOOL, OTHER]);
    await db.query(`insert into users (user_id, school_id, role, display_name) values ($1, null, 'super_admin', 'Farid Founder'), ($2, $3, 'principal', 'Priya Principal')`, [FOUNDER, PRINCIPAL, SCHOOL]);
  });
  founder = await cookieFor(FOUNDER, 'super_admin', null);
  principal = await cookieFor(PRINCIPAL, 'principal', SCHOOL);
}, 60000);

describe('who is let in', () => {
  it('nobody without a session, and nobody from a school: every route, read or write', async () => {
    const calls = (cookie?: string) => [
      overviewRoute(req('/api/control/billing', undefined, cookie)),
      createPlanRoute(req('/api/control/billing', plan(), cookie)),
      planRoute(req('/api/control/billing/plans/made-up-yearly', { action: 'retire' }, cookie), { params: { planId: 'made-up-yearly' } }),
      subscriptionRoute(req(`/api/control/schools/${SCHOOL}/subscription`, undefined, cookie), at(SCHOOL)),
      subscriptionPost(req(`/api/control/schools/${SCHOOL}/subscription`, { action: 'payment', amountRupees: '100', paidOn: TODAY, coversUntil: day(30), reference: 'made-up' }, cookie), at(SCHOOL)),
      subscriptionPost(req(`/api/control/schools/${SCHOOL}/subscription`, { action: 'plan', planId: 'made-up-yearly', reason: 'let me in' }, cookie), at(SCHOOL)),
    ];
    expect((await Promise.all(calls())).map((r) => r.status)).toEqual([401, 401, 401, 401, 401, 401]);
    expect((await Promise.all(calls(principal))).map((r) => r.status)).toEqual([403, 403, 403, 403, 403, 403]);
    expect(await q(`select count(*)::int as n from plans`)).toEqual([{ n: 1 + SEEDS.length }]);
    expect(await q(`select count(*)::int as n from subscription_payments`)).toEqual([{ n: 0 }]);
  });

  it('a staff session that was signed out everywhere, or is no longer staff, is refused on the request itself', async () => {
    h.revoked = true;
    try {
      const refused = await Promise.all([
        overviewRoute(req('/api/control/billing', undefined, founder)),
        createPlanRoute(req('/api/control/billing', plan(), founder)),
        subscriptionPost(req(`/api/control/schools/${SCHOOL}/subscription`, { action: 'payment', amountRupees: '100', paidOn: TODAY, coversUntil: day(30), reference: 'made-up' }, founder), at(SCHOOL)),
      ]);
      expect(refused.map((r) => r.status)).toEqual([401, 401, 401]);
      expect(await refused[0].json()).toMatchObject({ error: 'session_revoked' });
    } finally {
      h.revoked = false;
    }
    expect(await q(`select count(*)::int as n from plans`)).toEqual([{ n: 1 + SEEDS.length }]);
  });
});

describe('plans through Control', () => {
  it('a plan is created with a name and a price typed in rupees, and the list is read back from the table', async () => {
    expect((await createPlanRoute(req('/api/control/billing', plan({ priceYearRupees: 'forty-five thousand' }), founder))).status).toBe(400);
    const made = await createPlanRoute(req('/api/control/billing', plan(), founder));
    expect([made.status, await made.json()]).toEqual([201, { ok: true, planId: 'made-up-yearly' }]);
    expect(await q(`select name, price_month_minor, price_year_minor, grace_days, module_ids, created_by from plans where plan_id = 'made-up-yearly'`)).toEqual([{ name: 'Made-up Yearly', price_month_minor: 450000, price_year_minor: 4500000, grace_days: 10, module_ids: ['students', 'attendance'], created_by: FOUNDER }]);
    const again = await createPlanRoute(req('/api/control/billing', plan(), founder));
    expect([again.status, (await again.json()).code]).toEqual([409, 'id_taken']);

    const res = await overviewRoute(req('/api/control/billing', undefined, founder));
    expect(res.headers.get('cache-control')).toBe('no-store');
    const overview = await res.json();
    expect(overview.plans.filter((p: { planId: string }) => !SEEDS.includes(p.planId)).map((p: { planId: string; name: string; priceYearMinor: number | null }) => [p.planId, p.name, p.priceYearMinor])).toEqual([
      ['made-up-yearly', 'Made-up Yearly', 4500000],
      ['standard', (await q(`select name from plans where plan_id = 'standard'`))[0].name, null],
    ]);
    expect(overview.schools.map((s: { schoolName: string; planId: string | null; state: string }) => [s.schoolName, s.planId, s.state])).toEqual([
      ['Made-up School', null, 'not_billed'],
      ['Other Made-up School', null, 'not_billed'],
    ]);
  });

  it('a plan is edited, retired, brought back and made the plan for new schools; what cannot be done is said in a code', async () => {
    const on = (planId: string, body: unknown) => planRoute(req(`/api/control/billing/plans/${planId}`, body, founder), { params: { planId } });
    expect((await on('made-up-yearly', { action: 'rename' })).status).toBe(400);
    expect((await on('made-up-yearly', { action: 'edit', ...plan({ graceDays: 500 }) })).status).toBe(400);
    expect((await on('no-such-plan', { action: 'edit', ...plan() })).status).toBe(404);
    expect((await on('made-up-yearly', { action: 'edit', ...plan({ priceMonthRupees: '', priceYearRupees: '', graceDays: 12 }) })).status).toBe(200);
    expect(await q(`select price_month_minor, price_year_minor, grace_days, updated_by from plans where plan_id = 'made-up-yearly'`)).toEqual([{ price_month_minor: null, price_year_minor: null, grace_days: 12, updated_by: FOUNDER }]);

    const kept = await on('standard', { action: 'retire' });
    expect([kept.status, (await kept.json()).code]).toEqual([400, 'is_default']);
    expect((await on('made-up-yearly', { action: 'retire' })).status).toBe(200);
    const asDefault = await on('made-up-yearly', { action: 'default' });
    expect([asDefault.status, (await asDefault.json()).code]).toEqual([400, 'retired']);
    expect((await on('made-up-yearly', { action: 'restore' })).status).toBe(200);
    expect((await on('made-up-yearly', { action: 'default' })).status).toBe(200);
    expect(await q(`select value from platform_settings where key = 'billing.default_plan'`)).toEqual([{ value: 'made-up-yearly' }]);
  });

  it('a school created in Control starts on the plan the setting names, with that plan’s modules and a subscription row', async () => {
    const res = await createSchoolRoute(req('/api/control/schools', { name: 'Brand New Made-up School', board: 'CBSE', tenantType: 'school', jurisdiction: 'IN-HR' }, founder));
    expect(res.status).toBe(201);
    const id = (await res.json()).school.school_id;
    expect(await q(`select e.plan, s.plan_id, s.paid_until from school_entitlements e join school_subscriptions s on s.school_id = e.school_id where e.school_id = $1`, [id])).toEqual([{ plan: 'made-up-yearly', plan_id: 'made-up-yearly', paid_until: null }]);
    expect((await q(`select module_id from school_module_entitlements where school_id = $1 and enabled order by 1`, [id])).map((r) => r.module_id)).toEqual(['attendance', 'students']);
    // The plans a school's page offers are the table's rows too.
    const offered = (await (await entitlementsRoute(req(`/api/control/schools/${id}/entitlements`, undefined, founder), at(id))).json()).plans;
    expect(offered.filter((p: { planId: string }) => !SEEDS.includes(p.planId)).map((p: { planId: string; label: string; moduleIds: string[] }) => [p.planId, p.label, p.moduleIds.length > 0])).toEqual([
      ['made-up-yearly', 'Made-up Yearly', true],
      ['standard', (await q(`select name from plans where plan_id = 'standard'`))[0].name, true],
    ]);
  });
});

describe('a school’s subscription through Control', () => {
  const post = (schoolId: string, body: unknown) => subscriptionPost(req(`/api/control/schools/${schoolId}/subscription`, body, founder), at(schoolId));

  it('“Change plan” needs a reason and a plan that exists, and puts the school in the address on it', async () => {
    const noReason = await post(SCHOOL, { action: 'plan', planId: 'made-up-yearly', reason: ' ' });
    expect([noReason.status, (await noReason.json()).code]).toEqual([400, 'reason']);
    const noPlan = await post(SCHOOL, { action: 'plan', planId: 'no-such-plan', reason: 'a made-up reason' });
    expect([noPlan.status, (await noPlan.json()).code]).toEqual([400, 'plan']);
    expect((await post(randomUUID(), { action: 'plan', planId: 'made-up-yearly', reason: 'a made-up reason' })).status).toBe(404);
    expect((await post('not-a-school', { action: 'plan', planId: 'made-up-yearly', reason: 'a made-up reason' })).status).toBe(404);
    // A school id in what is sent is not read: the address decides.
    const ok = await post(SCHOOL, { action: 'plan', planId: 'made-up-yearly', reason: 'agreed with the school', schoolId: OTHER });
    expect([ok.status, await ok.json()]).toEqual([200, { ok: true, modules: 2, switchedOff: 0 }]);
    expect(await q(`select school_id, plan_id from school_subscriptions where school_id = any($1::uuid[])`, [[SCHOOL, OTHER]])).toEqual([{ school_id: SCHOOL, plan_id: 'made-up-yearly' }]);
  });

  it('“Record a payment” takes rupees, stores paise, moves paid-until, and lists the payment back with who recorded it', async () => {
    const bad = await post(SCHOOL, { action: 'payment', amountRupees: 'a cheque', paidOn: TODAY, coversUntil: day(365), reference: 'cheque made-up 77' });
    expect([bad.status, (await bad.json()).code]).toEqual([400, 'amount']);
    const late = await post(SCHOOL, { action: 'payment', amountRupees: '45000', paidOn: day(1), coversUntil: day(365), reference: 'cheque made-up 77' });
    expect([late.status, (await late.json()).code]).toEqual([400, 'paid_on']);
    const none = await post(OTHER, { action: 'payment', amountRupees: '45000', paidOn: TODAY, coversUntil: day(365), reference: 'cheque made-up 77' });
    expect([none.status, (await none.json()).code]).toEqual([400, 'no_plan']);

    const paid = await post(SCHOOL, { action: 'payment', amountRupees: '45,000.50', paidOn: TODAY, coversUntil: day(365), reference: '  cheque made-up 77 ', note: '', schoolId: OTHER });
    expect([paid.status, await paid.json()]).toEqual([201, { ok: true, paidUntil: day(365), accessMode: 'full', handGraceEnded: false }]);
    expect(await q(`select school_id, amount_minor, paid_on::text as paid_on, covers_until::text as covers_until, reference, note, recorded_by from subscription_payments`)).toEqual([{ school_id: SCHOOL, amount_minor: 4500050, paid_on: TODAY, covers_until: day(365), reference: 'cheque made-up 77', note: null, recorded_by: FOUNDER }]);

    const got = await (await subscriptionRoute(req(`/api/control/schools/${SCHOOL}/subscription`, undefined, founder), at(SCHOOL))).json();
    expect(got.school).toMatchObject({ schoolName: 'Made-up School', planName: 'Made-up Yearly', paidUntil: day(365), state: 'paid', accessMode: 'full' });
    expect(got.payments).toMatchObject([{ amountMinor: 4500050, paidOn: TODAY, coversUntil: day(365), reference: 'cheque made-up 77', recordedBy: 'Farid Founder', correctedBy: null }]);
    expect((await subscriptionRoute(req(`/api/control/schools/${randomUUID()}/subscription`, undefined, founder), at(randomUUID()))).status).toBe(404);

    // A correction goes through the same door and names the row it corrects.
    const fixed = await post(SCHOOL, { action: 'payment', amountRupees: '45000', paidOn: TODAY, coversUntil: day(364), reference: 'cheque made-up 77', note: 'fifty paise too many, and a day too far', correctsPaymentId: got.payments[0].paymentId });
    expect([fixed.status, await fixed.json()]).toEqual([201, { ok: true, paidUntil: day(364), accessMode: 'full', handGraceEnded: false }]);
    expect(await q(`select count(*)::int as n from subscription_payments`)).toEqual([{ n: 2 }]);
    expect((await post(SCHOOL, { action: 'refund' })).status).toBe(400);
  });
});

// C212: a school's period, its terms and the amount due, through the same door. SCHOOL is on 'made-up-yearly' (from
// the tests above): 4,500 rupees a month or 45,000 a year per student, as typed there.
describe('a school’s terms and the amount due through Control (C212)', () => {
  const post = (schoolId: string, body: unknown, cookie = founder) => subscriptionPost(req(`/api/control/schools/${schoolId}/subscription`, body, cookie), at(schoolId));
  const read = async () => (await subscriptionRoute(req(`/api/control/schools/${SCHOOL}/subscription`, undefined, founder), at(SCHOOL))).json();

  it('nobody from a school sets a period, adds a term or ends one; nothing is written', async () => {
    const bodies = [
      { action: 'period', period: 'year', reason: 'let me in' },
      { action: 'term', kind: 'discount', percent: '100', startsOn: TODAY, reason: 'let me in' },
      { action: 'end_term', termId: randomUUID(), endsOn: TODAY, reason: 'let me in' },
    ];
    expect((await Promise.all(bodies.map((b) => post(SCHOOL, b, principal)))).map((r) => r.status)).toEqual([403, 403, 403]);
    expect((await Promise.all(bodies.map((b) => subscriptionPost(req(`/api/control/schools/${SCHOOL}/subscription`, b), at(SCHOOL))))).map((r) => r.status)).toEqual([401, 401, 401]);
    expect(await q(`select count(*)::int as n from school_billing_terms`)).toEqual([{ n: 0 }]);
    expect(await q(`select billing_period from school_subscriptions where school_id = $1`, [SCHOOL])).toEqual([{ billing_period: null }]);
  });

  it('the period, then a minimum, a negotiated price in rupees and a discount in percent; the amount due comes back with its working', async () => {
    expect((await read()).amount).toMatchObject({ planId: 'made-up-yearly', period: null, amountMinor: null, missing: 'no_period' });
    const quarter = await post(SCHOOL, { action: 'period', period: 'quarter', reason: 'not a period' });
    expect([quarter.status, (await quarter.json()).code]).toEqual([400, 'billing_period']);
    const year = await post(SCHOOL, { action: 'period', period: 'year', reason: 'the school pays once a year', schoolId: OTHER });
    expect([year.status, await year.json()]).toEqual([200, { ok: true, period: 'year' }]);
    expect(await q(`select school_id, billing_period from school_subscriptions where billing_period is not null`)).toEqual([{ school_id: SCHOOL, billing_period: 'year' }]);

    const term = (body: Record<string, unknown>) => post(SCHOOL, { action: 'term', startsOn: TODAY, reason: 'agreed with the made-up school', ...body });
    const badPercent = await term({ kind: 'discount', percent: '12.555' });
    expect([badPercent.status, (await badPercent.json()).code]).toEqual([400, 'percent']);
    const badPrice = await term({ kind: 'price', priceMonthRupees: '25' });
    expect([badPrice.status, (await badPrice.json()).code]).toEqual([400, 'price']);
    const badStart = await term({ kind: 'minimum', minimumStudents: '10', startsOn: day(-1) });
    expect([badStart.status, (await badStart.json()).code]).toEqual([400, 'starts_on']);
    expect((await post(randomUUID(), { action: 'term', kind: 'minimum', minimumStudents: '10', startsOn: TODAY, reason: 'no such school' })).status).toBe(404);

    const minimum = await term({ kind: 'minimum', minimumStudents: '10' });
    expect([minimum.status, await minimum.json()]).toEqual([201, { ok: true, termId: expect.any(String), replaced: 0, switchedOn: [], switchedOff: [] }]);
    expect((await term({ kind: 'price', priceMonthRupees: '25', priceYearRupees: '240.00' })).status).toBe(201);
    expect((await term({ kind: 'discount', percent: '12.5', schoolId: OTHER })).status).toBe(201);
    expect(await q(`select school_id, kind, price_month_minor, price_year_minor, discount_bp, minimum_students, created_by from school_billing_terms order by kind`)).toEqual([
      { school_id: SCHOOL, kind: 'discount', price_month_minor: null, price_year_minor: null, discount_bp: 1250, minimum_students: null, created_by: FOUNDER },
      { school_id: SCHOOL, kind: 'minimum', price_month_minor: null, price_year_minor: null, discount_bp: null, minimum_students: 10, created_by: FOUNDER },
      { school_id: SCHOOL, kind: 'price', price_month_minor: 2500, price_year_minor: 24000, discount_bp: null, minimum_students: null, created_by: FOUNDER },
    ]);

    // No active student, a minimum of 10: 10 × 240 rupees = 2,400, less 12.5% = 2,100 rupees for the year.
    const got = await read();
    expect(got.amount).toMatchObject({ period: 'year', activeStudents: 0, minimumStudents: 10, billedStudents: 10, priceSource: 'negotiated', pricePerStudentMinor: 24000, grossMinor: 240000, discountBp: 1250, discountMinor: 30000, amountMinor: 210000, missing: null });
    expect(got.amount.amountMinor / 100).toBe(2100);
    expect(got.terms.map((t: { kind: string; state: string; reason: string; createdBy: string }) => [t.kind, t.state, t.reason, t.createdBy]).sort()).toEqual([
      ['discount', 'in_force', 'agreed with the made-up school', 'Farid Founder'],
      ['minimum', 'in_force', 'agreed with the made-up school', 'Farid Founder'],
      ['price', 'in_force', 'agreed with the made-up school', 'Farid Founder'],
    ]);
    // The overview shows the same amount for the school.
    const overview = await (await overviewRoute(req('/api/control/billing', undefined, founder))).json();
    expect(overview.schools.find((x: { schoolId: string }) => x.schoolId === SCHOOL).amount).toEqual(got.amount);

    // A month: 10 × 25 rupees = 250, less 12.5% = 218.75 rupees.
    expect((await post(SCHOOL, { action: 'period', period: 'month', reason: 'the school now pays each month' })).status).toBe(200);
    expect((await read()).amount).toMatchObject({ period: 'month', pricePerStudentMinor: 2500, grossMinor: 25000, discountMinor: 3125, amountMinor: 21875 });
  });

  it('ending a term needs a reason and a day not past; the amount follows', async () => {
    const discount = (await read()).terms.find((t: { kind: string }) => t.kind === 'discount');
    const noReason = await post(SCHOOL, { action: 'end_term', termId: discount.termId, endsOn: day(-1), reason: '' });
    expect([noReason.status, (await noReason.json()).code]).toEqual([400, 'reason']);
    const past = await post(SCHOOL, { action: 'end_term', termId: discount.termId, endsOn: day(-2), reason: 'into the past' });
    expect([past.status, (await past.json()).code]).toEqual([400, 'ends_on']);
    expect((await post(OTHER, { action: 'end_term', termId: discount.termId, endsOn: day(-1), reason: 'another school’s term' })).status).toBe(404);
    const ended = await post(SCHOOL, { action: 'end_term', termId: discount.termId, endsOn: day(-1), reason: 'the offer was withdrawn' });
    expect([ended.status, await ended.json()]).toEqual([200, { ok: true, termId: discount.termId, replaced: 0, switchedOn: [], switchedOff: [] }]);
    expect((await read()).amount).toMatchObject({ discountBp: null, discountMinor: 0, amountMinor: 25000 });
    expect(await q(`select after_state ->> 'reason' as reason, actor_user_id from audit_log where event_action = 'billing.terms.ended'`)).toEqual([{ reason: 'the offer was withdrawn', actor_user_id: FOUNDER }]);
  });
});
