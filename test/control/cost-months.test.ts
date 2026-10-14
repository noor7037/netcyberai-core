import { randomUUID } from 'crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// Control → Messaging & Cost by month (docs/26 slice 8f, C205), on the whole real schema (every migration replayed
// on PGlite). The acceptance test: "A past month's spend equals the sum of that month's delivered, billable
// messages (counted by hand in the test). The export has the rows on the screen."
// Every school, person, rate and amount below is made up: none is Meta's price.

// Only the connection is replaced: the export route's own transaction helper runs on the test database, as the
// database role its session would get, with the same settings.
const h = vi.hoisted(() => ({ run: null as null | ((claims: { role: string; schoolId: string | null; sub: string }, fn: (db: unknown) => Promise<unknown>) => Promise<unknown>) }));
vi.mock('@/lib/auth/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/auth/db')>();
  return { ...real, withTenantContext: (claims: never, fn: never) => h.run!(claims, fn) };
});

import { GET as exportRoute } from '@/app/api/control/messaging-cost/export/route';
import { CostMonthPicker, CostMonthView } from '@/components/control/CostMonthView';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { signAccessToken } from '@/lib/auth/jwt';
import { COST_CSV_HEADER, COST_LIST_COLUMNS, HISTORY_MONTHS, loadCostMonth, loadHistory, loadMonthCategories, plainRupees } from '@/lib/control/messaging-cost';
import { LANG_COOKIE, langCookieValue, t } from '@/lib/i18n';
import { allSchoolSpend, indiaMonth, isCostMonth, limitState, monthToShow, schoolSpend, setSchoolBudget, shiftMonth } from '@/lib/whatsapp/cost';

const A = 'c8f00000-0000-4000-8000-000000000001';
const B = 'c8f00000-0000-4000-8000-000000000002';
const C = 'c8f00000-0000-4000-8000-000000000003';
const TEST_SCHOOL = 'c8f00000-0000-4000-8000-000000000004';
const FOUNDER = 'c8f00000-0000-4000-8000-000000000011';
const PRINCIPAL = 'c8f00000-0000-4000-8000-000000000012';
const TEACHER = 'c8f00000-0000-4000-8000-000000000013';

// India's months, from the same clock the code uses. Everything seeded sits in a month that is over.
const THIS = indiaMonth();
const LAST = shiftMonth(THIS, -1);
const TWO_BACK = shiftMonth(THIS, -2);
// A moment in India, written with India's offset: the database stores the instant.
const india = (month: string, day: number, time: string) => `${month}-${String(day).padStart(2, '0')}T${time}+05:30`;
const minutesBefore = (iso: string, minutes: number) => new Date(new Date(iso).getTime() - minutes * 60_000).toISOString();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
// A school's own session: the app's role, with the school, role and person set, so row level security applies.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asPrincipal = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', A], ['app.current_role', 'principal'], ['app.current_user_id', PRINCIPAL]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });

let n = 0;
type Row = { category?: string; provider?: string; billable?: boolean; cost?: number; gst?: number; basis?: string };
// One message in the log as the gate and the delivery notices would have left it, logged at `at`.
const logged = (school: string, status: string, at: string, o: Row = {}) =>
  db.pg.query(
    `insert into communication_log (school_id, to_phone, channel, template_name, billing_category, billable, est_cost_paise, gst_paise, cost_basis, status, dedupe_key, provider_used, purpose, provider, created_at)
     values ($1, '+919000000001', 'whatsapp', 'class_notice', $2, $3, $4, $5, $6, $7, $8, 'platform_default', 'operational_communication', $9, $10::timestamptz)`,
    [school, o.category ?? 'utility', o.billable ?? false, o.cost ?? 0, o.gst ?? 0, o.basis ?? 'not_billable', status, `cost-months-${++n}`, o.provider ?? 'meta', at]
  );
// Made-up prices: a utility message at 1,100 paise and a marketing one at 7,000, each with GST at 18 in a hundred.
const utility: Row = { category: 'utility', billable: true, cost: 1100, gst: 198, basis: 'rate_table' };
const marketing: Row = { category: 'marketing', billable: true, cost: 7000, gst: 1260, basis: 'rate_table' };
const priced: Row = { category: 'utility', cost: 1100, gst: 198, basis: 'rate_table' }; // sent, priced, not yet billable

