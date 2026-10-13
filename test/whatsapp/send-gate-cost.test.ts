import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { messageCost, rateOnSendDate, sendWhatsAppMessage, templateCategory, unpricedRealSend, type MessageRate } from '@/lib/whatsapp/gate';
import { loadMessagingCost } from '@/lib/control/messaging-cost';
import type { WhatsAppProvider } from '@/lib/whatsapp/provider';
import { applyNotices } from '@/lib/whatsapp/delivery';

// The send-gate's money (T7, C140), on the whole real schema (every
// migration replayed on PGlite): the category comes from the template, the
// rate and GST from message_rate_table for the day of sending, and with no
// verified rate the gap is recorded, never filled with a guess. The rates
// used here are test values, not Meta's: no real rate is asserted anywhere.

const SCHOOL = 'c0000000-0000-4000-8000-000000000001';
const TEST_SCHOOL = 'c0000000-0000-4000-8000-000000000002';
const STUDENT = 'c0000000-0000-4000-8000-000000500001';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;

// As the app does it: one transaction as app_user in the school's context.
const asSchool = <T>(fn: (client: any) => Promise<T>, school = SCHOOL): Promise<T> =>
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    await tx.query(`select set_config('app.current_tenant_id', '${school}', true)`);
    await tx.query(`select set_config('app.current_role', 'principal', true)`);
    return fn(tx);
  });
