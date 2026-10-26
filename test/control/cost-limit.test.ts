import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { CostMonthView } from '@/components/control/CostMonthView';
import { costCsvRows, loadCostMonth } from '@/lib/control/messaging-cost';
import { t } from '@/lib/i18n';
import { indiaMonth, limitState, schoolSpend, setSchoolBudget, shiftMonth } from '@/lib/whatsapp/cost';
import { applyNotices } from '@/lib/whatsapp/delivery';
import { sendWhatsAppMessage } from '@/lib/whatsapp/gate';
import type { WhatsAppProvider } from '@/lib/whatsapp/provider';

// Control → Messaging & Cost: where a school stands against its limit (docs/26 slice 8f, C205), with the REAL
// send-gate on the whole real schema. The page must say what the gate does. The gate holds a message back when what
// it counts (priced messages delivered or still on their way) has reached the limit, or would pass it with that
// message; so a school is judged on that same sum, and a school the limit held a message back for is listed even
// though less than all of its limit is counted. A message held because its category has no verified rate is not the
// limit's doing and is counted apart.
// Every school, rate and amount below is made up: none is Meta's price. A utility message costs 1,000 paise and GST
// at 18 in a hundred: 1,180 paise. The marketing category has no rate.

const SCHOOL = 'c8f10000-0000-4000-8000-000000000001';
const QUIET = 'c8f10000-0000-4000-8000-000000000002';
const STUDENT = 'c8f10000-0000-4000-8000-000000500001';
const FOUNDER = 'c8f10000-0000-4000-8000-000000000011';
const THIS = indiaMonth();
const LAST = shiftMonth(THIS, -1);
const ONE = 1180;
// The words the page shows when no school is at, near or held by its limit (after the month's name).
const NOBODY = t('en', 'cost.month.flagged.none', { month: '|' }).split('| ')[1];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
// As the app does it: one transaction as app_user in the school's own context.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asSchool = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    await tx.query(`select set_config('app.current_tenant_id', '${SCHOOL}', true)`);
    await tx.query(`select set_config('app.current_role', 'principal', true)`);
    return fn(tx);
  });