// What was put into school A's log for LAST, added up by hand:
//   delivered utility 1,298 + read utility 1,298 + delivered utility 1,298 + delivered marketing 8,260 = 12,154 paise
//   (one more delivered, billable message has no verified rate: it is counted as delivered and adds nothing)
const A_LAST_SPENT = 1298 + 1298 + 1298 + 8260;
// Counted against the limit, as the send-gate adds it up: that spend, and the two priced messages still "sent" (one
// of them already flagged billable) at 1,298 each = 14,750 paise. The priced "uncertain" message is on its way but
// is not in the gate's sum.
const A_LAST_COUNTED = A_LAST_SPENT + 1298 + 1298;
const A_LAST_ROWS = 15;

function req(path: string, cookie?: string): NextRequest {
  return new NextRequest(`https://www.netcyberai.test${path}`, { method: 'GET', headers: cookie ? { cookie } : {} });
}
async function cookieFor(sub: string, role: string, schoolId: string | null) {
  const token = await signAccessToken({ sub, role: role as never, schoolId, membershipId: schoolId ? randomUUID() : null, tokenVersion: 0, aal: role === 'super_admin' ? 'aal2' : 'aal1', sessionId: randomUUID() });
  return `${ACCESS_COOKIE}=${token}`;
}
// A CSV as rows of cells: quoted cells, doubled quotes, CRLF line ends, the byte order mark taken off.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const body = text.replace(/^﻿/, '');
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') row.push(cell), (cell = '');
    else if (ch === '\r' && body[i + 1] === '\n') row.push(cell), rows.push(row), (row = []), (cell = ''), i++;
    else cell += ch;
  }
  return rows;
}
// The list of schools as a person reads it on the screen: each row's cells, in order, as text.
function screenRows(html: string): string[][] {
  const table = /<table data-cost-list[^>]*>([\s\S]*?)<\/table>/.exec(html)?.[1] ?? '';
  return [...table.matchAll(/<tr data-cost-list-row[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) => [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => c[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&')));
}
// The same amount is written "₹1,298.00" on the screen and 1298.00 in the file.
const plain = (cell: string) => cell.replace(/[₹,]/g, '');
const audits = async () => (await db.pg.query(`select actor_user_id, actor_role, school_id, target_type, target_id, after_state from audit_log where event_action = 'messaging_cost.exported' order by created_at, audit_id`)).rows;

describe('the rules', () => {
  it('a month is YYYY-MM in India’s calendar, and never a month after this one', () => {
    for (const ok of ['2026-01', '2026-12', '2031-07']) expect(isCostMonth(ok), ok).toBe(true);
    for (const bad of ['2026-13', '2026-00', '2026-1', '26-01', '2026-01-01', 'last month', '', null, undefined, 202601, ['2026-01']]) expect(isCostMonth(bad), String(bad)).toBe(false);
    expect(monthToShow('2026-08', '2026-10')).toBe('2026-08');
    expect(monthToShow('2026-10', '2026-10')).toBe('2026-10');
    expect(monthToShow('2026-11', '2026-10')).toBe('2026-10'); // a month that has not come yet
    expect(monthToShow('2027-01', '2026-10')).toBe('2026-10');
    expect(monthToShow(undefined, '2026-10')).toBe('2026-10');
    expect(monthToShow('october', '2026-10')).toBe('2026-10');
    expect(monthToShow(['2026-08', '2026-09'], '2026-10')).toBe('2026-10');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2025-12', 1)).toBe('2026-01');
    expect(shiftMonth('2026-10', -5)).toBe('2026-05');
    // India's month, not the server's: 20:00 UTC on the last day of September is already October in India.
    expect(indiaMonth(new Date('2026-09-30T20:00:00Z'))).toBe('2026-10');
    expect(indiaMonth(new Date('2026-09-30T18:00:00Z'))).toBe('2026-09');
  });

  it('near the limit is four fifths of it or more; at or over it is all of it; no limit is its own state', () => {
    expect(limitState(null, 0)).toBe('not_set');
    expect(limitState(null, 99999)).toBe('not_set');
    expect(limitState(1000, 0)).toBe('within');
    expect(limitState(1000, 799)).toBe('within');
    expect(limitState(1000, 800)).toBe('near'); // exactly four fifths
    expect(limitState(1000, 999)).toBe('near');
    expect(limitState(1000, 1000)).toBe('reached');
    expect(limitState(1000, 1001)).toBe('reached');
    expect(limitState(0, 0)).toBe('reached'); // a limit of nothing: nothing more is sent
    expect(limitState(3, 2)).toBe('within'); // two thirds, with no rounding up
  });

  it('a school the limit held a message back for is never "within" it, however little is counted', () => {
    expect(limitState(1000, 0, 1)).toBe('held'); // one dear message that would have passed the limit by itself
    expect(limitState(1000, 799, 2)).toBe('held');
    expect(limitState(1000, 900, 1)).toBe('held'); // rather than "near": the gate is already holding
    expect(limitState(1000, 1000, 4)).toBe('reached'); // all of it is counted: that says more
    expect(limitState(1000, 500, 0)).toBe('within');
    expect(limitState(null, 0, 3)).toBe('not_set'); // no limit is why they were held
  });

  it('an amount in the file is rupees with two decimals, in plain digits', () => {
    expect([0, 5, 50, 100, 1298, 12154, 250000, 100000000].map(plainRupees)).toEqual(['0.00', '0.05', '0.50', '1.00', '12.98', '121.54', '2500.00', '1000000.00']);
  });
});

describe('on the real schema', () => {
  let founder = '';
  let principal = '';
  let teacher = '';

  beforeAll(async () => {
    process.env.APP_SESSION_SECRET = 'test-only-secret-for-cost-months-tests-0123456789';
    db = await startHarnessDb({ port: 0 });
    h.run = (claims, fn) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db.pg.transaction(async (tx: any) => {
        await tx.query(`set local role ${claims.role === 'super_admin' ? 'nca_super' : 'app_user'}`);
        for (const [k, v] of [['app.current_tenant_id', claims.schoolId ?? '00000000-0000-0000-0000-000000000000'], ['app.current_role', claims.role], ['app.current_user_id', claims.sub]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
        return fn(tx);
      });
    // The limits set now: A 15,000 paise, B 1,500, C 2,000 (taken away below). The test school is not live.
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture, is_pilot, pilot_allow_outbound, monthly_budget_paise) values
        ('${A}', 'School A', 'IN-HR', false, false, true, 15000), ('${B}', 'School B', 'IN-HR', false, false, true, 1500),
        ('${C}', 'School C', 'IN-DL', false, false, true, 2000), ('${TEST_SCHOOL}', 'A Test School', 'IN-DL', true, false, true, 50000);
      insert into users (user_id, school_id, email, role, display_name) values
        ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal'), ('${TEACHER}', '${A}', 'teacher@school-a.example', 'teacher', 'Tara Teacher'),
        ('${FOUNDER}', null, 'founder@netcyberai.example', 'super_admin', 'The Founder');
    `);
    founder = await cookieFor(FOUNDER, 'super_admin', null);
    principal = await cookieFor(PRINCIPAL, 'principal', A);
    teacher = await cookieFor(TEACHER, 'teacher', A);

    // The record of limit changes, as setSchoolBudget writes it. Two changes lie in the past: A's limit was raised
    // from 5,000 to 15,000 on the 20th of LAST, and B's from 1,000 to 1,500 on the 6th of LAST. An audit row's time is
    // stamped by the database's own trigger and cannot be given by the writer, so these two rows are put in with the
    // triggers off, as only the test's superuser can. C's limit of 2,000 is taken away now, this month, by the app's
    // own function.
    const limitChanged = (school: string, at: string, before: number | null, after: number | null) =>
      db.pg.query(
        `insert into audit_log (school_id, actor_user_id, actor_role, event_action, target_type, target_id, before_state, after_state, occurred_at, created_at) values ($1, $2, 'super_admin', 'whatsapp.budget_set', 'schools', $3, $4, $5, $6::timestamptz, $6::timestamptz)`,
        [school, FOUNDER, school, JSON.stringify({ budgetPaise: before }), JSON.stringify({ budgetPaise: after, reason: 'Agreed with the principal on the phone.' }), at]
      );
    await db.pg.exec(`set session_replication_role = replica`);
    await limitChanged(A, india(LAST, 20, '10:00:00'), 5000, 15000);
    await limitChanged(B, india(LAST, 6, '09:00:00'), 1000, 1500);
    await db.pg.exec(`set session_replication_role = origin`);
    expect(await platform((c) => setSchoolBudget(c, { userId: FOUNDER }, C, null, 'The school asked to pause.'))).toEqual({ ok: true });

    // School A, LAST month: fifteen rows (A_LAST_ROWS).
    await logged(A, 'delivered', india(LAST, 3, '09:15:00'), utility);
    await logged(A, 'read', india(LAST, 9, '18:40:00'), utility);
    await logged(A, 'delivered', india(LAST, 21, '07:05:00'), utility);
    await logged(A, 'delivered', india(LAST, 12, '11:00:00'), marketing);
    await logged(A, 'delivered', india(LAST, 14, '11:00:00'), { category: 'utility', billable: true, basis: 'rate_not_verified' }); // delivered, no verified rate: adds nothing
    await logged(A, 'sent', india(LAST, 27, '16:30:00'), priced); // on its way: priced, never confirmed delivered
    await logged(A, 'uncertain', india(LAST, 27, '16:31:00'), priced);
    await logged(A, 'failed', india(LAST, 5, '10:00:00')); // a failed message costs nothing
    await logged(A, 'delivered', india(LAST, 6, '10:00:00'), { provider: 'stand-in' }); // the stand-in is never billable
    await logged(A, 'blocked_budget', india(LAST, 28, '08:00:00'));
    await logged(A, 'blocked_budget', india(LAST, 28, '08:01:00'), { category: 'marketing' });
    await logged(A, 'blocked_consent', india(LAST, 2, '08:00:00'));
    // "Delivered, billable": each word on its own. Three rows that are one and not the other; none is money spent.
    //   billable and priced, but only "sent": a "sent" notice on an interrupted send leaves a row so (delivery.ts);
    await logged(A, 'sent', india(LAST, 26, '12:00:00'), utility);
    //   flagged billable, but failed;
    await logged(A, 'failed', india(LAST, 26, '12:05:00'), { category: 'utility', billable: true });
    //   delivered and priced, but not billable (no path in the code leaves such a row: it is here for the word).
    await logged(A, 'delivered', india(LAST, 26, '12:10:00'), priced);
    // School A, other months: none of it is LAST's.
    await logged(A, 'delivered', india(THIS, 1, '00:30:00'), utility);
    await logged(A, 'delivered', india(TWO_BACK, 10, '12:00:00'), marketing);
    // Another school, the same month: one delivered message, and one held back on the 5th, the day before its limit
    // was raised. And a test school, which Control's cost view leaves out.
    await logged(B, 'delivered', india(LAST, 8, '12:00:00'), utility);
    await logged(B, 'blocked_budget', india(LAST, 5, '12:00:00'));
    await logged(TEST_SCHOOL, 'delivered', india(LAST, 8, '12:00:00'), utility);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('a past month’s spend equals the sum of that month’s delivered, billable messages, counted by hand', async () => {
    expect(A_LAST_SPENT).toBe(12154);
    expect(A_LAST_COUNTED).toBe(14750);
    const spend = await asPrincipal((c) => schoolSpend(c, A, LAST));
    // On its way: the two priced messages still "sent" and the priced "uncertain" one. None of them is spend.
    expect(spend).toEqual({ budgetPaise: 15000, spentPaise: A_LAST_SPENT, delivered: 5, onItsWayPaise: 3 * 1298, onItsWay: 3, countedPaise: A_LAST_COUNTED, heldForBudget: 2, heldNoRate: 0, month: LAST });
    // The same number, counted the long way from the log, with India's month worked out row by row.
    const byHand = (await db.pg.query(`select coalesce(sum(est_cost_paise + gst_paise), 0)::int as total, count(*)::int as rows from communication_log where school_id = $1 and billable and cost_basis = 'rate_table' and status::text in ('delivered', 'read') and to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM') = $2`, [A, LAST])).rows[0];
    expect(byHand).toEqual({ total: A_LAST_SPENT, rows: 4 });
    expect((await db.pg.query(`select count(*)::int as n from communication_log where school_id = $1 and to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM') = $2`, [A, LAST])).rows[0].n).toBe(A_LAST_ROWS);
    // "Delivered" and "billable" each do their own work: the month holds rows that are billable and not delivered,
    // and one that is delivered and priced and not billable. Counting either kind as spend would change the total above.
    const oneWordOnly = (await db.pg.query(
      `select count(*) filter (where billable and status::text not in ('delivered', 'read'))::int as billable_not_delivered,
              count(*) filter (where billable and cost_basis = 'rate_table' and status::text not in ('delivered', 'read'))::int as of_them_priced,
              count(*) filter (where not billable and cost_basis = 'rate_table' and status::text in ('delivered', 'read'))::int as delivered_priced_not_billable
         from communication_log where school_id = $1 and to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM') = $2`,
      [A, LAST]
    )).rows[0];
    expect(oneWordOnly).toEqual({ billable_not_delivered: 2, of_them_priced: 1, delivered_priced_not_billable: 1 });
    // The months on either side are their own.
    expect(await asPrincipal((c) => schoolSpend(c, A, TWO_BACK))).toMatchObject({ spentPaise: 8260, delivered: 1, onItsWay: 0, heldForBudget: 0, month: TWO_BACK });
    expect(await asPrincipal((c) => schoolSpend(c, A, THIS))).toMatchObject({ spentPaise: 1298, delivered: 1, month: THIS });
    // With no month given it is this month, as before.
    expect(await asPrincipal((c) => schoolSpend(c, A))).toEqual(await asPrincipal((c) => schoolSpend(c, A, THIS)));
    // A month with nothing logged is all zeros, with the limit still shown.
    expect(await asPrincipal((c) => schoolSpend(c, A, shiftMonth(THIS, -9)))).toEqual({ budgetPaise: 15000, spentPaise: 0, delivered: 0, onItsWayPaise: 0, onItsWay: 0, countedPaise: 0, heldForBudget: 0, heldNoRate: 0, month: shiftMonth(THIS, -9) });
  });

  it('Control’s list for a past month: every live school in one query, the same figures, test schools left out', async () => {
    let queries = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all = await platform((c) => allSchoolSpend({ query: (...a: any[]) => (queries++, c.query(...a)) } as never, LAST));
    expect(queries).toBe(1);
    // (The limit here is the one set now; the list on the screen puts the limit of that month in its place, below.)
    expect(all.map((s) => [s.schoolName, s.month, s.budgetPaise, s.spentPaise, s.delivered, s.onItsWay, s.onItsWayPaise, s.countedPaise, s.heldForBudget, s.heldNoRate])).toEqual([
      ['School A', LAST, 15000, A_LAST_SPENT, 5, 3, 3894, A_LAST_COUNTED, 2, 0],
      ['School B', LAST, 1500, 1298, 1, 0, 0, 1298, 1, 0],
      ['School C', LAST, null, 0, 0, 0, 0, 0, 0, 0],
    ]);
    // Each line is the school's own month, as the school itself reads it.
    expect(all[0]).toMatchObject(await asPrincipal((c) => schoolSpend(c, A, LAST)));
    // With no month given it is this month, as before.
    expect((await platform((c) => allSchoolSpend(c))).map((s) => [s.schoolName, s.month, s.spentPaise])).toEqual([['School A', THIS, 1298], ['School B', THIS, 0], ['School C', THIS, 0]]);
  });

  it('a message at 23:50 India time on a month’s last day belongs to that month, and one at 00:10 to the next', async () => {
    const midnight = india(LAST, 1, '00:00:00'); // the first instant of LAST in India
    await logged(C, 'delivered', minutesBefore(midnight, 10), { category: 'utility', billable: true, cost: 500, gst: 90, basis: 'rate_table' }); // 23:50 on TWO_BACK's last day
    await logged(C, 'delivered', india(LAST, 1, '00:10:00'), { category: 'utility', billable: true, cost: 700, gst: 126, basis: 'rate_table' });
    await logged(C, 'delivered', midnight, { category: 'utility', billable: true, cost: 300, gst: 54, basis: 'rate_table' }); // midnight itself opens the new month
    // By the server's clock (UTC) the 00:10 message is still in the earlier month: only India's calendar puts it right.
    expect(new Date(india(LAST, 1, '00:10:00')).toISOString().slice(0, 7)).toBe(TWO_BACK);
    expect(await platform((c) => schoolSpend(c, C, TWO_BACK))).toMatchObject({ spentPaise: 590, delivered: 1 });
    expect(await platform((c) => schoolSpend(c, C, LAST))).toMatchObject({ spentPaise: 826 + 354, delivered: 2 });
    const list = (month: string) => platform(async (c) => (await allSchoolSpend(c, month)).find((s) => s.schoolId === C)!.spentPaise);
    expect([await list(TWO_BACK), await list(LAST), await list(THIS)]).toEqual([590, 1180, 0]);
  });

  it('the month by category is the list of schools split by category: counted the same way, with attempts beside', async () => {
    const list = await platform((c) => allSchoolSpend(c, LAST));
    const { byCategory, totals } = await platform((c) => loadMonthCategories(c, LAST));
    expect(byCategory.map((s) => [s.schoolName, s.categories.map((c) => c.category)])).toEqual([['School A', ['marketing', 'utility']], ['School B', ['utility']], ['School C', ['utility']]]);
    const sum = (schoolId: string, key: 'spentPaise' | 'delivered' | 'onItsWay' | 'onItsWayPaise' | 'heldForBudget' | 'heldNoRate' | 'attempts' | 'rateNotVerified') => byCategory.find((s) => s.schoolId === schoolId)!.categories.reduce((a, c) => a + c[key], 0);
    for (const school of list) for (const key of ['spentPaise', 'delivered', 'onItsWay', 'onItsWayPaise', 'heldForBudget', 'heldNoRate'] as const) expect(sum(school.schoolId, key), `${school.schoolName} ${key}`).toBe(school[key]);
    const a = Object.fromEntries(byCategory[0].categories.map((c) => [c.category, c]));
    expect(a.marketing).toMatchObject({ attempts: 2, delivered: 1, costPaise: 7000, gstPaise: 1260, spentPaise: 8260, onItsWay: 0, heldForBudget: 1, heldNoRate: 0, rateNotVerified: 0 });
    expect(a.utility).toMatchObject({ attempts: 13, delivered: 4, costPaise: 3300, gstPaise: 594, spentPaise: 3894, onItsWay: 3, onItsWayPaise: 3894, heldForBudget: 1, heldNoRate: 0, rateNotVerified: 1 });
    expect(sum(A, 'attempts')).toBe(A_LAST_ROWS); // every message logged, whatever became of it
    expect(totals).toMatchObject({ spentPaise: list.reduce((x, s) => x + s.spentPaise, 0), delivered: list.reduce((x, s) => x + s.delivered, 0), attempts: A_LAST_ROWS + 2 + 2 });
    expect(totals.costPaise + totals.gstPaise).toBe(totals.spentPaise);
  });

  it('six months of each school’s spend are the same months, one by one; the picker runs from the first message to this month', async () => {
    const history = await platform((c) => loadHistory(c, THIS));
    expect(history.months).toHaveLength(HISTORY_MONTHS);
    expect(history.months).toEqual([-5, -4, -3, -2, -1, 0].map((by) => shiftMonth(THIS, by)));
    expect(history.schools.map((s) => s.schoolName)).toEqual(['School A', 'School B', 'School C']);
    for (const [i, month] of history.months.entries()) {
      const list = await platform((c) => allSchoolSpend(c, month));
      expect(history.schools.map((s) => s.spentPaise[i]), month).toEqual(list.map((s) => s.spentPaise));
    }
    expect(history.schools[0].spentPaise.slice(-3)).toEqual([8260, A_LAST_SPENT, 1298]);
    // Ending with an earlier month, the table ends there.
    expect((await platform((c) => loadHistory(c, LAST))).schools[0].spentPaise.slice(-2)).toEqual([8260, A_LAST_SPENT]);

    const shown = await platform((c) => loadCostMonth(c, LAST, THIS));
    expect(shown).toMatchObject({ month: LAST, thisMonth: THIS, months: [THIS, LAST, TWO_BACK], firstMonth: TWO_BACK });
    expect(shown.schools.map((s) => [s.schoolName, s.state])).toEqual([['School A', 'held'], ['School B', 'near'], ['School C', 'within']]);
    // A month from before the first message can still be asked for in the address: it is offered too, and is empty.
    const early = await platform((c) => loadCostMonth(c, shiftMonth(THIS, -9), THIS));
    expect([early.months, early.firstMonth]).toEqual([[THIS, LAST, TWO_BACK, shiftMonth(THIS, -9)], shiftMonth(THIS, -9)]);
    expect([early.byCategory, early.schools.map((s) => s.spentPaise)]).toEqual([[], [0, 0, 0]]);

    // The month switch as it is drawn: those months, the shown one chosen, one step either way where there is one.
    const picker = (data: typeof shown) => renderToStaticMarkup(createElement(CostMonthPicker, { data, lang: 'en' }));
    const options = (html: string) => [...html.matchAll(/<option value="([^"]+)"( selected="")?/g)].map((m) => (m[2] ? `${m[1]} chosen` : m[1]));
    const steps = (html: string) => [...html.matchAll(/href="\/control\/messaging-cost\?month=([^"]+)"/g)].map((m) => m[1]);
    expect(options(picker(shown))).toEqual([THIS, `${LAST} chosen`, TWO_BACK]);
    expect(steps(picker(shown))).toEqual([TWO_BACK, THIS]);
    expect(steps(picker(await platform((c) => loadCostMonth(c, THIS, THIS))))).toEqual([LAST]); // nothing after this month
    expect(steps(picker(await platform((c) => loadCostMonth(c, TWO_BACK, THIS))))).toEqual([LAST]); // nothing before the first message

    // The select is drawn afresh for each month: its key is the month shown. "Earlier month" and "Later month" change
    // the month without loading the page afresh, and a select that was kept would go on naming the month shown
    // before (the real-browser run clicks the links and reads the select: scripts/harness/run.mjs, costMonth).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const find = (node: any, type: string): any => (!node || typeof node !== 'object' ? null : Array.isArray(node) ? (node.map((x) => find(x, type)).find(Boolean) ?? null) : node.type === type ? node : find(node.props?.children, type));
    for (const data of [shown, early]) {
      const select = find(CostMonthPicker({ data, lang: 'en' }), 'select');
      expect([select.key, select.props.defaultValue]).toEqual([data.month, data.month]);
    }
  });

  it('a month that is over is judged against the limit in force at its end, read from the record of limit changes', async () => {
    const lines = async (month: string) => (await platform((c) => loadCostMonth(c, month, THIS))).schools.map((s) => [s.schoolName, s.budgetPaise, s.countedPaise, s.heldForBudget, s.state]);
    // Two months back A's limit was still 5,000 paise (it was raised on the 20th of LAST): 8,260 counted is over
    // it. Against the 15,000 set now the same month would have read "within". B's was 1,000; C's 2,000.
    expect(await lines(TWO_BACK)).toEqual([['School A', 5000, 8260, 0, 'reached'], ['School B', 1000, 0, 0, 'within'], ['School C', 2000, 590, 0, 'within']]);
    expect(limitState(15000, 8260)).toBe('within');
    // LAST. A: 14,750 of 15,000 is counted, and the limit held two messages back after it was raised. B: its one
    // message was held back on the 5th under the limit of 1,000; the 1,500 in force at the month's end held nothing,
    // so B is judged on what is counted (1,298 of 1,500: near) and the held message stays in its own column.
    // C: 1,180 of the 2,000 it had then. Against the limit set now (none) it would have read "nothing is sent".
    expect(await lines(LAST)).toEqual([['School A', 15000, A_LAST_COUNTED, 2, 'held'], ['School B', 1500, 1298, 1, 'near'], ['School C', 2000, 1180, 0, 'within']]);
    // This month: the limit set now, the one the send-gate reads.
    expect(await lines(THIS)).toEqual([['School A', 15000, 1298, 0, 'within'], ['School B', 1500, 0, 0, 'within'], ['School C', null, 0, 0, 'not_set']]);
    // Nine months back, before every change on record: what each limit was before its first change.
    expect((await lines(shiftMonth(THIS, -9))).map((l) => [l[0], l[1]])).toEqual([['School A', 5000], ['School B', 1000], ['School C', 2000]]);
    // The screen says which limit a past month shows, and says nothing of the kind for this month.
    const page = async (month: string) => renderToStaticMarkup(createElement(CostMonthView, { data: await platform((c) => loadCostMonth(c, month, THIS)), lang: 'en' }));
    expect(await page(LAST)).toContain(t('en', 'cost.month.limitThen'));
    expect(await page(THIS)).not.toContain('data-cost-limit-then');
  });

  it('a school’s own session cannot call the export, and reads no other school’s month from the database', async () => {
    const before = (await audits()).length;
    expect((await exportRoute(req(`/api/control/messaging-cost/export?month=${LAST}`))).status).toBe(401);
    for (const cookie of [principal, teacher]) {
      const res = await exportRoute(req(`/api/control/messaging-cost/export?month=${LAST}`, cookie));
      expect(res.status).toBe(403);
      expect(res.headers.get('content-type')).not.toContain('text/csv');
      expect(await res.text()).not.toContain('School');
    }
    expect((await audits()).length).toBe(before);
    // The database holds it too: as the school's own role, the list is that school alone, and the table by category likewise.
    expect((await asPrincipal((c) => allSchoolSpend(c, LAST))).map((s) => s.schoolName)).toEqual(['School A']);
    expect((await asPrincipal((c) => loadMonthCategories(c, LAST))).byCategory.map((s) => s.schoolName)).toEqual(['School A']);
    expect(await asPrincipal((c) => schoolSpend(c, B, LAST))).toMatchObject({ budgetPaise: null, spentPaise: 0, delivered: 0 });
  });

  it('the export has the rows on the screen, as numbers in rupees, and leaves an audit row', async () => {
    const res = await exportRoute(req(`/api/control/messaging-cost/export?month=${LAST}`, founder));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="messaging-cost-${LAST}.csv"`);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const [header, ...rows] = parseCsv(await res.text());
    expect(header).toEqual(COST_CSV_HEADER.map((k) => t('en', k)));
    // Counted by hand: 12,154 paise is 121.54 rupees; three on their way at 12.98 each; 14,750 paise counted against
    // the limit. Each limit is the one in force at the end of LAST (C's has since been taken away).
    expect(rows).toEqual([
      [LAST, 'School A', '150.00', '121.54', '5', '3', '38.94', '147.50', '2', '0', 'Limit held messages back'],
      [LAST, 'School B', '15.00', '12.98', '1', '0', '0.00', '12.98', '1', '0', 'Near the limit'],
      [LAST, 'School C', '20.00', '11.80', '2', '0', '0.00', '11.80', '0', '0', 'Within the limit'],
    ]);

    // The screen, drawn from what the page loads for the same month: the same schools, in the same order, cell for cell.
    const data = await platform((c) => loadCostMonth(c, LAST, THIS));
    const html = renderToStaticMarkup(createElement(CostMonthView, { data, lang: 'en' }));
    const screen = screenRows(html);
    expect(screen).toHaveLength(3);
    expect(screen[0]).toEqual(['School A', '₹150.00', '₹121.54', '5', '3', '₹38.94', '₹147.50', '2', '0', 'Limit held messages back']);
    expect(screen.map((r) => r.map(plain))).toEqual(rows.map((r) => r.slice(1)));
    expect(COST_CSV_HEADER.length).toBe(COST_LIST_COLUMNS.length + 1); // the file has the screen's columns, and the month in front
    // The screen names the month, lists the school its limit held back before the one near its limit, with the
    // figure each is judged on, and says once what each figure counts.
    expect(html).toContain(`data-cost-month="${LAST}"`);
    expect([...html.matchAll(/data-cost-flag="(\w+)"/g)].map((m) => m[1])).toEqual(['held', 'near']);
    expect(html).toContain(t('en', 'cost.month.flagged.line', { counted: '₹147.50', limit: '₹150.00', held: '2' }));
    expect(html.match(/data-cost-counts/g)).toHaveLength(1);
    expect(html).toContain(t('en', 'cost.month.limitThen')); // a past month shows the limit in force at its end, and says so

    // One audit row: who, which month, how many rows. No amount and no school's name.
    const audit = await audits();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toEqual({ actor_user_id: FOUNDER, actor_role: 'super_admin', school_id: null, target_type: 'messaging_cost', target_id: LAST, after_state: { month: LAST, rows: 3, language: 'en' } });
  });

  it('this month by default; a month that is not one, or has not come, is refused and nothing is written', async () => {
    const res = await exportRoute(req('/api/control/messaging-cost/export', founder));
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="messaging-cost-${THIS}.csv"`);
    expect(parseCsv(await res.text()).slice(1).map((r) => r.slice(0, 4))).toEqual([[THIS, 'School A', '150.00', '12.98'], [THIS, 'School B', '15.00', '0.00'], [THIS, 'School C', 'Not set', '0.00']]);
    const before = (await audits()).length;
    for (const bad of [shiftMonth(THIS, 1), '2026-13', 'october', `${LAST}-01`, '']) {
      const refused = await exportRoute(req(`/api/control/messaging-cost/export?month=${encodeURIComponent(bad)}`, founder));
      expect(refused.status, bad).toBe(400);
    }
    expect((await audits()).length).toBe(before);
  });

  it('the file is in the person’s language: the same rows, Hindi headings', async () => {
    const res = await exportRoute(req(`/api/control/messaging-cost/export?month=${LAST}`, `${founder}; ${LANG_COOKIE}=${langCookieValue(FOUNDER, 'hi')}`));
    const [header, ...rows] = parseCsv(await res.text());
    expect(header).toEqual(COST_CSV_HEADER.map((k) => t('hi', k)));
    expect(rows.map((r) => r.slice(0, 10))).toEqual([
      [LAST, 'School A', '150.00', '121.54', '5', '3', '38.94', '147.50', '2', '0'],
      [LAST, 'School B', '15.00', '12.98', '1', '0', '0.00', '12.98', '1', '0'],
      [LAST, 'School C', '20.00', '11.80', '2', '0', '0.00', '11.80', '0', '0'],
    ]);
    expect(rows.map((r) => r[10])).toEqual([t('hi', 'cost.month.state.held'), t('hi', 'cost.month.state.near'), t('hi', 'cost.month.state.within')]);
    // A limit that is not set is said in the person's language too: this month, C has none.
    const now = parseCsv(await (await exportRoute(req('/api/control/messaging-cost/export', `${founder}; ${LANG_COOKIE}=${langCookieValue(FOUNDER, 'hi')}`))).text());
    expect(now.slice(1).map((r) => [r[1], r[2], r[10]])).toEqual([['School A', '150.00', t('hi', 'cost.month.state.within')], ['School B', '15.00', t('hi', 'cost.month.state.within')], ['School C', t('hi', 'cost.month.notSet'), t('hi', 'cost.month.state.not_set')]]);
  });
});