let n = 0;
// Money is only ever recorded for a real account (C182: what the stand-in "sends" reaches no phone and is never
// billable). So the live school here sends through a made-up real account that calls nothing; the test school
// is left to the gate, which gives it the stand-in.
const realAccount: WhatsAppProvider = {
  name: 'meta',
  send: async () => ({ success: true, providerMessageId: `made-up-${n}-${Math.random().toString(36).slice(2)}`, errorMessage: null, raw: null }),
  sendText: async () => ({ success: false, providerMessageId: null, errorMessage: 'not used in this test', raw: null }),
  testConnection: async () => ({ ok: true, message: 'made up for this test' }),
  // Made up as well: it believes whatever it is handed, so a test can say "this was delivered".
  readNotice: (rawBody) => ({ ok: true, notices: JSON.parse(rawBody) }),
};
// A real account's message is billable once it is delivered (C183), so each one sent here is then delivered.
const send = async (template: string, school = SCHOOL, student = STUDENT) => {
  const out = await asSchool((client) => sendWhatsAppMessage(client, { schoolId: school, studentId: student, purpose: 'operational_communication', toPhone: '+910000000000', templateName: template, templateParams: {}, dedupeKey: `t-${++n}` }, school === SCHOOL ? { platformDefaultProvider: realAccount } : {}), school);
  if (school === SCHOOL && out.status === 'sent') {
    const id = (await db.pg.query(`select provider_message_id from communication_log where log_id = $1`, [out.logId])).rows[0].provider_message_id;
    await db.pg.transaction(async (tx: any) => {
      await tx.query('set local role nca_super');
      return applyNotices(tx, realAccount, JSON.stringify([{ kind: 'status', providerMessageId: id, status: 'delivered', at: new Date().toISOString() }]), null);
    });
  }
  return out;
};
const row = async (logId: string) => (await db.pg.query(`select billing_category, billable, est_cost_paise::int as cost, gst_paise::int as gst, rate_id, cost_basis, status::text as status from communication_log where log_id = $1`, [logId])).rows[0];

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture, is_pilot, pilot_allow_outbound, monthly_budget_paise, quiet_hours_start, quiet_hours_end)
      values ('${SCHOOL}', 'Live School', 'IN-HR', false, false, true, 100000, '00:00', '00:00'),
             ('${TEST_SCHOOL}', 'Fixture School', 'IN-HR', true, false, true, 100000, '00:00', '00:00');
    insert into students (student_id, school_id, admission_no, name, status) values ('${STUDENT}', '${SCHOOL}', 'A-1', 'Child', 'active');
    insert into students (student_id, school_id, admission_no, name, status) values ('c0000000-0000-4000-8000-000000500002', '${TEST_SCHOOL}', 'A-1', 'Child', 'active');
    insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version)
      select school_id, student_id, 'operational_communication', true, (enum_range(null::consent_method))[1], 'v1' from students where school_id in ('${SCHOOL}', '${TEST_SCHOOL}');
    insert into whatsapp_templates (school_id, template_name, status, billing_category) values
      (null, 'absence_alert', 'approved', 'utility'),
      (null, 'open_day_invite', 'approved', 'marketing'),
      (null, 'login_code', 'approved', 'authentication'),
      (null, 'not_approved_yet', 'pending', 'marketing');
  `);
  await db.pg.exec(`update whatsapp_templates set meta_status = 'approved', meta_template_id = 'made-up' where status = 'approved'`); // the made-up real account sends only what Meta has approved (C184)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
}, 120_000);

afterAll(async () => {
  await db?.stop();
});

describe('the rule, with nothing about money written in the code', () => {
  const rate: MessageRate = { rateId: 'r', ratePaise: 1000, gstPercent: 18 };
  it('a sent message costs its rate, and GST is that rate’s own percentage', () => {
    expect(messageCost('utility', true, rate)).toEqual({ category: 'utility', billable: true, estCostPaise: 1000, gstPaise: 180, rateId: 'r', costBasis: 'rate_table' });
    expect(messageCost('marketing', true, { rateId: 'm', ratePaise: 333, gstPercent: 5 })).toMatchObject({ estCostPaise: 333, gstPaise: 17 });
  });
  it('a message that was not sent costs nothing, whatever the rate', () => {
    expect(messageCost('marketing', false, rate)).toEqual({ category: 'marketing', billable: false, estCostPaise: 0, gstPaise: 0, rateId: null, costBasis: 'not_billable' });
  });
  it('with no verified rate the cost is left at zero and marked, not guessed', () => {
    expect(messageCost('utility', true, null)).toEqual({ category: 'utility', billable: true, estCostPaise: 0, gstPaise: 0, rateId: null, costBasis: 'rate_not_verified' });
  });
  it('a real send never goes out at an unknown price; the platform’s stand-in, which costs nothing, still does', () => {
    expect(unpricedRealSend('school_specific', null)).toContain('rate not verified');
    expect(unpricedRealSend('school_specific', rate)).toBeNull();
    expect(unpricedRealSend('platform_default', null)).toBeNull();
  });
  it('the gate holds no rate of its own', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/lib/whatsapp/gate.ts', 'utf8');
    expect(source).not.toMatch(/PLACEHOLDER|_PAISE\s*=\s*\d|gstPercent:\s*\d|'utility',\s*\$\d/);
  });
});

describe('before any rate is verified: "rate not verified"', () => {
  it('the rate table is empty: no rate is shipped with the code', async () => {
    expect((await db.pg.query(`select count(*)::int as c from message_rate_table`)).rows[0].c).toBe(0);
  });

  it('with no verified rate a real account does not send at all: a budget cannot limit what it cannot count (C186)', async () => {
    const utility = await send('absence_alert');
    expect(utility).toMatchObject({ status: 'blocked_budget', reason: expect.stringContaining('rate not verified') });
    expect(await row(utility.logId)).toEqual({ billing_category: 'utility', billable: false, cost: 0, gst: 0, rate_id: null, cost_basis: 'not_billable', status: 'blocked_budget' });
    expect((await send('open_day_invite')).status).toBe('blocked_budget');
  });
});

describe('with rates on record: utility and marketing are costed apart, by the rate in force on the day', () => {
  let utilityNow: string;
  let marketingNow: string;
  beforeAll(async () => {
    const { rows } = await db.pg.query(`
      insert into message_rate_table (channel, billing_category, rate_paise, gst_percent, verified_source, verified_at, effective_from) values
        ('whatsapp', 'utility',   900, 18, 'TEST VALUE, not a real rate', now(), current_date - 400),
        ('whatsapp', 'utility',  1100, 18, 'TEST VALUE, not a real rate', now(), current_date - 30),
        ('whatsapp', 'utility',  9900, 18, 'TEST VALUE, not a real rate', now(), current_date + 30),
        ('whatsapp', 'marketing', 7000, 18, 'TEST VALUE, not a real rate', now(), current_date - 30),
        ('email',    'utility',     1, 18, 'TEST VALUE, not a real rate', now(), current_date - 30)
      returning rate_id, billing_category, rate_paise::int as rate, channel::text as channel`);
    utilityNow = rows.find((r: any) => r.rate === 1100).rate_id;
    marketingNow = rows.find((r: any) => r.rate === 7000).rate_id;
  });

  it('the rate valid on the send date is used: not an older one, not one that starts later, not another channel’s', async () => {
    const rate = await asSchool((c) => rateOnSendDate(c, 'utility', 'Asia/Kolkata'));
    expect(rate).toEqual({ rateId: utilityNow, ratePaise: 1100, gstPercent: 18 });
    expect(await asSchool((c) => rateOnSendDate(c, 'authentication', 'Asia/Kolkata'))).toBeNull();
  });

  it('a utility message and a marketing message record their own category, rate, cost and GST', async () => {
    const utility = await send('absence_alert');
    expect(await row(utility.logId)).toEqual({ billing_category: 'utility', billable: true, cost: 1100, gst: 198, rate_id: utilityNow, cost_basis: 'rate_table', status: 'delivered' });
    const marketing = await send('open_day_invite');
    expect(await row(marketing.logId)).toEqual({ billing_category: 'marketing', billable: true, cost: 7000, gst: 1260, rate_id: marketingNow, cost_basis: 'rate_table', status: 'delivered' });
  });

  it('a category with no rate yet does not send, beside ones that have a rate and do', async () => {
    const auth = await send('login_code');
    expect(auth.status).toBe('blocked_budget');
    expect(await row(auth.logId)).toMatchObject({ billing_category: 'authentication', billable: false, cost: 0, cost_basis: 'not_billable' });
  });

  it('a message that is blocked costs nothing and says so, in its own category', async () => {
    const blocked = await send('not_approved_yet');
    expect(blocked.status).toBe('blocked_no_template');
    expect(await row(blocked.logId)).toEqual({ billing_category: 'marketing', billable: false, cost: 0, gst: 0, rate_id: null, cost_basis: 'not_billable', status: 'blocked_no_template' });
    const unknown = await send('no_such_template');
    expect(await row(unknown.logId)).toMatchObject({ billable: false, cost_basis: 'not_billable' });
  });

  it('the budget counts the real cost with GST: a message that would pass the budget is held back', async () => {
    const spent = Number((await db.pg.query(`select coalesce(sum(est_cost_paise + gst_paise), 0)::int as s from communication_log where school_id = $1 and billable and cost_basis = 'rate_table'`, [SCHOOL])).rows[0].s);
    // Room for one utility message (1,298 paise with GST) but not for a marketing one (8,260).
    await db.pg.query(`update schools set monthly_budget_paise = $2 where school_id = $1`, [SCHOOL, spent + 2000]);
    expect((await send('open_day_invite')).status).toBe('blocked_budget');
    expect((await send('absence_alert')).status).toBe('sent');
    await db.pg.query(`update schools set monthly_budget_paise = 100000000 where school_id = $1`, [SCHOOL]);
  });

  it('the category belongs to the template, and a school’s own template wins over the platform’s', async () => {
    await db.pg.query(`insert into whatsapp_templates (school_id, template_name, status, billing_category) values ($1, 'absence_alert', 'approved', 'marketing')`, [SCHOOL]);
    expect(await asSchool((c) => templateCategory(c, SCHOOL, 'absence_alert'))).toBe('marketing');
    expect(await asSchool((c) => templateCategory(c, TEST_SCHOOL, 'absence_alert'), TEST_SCHOOL)).toBe('utility');
    await db.pg.query(`delete from whatsapp_templates where school_id = $1`, [SCHOOL]);
    await expect(db.pg.query(`insert into whatsapp_templates (school_id, template_name, status, billing_category) values (null, 'x', 'approved', 'promo')`)).rejects.toThrow(/billing_category_known/);
  });
});

describe('Control’s cost view: live schools, last 30 days, read only', () => {
  it('totals by school and category from the log, counts what has no verified rate, and leaves test schools out', async () => {
    await send('absence_alert', TEST_SCHOOL, 'c0000000-0000-4000-8000-000000500002');
    await db.pg.query(`insert into communication_log (school_id, channel, billing_category, billable, est_cost_paise, gst_paise, cost_basis, status, created_at) values ($1, 'whatsapp', 'utility', true, 555, 100, 'rate_table', 'sent', now() - interval '45 days')`, [SCHOOL]);
    // A row from before C140: a made-up placeholder amount and no cost_basis. It is not money.
    await db.pg.query(`insert into communication_log (school_id, channel, billing_category, billable, est_cost_paise, gst_paise, status) values ($1, 'whatsapp', 'utility', true, 50, 0, 'sent')`, [SCHOOL]);
    const view = await db.pg.transaction(async (tx: any) => {
      await tx.query('set local role nca_super');
      return loadMessagingCost(tx);
    });
    expect(view.schools.map((s: any) => s.schoolName)).toEqual(['Live School']);
    const live = view.schools[0];
    const logged = (await db.pg.query(
      `select count(*) filter (where billable)::int as billable, coalesce(sum(est_cost_paise) filter (where cost_basis = 'rate_table'), 0)::int as cost, coalesce(sum(gst_paise) filter (where cost_basis = 'rate_table'), 0)::int as gst,
              count(*) filter (where billable and cost_basis is distinct from 'rate_table')::int as unverified, count(*)::int as attempts
       from communication_log where school_id = $1 and created_at > now() - interval '30 days'`, [SCHOOL])).rows[0];
    expect(live).toMatchObject({ attempts: logged.attempts, billable: logged.billable, costPaise: logged.cost, gstPaise: logged.gst, rateNotVerified: logged.unverified });
    expect(live.rateNotVerified).toBe(1); // only the row from before C140, below; a real account no longer sends unpriced
    const byCategory = Object.fromEntries(live.categories.map((c: any) => [c.category, c]));
    expect(byCategory.utility.costPaise).toBeGreaterThan(0);
    expect(byCategory.marketing.costPaise).toBe(7000);
    expect(view.totals.costPaise).toBe(live.costPaise);
    // The old placeholder row added nothing to the cost: 1,100 per utility message and nothing else.
    expect(byCategory.utility.costPaise % 1100).toBe(0);
    // The 45-day-old message and the test school's are not in it.
    expect(view.totals.costPaise).not.toBe(live.costPaise + 555);
    // The rates it was costed with, each with where and when it was verified.
    expect(view.rates.filter((r: any) => r.inForce).map((r: any) => [r.category, r.ratePaise]).sort()).toEqual([['marketing', 7000], ['utility', 1100]]);
    expect(view.rates.every((r: any) => r.verifiedSource && r.verifiedAt)).toBe(true);
    expect(view.categoriesWithoutRate).toEqual(['authentication', 'service']);
  });
});