let n = 0;
// Money is only recorded for a real account, so the school sends through a made-up one that calls nothing and
// believes whatever notice it is handed (as test/whatsapp/send-gate-cost.test.ts does).
const realAccount: WhatsAppProvider = {
  name: 'meta',
  send: async () => ({ success: true, providerMessageId: `made-up-${n}-${Math.random().toString(36).slice(2)}`, errorMessage: null, raw: null }),
  sendText: async () => ({ success: false, providerMessageId: null, errorMessage: 'not used in this test', raw: null }),
  sendChoice: async () => ({ success: false, providerMessageId: null, errorMessage: 'not used in this test', raw: null }),
  testConnection: async () => ({ ok: true, message: 'made up for this test' }),
  readNotice: (rawBody) => ({ ok: true, notices: JSON.parse(rawBody) }),
};
const send = (template = 'absence_alert') => asSchool((client) => sendWhatsAppMessage(client, { schoolId: SCHOOL, studentId: STUDENT, purpose: 'operational_communication', toPhone: '+910000000000', templateName: template, templateParams: {}, dedupeKey: `limit-${++n}` }, { platformDefaultProvider: realAccount }));
const deliver = async (logId: string) => {
  const id = (await db.pg.query(`select provider_message_id from communication_log where log_id = $1`, [logId])).rows[0].provider_message_id;
  await platform((tx) => applyNotices(tx, realAccount, JSON.stringify([{ kind: 'status', providerMessageId: id, status: 'delivered', at: new Date().toISOString() }]), null));
};
// The sum the gate itself says it added up, read out of the reason it gives for holding a message back.
const gateSum = (reason: string | null) => Number(/spend \((\d+) paise\)/.exec(reason ?? '')?.[1] ?? NaN);
// A limit is changed by the app's own function, which writes the audit row the page reads. The test database's
// clock ticks in milliseconds, so a change is kept a few of them apart from the messages before and after it.
const pause = () => new Promise((resolve) => setTimeout(resolve, 15));
const setLimit = async (paise: number | null, school = SCHOOL) => {
  await pause();
  expect(await platform((c) => setSchoolBudget(c, { userId: FOUNDER }, school, paise, 'Made up for this test.'))).toEqual({ ok: true });
  await pause();
};
// What Control's page shows for this month: the school's line, and the list of schools at, near or held by a limit.
const seen = async (month = THIS) => {
  const data = await platform((c) => loadCostMonth(c, month, THIS));
  const html = renderToStaticMarkup(createElement(CostMonthView, { data, lang: 'en' }));
  const line = (schoolId: string) => data.schools.find((s) => s.schoolId === schoolId)!;
  return { data, html, school: line(SCHOOL), line, flags: [...html.matchAll(/data-cost-flag="(\w+)"/g)].map((m) => m[1]) };
};

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture, is_pilot, pilot_allow_outbound, monthly_budget_paise, quiet_hours_start, quiet_hours_end) values
      ('${SCHOOL}', 'Riverside School', 'IN-HR', false, false, true, null, '00:00', '00:00'),
      ('${QUIET}', 'Quiet School', 'IN-HR', false, false, true, 7000, '00:00', '00:00');
    insert into users (user_id, school_id, email, role, display_name) values ('${FOUNDER}', null, 'founder@netcyberai.example', 'super_admin', 'The Founder');
    insert into students (student_id, school_id, admission_no, name, status) values ('${STUDENT}', '${SCHOOL}', 'A-1', 'Child', 'active');
    insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version)
      select school_id, student_id, 'operational_communication', true, (enum_range(null::consent_method))[1], 'v1' from students where school_id = '${SCHOOL}';
    insert into whatsapp_templates (school_id, template_name, status, billing_category, body, variables) values (null, 'absence_alert', 'approved', 'utility', 'From {{school}}: words for this test only.', '{school}'), (null, 'open_day_invite', 'approved', 'marketing', 'From {{school}}: words for this test only.', '{school}');
    update whatsapp_templates set meta_status = 'approved', meta_template_id = 'made-up' where status = 'approved';
    insert into message_rate_table (channel, billing_category, rate_paise, gst_percent, verified_source, verified_at, effective_from)
      values ('whatsapp', 'utility', 1000, 18, 'TEST VALUE, not a real rate', now(), (now() at time zone 'Asia/Kolkata')::date - 40);
  `);
  // The limit: 3,000 paise, room for two utility messages and not for a third.
  await setLimit(3000);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
}, 120_000);
afterAll(async () => db?.stop());

describe('against the limit: the page says what the send-gate does', () => {
  let held = 0; // messages the limit has held back so far this month

  it('messages sent and not yet delivered count against the limit, though nothing is spent yet', async () => {
    expect((await send()).status).toBe('sent');
    expect((await send()).status).toBe('sent');
    const { school, flags, html } = await seen();
    expect(school).toMatchObject({ budgetPaise: 3000, spentPaise: 0, delivered: 0, onItsWay: 2, onItsWayPaise: 2 * ONE, countedPaise: 2 * ONE, heldForBudget: 0, heldNoRate: 0, state: 'within' });
    expect(flags).toEqual([]);
    expect(html).toContain(NOBODY);
  });

  it('a school the gate is holding back is listed, though less than all of its limit is counted', async () => {
    // The third message would pass the limit (2,360 + 1,180 of 3,000): the gate holds it back.
    const third = await send();
    expect(third).toMatchObject({ status: 'blocked_budget', reason: expect.stringContaining('would pass') });
    held += 1;
    let now = await seen();
    // The page's figure is the gate's own sum: 2,360 paise, with nothing delivered yet.
    expect(gateSum(third.reason)).toBe(2 * ONE);
    expect(now.school).toMatchObject({ spentPaise: 0, countedPaise: 2 * ONE, heldForBudget: held, heldNoRate: 0, state: 'held' });
    expect(now.flags).toEqual(['held']);
    expect(now.html).toContain(t('en', 'cost.month.flagged.line', { counted: '₹23.60', limit: '₹30.00', held: '1' }));
    expect(now.html).not.toContain(NOBODY);
    // The row of the list, and so of the export: limit, spend, delivered, on its way (count and cost), counted, held, state.
    expect(costCsvRows('en', [now.school])).toEqual([[THIS, 'Riverside School', '30.00', '0.00', 0, 2, '23.60', '23.60', 1, 0, 'Limit held messages back']]);

    // Both are delivered: now it is money spent, the same 2,360 is counted, and the gate still holds the next one.
    for (const logId of (await db.pg.query(`select log_id from communication_log where school_id = $1 and status = 'sent'`, [SCHOOL])).rows.map((r: { log_id: string }) => r.log_id)) await deliver(logId);
    const fourth = await send();
    expect(fourth.status).toBe('blocked_budget');
    held += 1;
    now = await seen();
    expect(gateSum(fourth.reason)).toBe(now.school.countedPaise);
    expect(now.school).toMatchObject({ spentPaise: 2 * ONE, delivered: 2, onItsWay: 0, countedPaise: 2 * ONE, heldForBudget: held, state: 'held' });
    expect(now.flags).toEqual(['held']);
    // On delivered spend alone, and without the held messages, it would have read "within the limit" all along.
    expect(limitState(3000, now.school.spentPaise)).toBe('within');
  });

  it('raising the limit ends it: what the old limit held stays in its column, and the state is judged on the new one', async () => {
    await setLimit(5000);
    let now = await seen();
    expect(now.school).toMatchObject({ budgetPaise: 5000, countedPaise: 2 * ONE, heldForBudget: held, state: 'within' });
    expect(now.flags).toEqual([]);
    // Two more go, and are not yet delivered: 4,720 of 5,000 is counted while only 2,360 is spent. Near the limit.
    expect((await send()).status).toBe('sent');
    expect((await send()).status).toBe('sent');
    now = await seen();
    expect(now.school).toMatchObject({ spentPaise: 2 * ONE, onItsWay: 2, countedPaise: 4 * ONE, heldForBudget: held, state: 'near' });
    expect(now.flags).toEqual(['near']);
    expect(limitState(5000, now.school.spentPaise)).toBe('within'); // what delivered spend alone would have said

    // A limit of exactly what is counted: all of it is used, and the gate lets nothing more go.
    await setLimit(4 * ONE);
    expect((await seen()).school).toMatchObject({ budgetPaise: 4 * ONE, spentPaise: 2 * ONE, countedPaise: 4 * ONE, state: 'reached' });
    const next = await send();
    expect(next).toMatchObject({ status: 'blocked_budget' });
    held += 1;
    now = await seen();
    expect(gateSum(next.reason)).toBe(4 * ONE);
    expect(now.school).toMatchObject({ countedPaise: 4 * ONE, heldForBudget: held, state: 'reached' });
    expect(now.flags).toEqual(['reached']);
  });

  it('the page adds up the very rows the gate adds up', async () => {
    // A priced message whose send was interrupted ("uncertain") is on its way on the page, but the gate does not
    // count it. The page's "counted against the limit" follows the gate, not "spend and on its way" added together.
    await db.pg.query(
      `insert into communication_log (school_id, to_phone, channel, template_name, billing_category, billable, est_cost_paise, gst_paise, cost_basis, status, dedupe_key, provider_used, purpose, provider)
       values ($1, '+910000000000', 'whatsapp', 'absence_alert', 'utility', false, 1000, 180, 'rate_table', 'uncertain', 'limit-uncertain', 'platform_default', 'operational_communication', 'meta')`,
      [SCHOOL]
    );
    const next = await send();
    expect(next.status).toBe('blocked_budget');
    held += 1;
    const { school } = await seen();
    expect(gateSum(next.reason)).toBe(4 * ONE);
    expect(school.countedPaise).toBe(4 * ONE);
    expect(school.spentPaise + school.onItsWayPaise).toBe(5 * ONE);
    // And it cannot drift: the gate's budget check is built from the fragment the cost screens use.
    const gate = readFileSync('src/lib/whatsapp/gate.ts', 'utf8');
    expect(gate).toContain('${COUNTED_AGAINST_LIMIT}');
    expect(gate).not.toMatch(/billable = true or status = 'sent'/);
  });

  it('a message held because its category has no verified rate is not counted as held back by the limit', async () => {
    await setLimit(9_000_000);
    const before = await seen();
    expect(before.school).toMatchObject({ heldForBudget: held, heldNoRate: 0, state: 'within' });
    // Marketing has no rate on record: a real account does not send it, and the gate says why.
    const unpriced = await send('open_day_invite');
    expect(unpriced).toMatchObject({ status: 'blocked_budget', reason: expect.stringContaining('rate not verified') });
    const now = await seen();
    expect(now.school).toMatchObject({ heldForBudget: held, heldNoRate: 1, state: 'within' });
    expect(now.flags).toEqual([]); // the limit did not stop it: the school is not listed against its limit
    const marketing = now.data.byCategory.find((s) => s.schoolId === SCHOOL)!.categories.find((c) => c.category === 'marketing');
    expect(marketing).toMatchObject({ attempts: 1, heldForBudget: 0, heldNoRate: 1 });
    expect(now.data.totals).toMatchObject({ heldForBudget: held, heldNoRate: 1 });
    // In the list and the export it has its own column, beside "held back by the limit".
    const row = costCsvRows('en', [now.school])[0];
    expect([row[8], row[9]]).toEqual([held, 1]);
    // The school's own budget line counts what its budget held back, and not this message.
    expect(await asSchool((c) => schoolSpend(c, SCHOOL))).toMatchObject({ heldForBudget: held, heldNoRate: 1 });
  });

  it('with no limit set, what is held is for want of a limit, and the state says so', async () => {
    await setLimit(null);
    const stopped = await send();
    expect(stopped).toMatchObject({ status: 'blocked_budget', reason: expect.stringContaining('not configured') });
    held += 1;
    expect((await seen()).school).toMatchObject({ budgetPaise: null, heldForBudget: held, heldNoRate: 1, state: 'not_set' });
  });

  it('a month that is over: the limit in force at its end; with no change on record, the limit set now', async () => {
    const last = await seen(LAST);
    // Every change to Riverside's limit was made this month, and before the first of them it had none.
    expect(last.school).toMatchObject({ month: LAST, budgetPaise: null, countedPaise: 0, state: 'not_set' });
    // Quiet School's limit has never been changed through the app: nothing says it was ever anything else.
    expect(last.line(QUIET)).toMatchObject({ month: LAST, budgetPaise: 7000, countedPaise: 0, state: 'within' });
    expect((await seen()).line(QUIET)).toMatchObject({ month: THIS, budgetPaise: 7000, state: 'within' });
  });
});
