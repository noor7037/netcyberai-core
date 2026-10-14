import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { addRate, allSchoolSpend, metaPricingPage, schoolSpend, setSchoolBudget } from '@/lib/whatsapp/cost';
import { rateOnSendDate, unpricedRealSend } from '@/lib/whatsapp/gate';

// Cost and going live (docs/25 slice 7o, C197). The acceptance test: a real send without a verified rate is
// refused (held on the full schema by send-gate-cost.test.ts, "with no verified rate a real account does not send
// at all"; its pure rule is repeated here), and month spend equals the sum of delivered, billable messages.
// Every rate below is a TEST VALUE, not Meta's price.

const A = 'cf000000-0000-4000-8000-000000000001';
const B = 'cf000000-0000-4000-8000-000000000002';
const FOUNDER = 'cf000000-0000-4000-8000-000000000011';
const PRINCIPAL = 'cf000000-0000-4000-8000-000000000012';
const SOURCE = 'https://developers.facebook.com/docs/whatsapp/pricing';
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const day = (plus: number) => new Date(new Date(`${today}T00:00:00Z`).getTime() + plus * 86400_000).toISOString().slice(0, 10);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asPrincipal = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', A], ['app.current_role', 'principal'], ['app.current_user_id', PRINCIPAL]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
const good = { category: 'utility', ratePaise: 1100, gstPercent: 18, source: SOURCE, verifiedOn: today, effectiveFrom: today };
let n = 0;
// One message in the log as the gate and the delivery notices would have left it.
const logged = (school: string, status: string, o: { provider?: string; billable?: boolean; cost?: number; gst?: number; basis?: string; at?: string } = {}) =>
  db.pg.query(
    `insert into communication_log (school_id, to_phone, channel, template_name, billing_category, billable, est_cost_paise, gst_paise, cost_basis, status, dedupe_key, provider_used, purpose, provider, created_at)
     values ($1, '+919000000001', 'whatsapp', 'class_notice', 'utility', $2, $3, $4, $5, $6, $7, 'platform_default', 'operational_communication', $8, coalesce($9::timestamptz, now()))`,
    [school, o.billable ?? false, o.cost ?? 0, o.gst ?? 0, o.basis ?? 'not_billable', status, `cost-test-${++n}`, o.provider ?? 'meta', o.at ?? null]
  );

describe('the rules', () => {
  it('a real send never goes out at an unknown price', () => {
    expect(unpricedRealSend('school_specific', null)).toMatch(/rate not verified/);
    expect(unpricedRealSend('school_specific', { rateId: 'r', ratePaise: 1100, gstPercent: 18 })).toBeNull();
    expect(unpricedRealSend('platform_default', null)).toBeNull(); // the stand-in costs nothing
  });
  it('a rate’s source is a page on Meta’s own sites, over https, and nothing else', () => {
    expect(metaPricingPage(SOURCE)).toBe(SOURCE);
    expect(metaPricingPage(' https://business.whatsapp.com/products/platform-pricing ')).toBe('https://business.whatsapp.com/products/platform-pricing');
    for (const bad of ['http://developers.facebook.com/docs/whatsapp/pricing', 'https://developers.facebook.com.example.org/pricing', 'https://example.org/meta-rates', 'https://developers.facebook.com/', 'a blog post', '']) expect(metaPricingPage(bad), bad).toBeNull();
  });
});

describe('on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture, is_pilot, pilot_allow_outbound, monthly_budget_paise) values ('${A}', 'School A', 'IN-HR', false, false, true, null), ('${B}', 'School B', 'IN-HR', false, false, true, 50000);
      insert into users (user_id, school_id, email, role, display_name) values ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal'), ('${FOUNDER}', null, 'founder@netcyberai.example', 'super_admin', 'The Founder');
    `);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('no rate ships with the code; one is added only with Meta’s page and a recent day it was read', async () => {
    expect((await db.pg.query(`select count(*)::int as n from message_rate_table`)).rows[0].n).toBe(0);
    expect(await platform((c) => rateOnSendDate(c, 'utility', 'Asia/Kolkata'))).toBeNull();
    const add = (o: Partial<typeof good>) => platform((c) => addRate(c, { userId: FOUNDER }, { ...good, ...o }, today));
    expect(await add({ source: 'https://example.org/rates' })).toEqual({ ok: false, reason: 'source' });
    expect(await add({ category: 'free' })).toEqual({ ok: false, reason: 'category' });
    expect(await add({ ratePaise: -1 })).toEqual({ ok: false, reason: 'rate' });
    expect(await add({ ratePaise: 11.5 })).toEqual({ ok: false, reason: 'rate' });
    expect(await add({ gstPercent: 90 })).toEqual({ ok: false, reason: 'gst' });
    expect(await add({ verifiedOn: day(1) })).toEqual({ ok: false, reason: 'verified_on' });
    expect(await add({ verifiedOn: day(-31) })).toEqual({ ok: false, reason: 'verified_on' });
    expect(await add({ effectiveFrom: 'soon' })).toEqual({ ok: false, reason: 'effective_from' });
    expect((await db.pg.query(`select count(*)::int as n from message_rate_table`)).rows[0].n).toBe(0);
    const made = await add({});
    expect(made).toMatchObject({ ok: true });
    expect(await platform((c) => rateOnSendDate(c, 'utility', 'Asia/Kolkata'))).toMatchObject({ ratePaise: 1100, gstPercent: 18 });
    expect(await platform((c) => rateOnSendDate(c, 'marketing', 'Asia/Kolkata'))).toBeNull(); // its own category only
    // A rate that starts tomorrow is on record but not in force today.
    expect(await add({ ratePaise: 9900, effectiveFrom: day(1) })).toMatchObject({ ok: true });
    expect(await platform((c) => rateOnSendDate(c, 'utility', 'Asia/Kolkata'))).toMatchObject({ ratePaise: 1100 });
    expect((await db.pg.query(`select verified_source, after_state->>'source' as audited from message_rate_table r join audit_log a on a.target_id = r.rate_id::text and a.event_action = 'whatsapp.rate_added' order by r.created_at limit 1`)).rows[0]).toEqual({ verified_source: SOURCE, audited: SOURCE });
    // A school's own session cannot add or change a rate.
    await expect(asPrincipal((c) => c.query(`insert into message_rate_table (channel, billing_category, rate_paise, verified_source, verified_at) values ('whatsapp', 'utility', 1, 'x', now())`))).rejects.toThrow(/permission denied/);
  });

  it('month spend equals the sum of delivered, billable messages: nothing else is money spent', async () => {
    const paid = { provider: 'meta', billable: true, cost: 1100, gst: 198, basis: 'rate_table' };
    await logged(A, 'delivered', paid);
    await logged(A, 'read', paid);
    await logged(A, 'sent', { provider: 'meta', cost: 1100, gst: 198, basis: 'rate_table' }); // on its way: priced, not yet billable
    await logged(A, 'uncertain', { provider: 'meta', cost: 1100, gst: 198, basis: 'rate_table' });
    await logged(A, 'failed', { provider: 'meta' }); // a failed message costs nothing
    await logged(A, 'delivered', { provider: 'stand-in' }); // the stand-in is never billable
    await logged(A, 'blocked_budget');
    await logged(A, 'blocked_consent');
    await logged(A, 'delivered', { ...paid, at: new Date(Date.now() - 40 * 86400_000).toISOString() }); // an earlier month
    await logged(B, 'delivered', paid); // another school
    const spend = await asPrincipal((c) => schoolSpend(c, A));
    expect(spend).toMatchObject({ budgetPaise: null, spentPaise: 2 * (1100 + 198), delivered: 2, onItsWayPaise: 2 * (1100 + 198), onItsWay: 2, heldForBudget: 1 });
    // The same number, counted the long way from the log.
    const byHand = (await db.pg.query(`select coalesce(sum(est_cost_paise + gst_paise), 0)::int as total from communication_log where school_id = $1 and billable and status::text in ('delivered', 'read') and date_trunc('month', created_at at time zone 'Asia/Kolkata') = date_trunc('month', now() at time zone 'Asia/Kolkata')`, [A])).rows[0].total;
    expect(spend.spentPaise).toBe(byHand);
    const all = await platform((c) => allSchoolSpend(c));
    expect(all.map((s) => [s.schoolName, s.budgetPaise, s.spentPaise, s.delivered])).toEqual([['School A', null, 2596, 2], ['School B', 50000, 1298, 1]]);
  });

  it('a school’s monthly limit is set by NetCyberAI staff with a reason, and the school reads it', async () => {
    expect(await platform((c) => setSchoolBudget(c, { userId: FOUNDER }, A, 250000, '  '))).toEqual({ ok: false, reason: 'reason' });
    expect(await platform((c) => setSchoolBudget(c, { userId: FOUNDER }, A, -5, 'x'))).toEqual({ ok: false, reason: 'amount' });
    expect(await platform((c) => setSchoolBudget(c, { userId: FOUNDER }, FOUNDER, 100, 'x'))).toEqual({ ok: false, reason: 'not_found' });
    expect(await platform((c) => setSchoolBudget(c, { userId: FOUNDER }, A, 250000, 'Agreed with the principal on the phone.'))).toEqual({ ok: true });
    expect(await asPrincipal((c) => schoolSpend(c, A))).toMatchObject({ budgetPaise: 250000, spentPaise: 2596 });
    expect((await db.pg.query(`select before_state, after_state from audit_log where event_action = 'whatsapp.budget_set'`)).rows).toEqual([{ before_state: { budgetPaise: null }, after_state: { budgetPaise: 250000, reasoned: true } }]); // never a reason's words (C224)
    // Review of C224: the founder's words are kept where only the founder reads them (C124).
    expect((await db.pg.query(`select r.reason from entitlement_change_reasons r join audit_log a on a.audit_id = r.audit_id where a.event_action = 'whatsapp.budget_set'`)).rows).toEqual([{ reason: 'Agreed with the principal on the phone.' }]);
    // Taken away again: nothing sends for the school.
    expect(await platform((c) => setSchoolBudget(c, { userId: FOUNDER }, A, null, 'The school asked to pause.'))).toEqual({ ok: true });
    expect((await asPrincipal((c) => schoolSpend(c, A))).budgetPaise).toBeNull();
  });
});
