import type { PoolClient } from 'pg';
import type { CsvValue } from '@/lib/export/csv';
import { t, type Lang, type MessageKey } from '@/lib/i18n';
import { allSchoolSpend, BILLING_CATEGORIES, HELD_BY_LIMIT, limitState, LOGGED_IN_MONTH, monthCte, shiftMonth, SPEND_FIGURES, type LimitState, type SchoolSpend } from '@/lib/whatsapp/cost';

// Messaging cost for Control: read only, live schools, straight from communication_log as the send-gate and the
// delivery notices left it. Nothing is estimated here: a message without a verified rate adds zero and is counted
// apart.
//
//   - A MONTH (docs/26 slice 8f, C205): the page shows one month of India's calendar. Every figure on it is counted
//     by the rule in src/lib/whatsapp/cost.ts, the same one a school's own budget line reads: the list of schools,
//     the table by category and the six months cannot disagree, because they are the same SQL.
//   - AGAINST THE LIMIT: a school's state is judged on what the send-gate counts against the limit (delivered spend
//     and what is on its way), and on whether the gate held a message back under that limit. For a month that is
//     over, the limit is the one in force at that month's end, read from the record of limit changes.
//   - THE LAST 30 DAYS (T7, C140): the first version of this view, kept as the read-back of what the send-gate
//     recorded (test/whatsapp/send-gate-cost.test.ts). No screen shows it since C205.
//   - THE RATES on record, with where and when each was verified.

type Sql = Pick<PoolClient, 'query'>;

export { BILLING_CATEGORIES };
export type BillingCategoryId = (typeof BILLING_CATEGORIES)[number];

export type CostLine = { attempts: number; billable: number; costPaise: number; gstPaise: number; rateNotVerified: number };
export type Rate = { category: string; ratePaise: number; gstPercent: number; effectiveFrom: string; verifiedSource: string; verifiedAt: string; inForce: boolean };
export type MessagingCost = {
  days: 30;
  schools: (CostLine & { schoolId: string; schoolName: string; categories: (CostLine & { category: string })[] })[];
  totals: CostLine;
  rates: Rate[];
  // Categories with no rate in force today: their messages are "rate not verified".
  categoriesWithoutRate: string[];
};

const line = (r: Record<string, any>): CostLine => ({ attempts: Number(r.attempts), billable: Number(r.billable), costPaise: Number(r.cost), gstPaise: Number(r.gst), rateNotVerified: Number(r.unverified) });

// The rates on record, newest first in each category, and the categories with none in force today.
export async function loadRates(db: Sql): Promise<{ rates: Rate[]; categoriesWithoutRate: string[] }> {
  const rateRows = await db.query(
    `select r.billing_category as category, r.rate_paise, r.gst_percent, r.effective_from::text as effective_from, r.verified_source, r.verified_at,
            r.rate_id = (select r2.rate_id from message_rate_table r2
                         where r2.channel = 'whatsapp' and r2.billing_category = r.billing_category and r2.effective_from <= (now() at time zone 'Asia/Kolkata')::date
                         order by r2.effective_from desc, r2.created_at desc limit 1) as in_force
     from message_rate_table r
     where r.channel = 'whatsapp'
     order by r.billing_category, r.effective_from desc`
  );
  const rates = rateRows.rows.map((r) => ({ category: r.category as string, ratePaise: Number(r.rate_paise), gstPercent: Number(r.gst_percent), effectiveFrom: r.effective_from as string, verifiedSource: r.verified_source as string, verifiedAt: new Date(r.verified_at).toISOString(), inForce: r.in_force === true }));
  const withRate = new Set(rates.filter((r) => r.inForce).map((r) => r.category));
  return { rates, categoriesWithoutRate: BILLING_CATEGORIES.filter((c) => !withRate.has(c)) };
}

// The last 30 days, as the send-gate recorded them. Runs as the founder (nca_super).
export async function loadMessagingCost(db: Sql): Promise<MessagingCost> {
  const { rows } = await db.query(
    `select s.school_id, s.name, coalesce(l.billing_category, 'not set') as category,
            count(*) as attempts,
            count(*) filter (where l.billable) as billable,
            -- Only what was costed from the rate table is money. Rows from before
            -- C140 carry a made-up placeholder amount and no cost_basis: they
            -- add nothing here and are counted as "rate not verified".
            coalesce(sum(l.est_cost_paise) filter (where l.billable and l.cost_basis = 'rate_table'), 0) as cost,
            coalesce(sum(l.gst_paise) filter (where l.billable and l.cost_basis = 'rate_table'), 0) as gst,
            count(*) filter (where l.billable and l.cost_basis is distinct from 'rate_table') as unverified
     from communication_log l
     join schools s on s.school_id = l.school_id
     where s.is_test_fixture = false and l.channel = 'whatsapp' and l.created_at > now() - interval '30 days'
     group by s.school_id, s.name, coalesce(l.billing_category, 'not set')
     order by lower(s.name), s.school_id, category`
  );
  const schools: MessagingCost['schools'] = [];
  for (const r of rows) {
    let school = schools.find((s) => s.schoolId === r.school_id);
    if (!school) {
      school = { schoolId: r.school_id, schoolName: r.name, attempts: 0, billable: 0, costPaise: 0, gstPaise: 0, rateNotVerified: 0, categories: [] };
      schools.push(school);
    }
    const l = line(r);
    school.categories.push({ category: r.category, ...l });
    for (const k of ['attempts', 'billable', 'costPaise', 'gstPaise', 'rateNotVerified'] as const) school[k] += l[k];
  }
  const totals: CostLine = { attempts: 0, billable: 0, costPaise: 0, gstPaise: 0, rateNotVerified: 0 };
  for (const s of schools) for (const k of ['attempts', 'billable', 'costPaise', 'gstPaise', 'rateNotVerified'] as const) totals[k] += s[k];
  return { days: 30, schools, totals, ...(await loadRates(db)) };
}

// ---------------------------------------------------------------------------------------------------------------
// One month (C205).

// A category's month for one school. `spentPaise` is cost and GST together: the same figure as the school's line.
// `heldForBudget`: held back by the limit. `heldNoRate`: held because the category had no verified rate.
// `rateNotVerified`: delivered, with no verified rate to cost it by.
export type MonthLine = { attempts: number; delivered: number; costPaise: number; gstPaise: number; spentPaise: number; onItsWay: number; onItsWayPaise: number; heldForBudget: number; heldNoRate: number; rateNotVerified: number };
const MONTH_LINE_KEYS = ['attempts', 'delivered', 'costPaise', 'gstPaise', 'spentPaise', 'onItsWay', 'onItsWayPaise', 'heldForBudget', 'heldNoRate', 'rateNotVerified'] as const;
const noLine = (): MonthLine => ({ attempts: 0, delivered: 0, costPaise: 0, gstPaise: 0, spentPaise: 0, onItsWay: 0, onItsWayPaise: 0, heldForBudget: 0, heldNoRate: 0, rateNotVerified: 0 });

export type SchoolCategories = { schoolId: string; schoolName: string; categories: (MonthLine & { category: string })[] };
// A school's line in the list: its month, the limit the month is judged against (`budgetPaise`: the one set now for
// this month, the one in force at the month's end for a month that is over), and where the school stands against it.
export type SchoolMonth = SchoolSpend & { state: LimitState };
export type CostMonth = {
  month: string; // the month shown, YYYY-MM
  thisMonth: string; // India's month today: no later month can be shown
  months: string[]; // what the month picker offers, newest first: from the first logged message to this month
  firstMonth: string; // the month of the first logged message, or the month shown when that is earlier: nothing is before it
  schools: SchoolMonth[]; // every live school, in the order of the screen and of the export
  byCategory: SchoolCategories[]; // only schools and categories with a message logged in the month
  totals: MonthLine;
  history: { months: string[]; schools: { schoolId: string; schoolName: string; spentPaise: number[] }[] }; // six months ending with the month shown, oldest first
  rates: Rate[];
  categoriesWithoutRate: string[];
};

export const HISTORY_MONTHS = 6;
// The picker never lists more than this many months; an older one can still be asked for in the address.
const PICKER_MONTHS = 60;

// The limit each live school's month is judged against, and how many messages that limit held back.
//   - This month: the limit set now, the one the send-gate reads.
//   - A month that is over: the limit in force at its end. A limit is not kept month by month, but every change
//     writes a whatsapp.budget_set audit row with the limit before and after (setSchoolBudget, the only place a
//     limit is changed): the last change before the month ended says what the limit had become; with none, the
//     first change after it says what the limit had been; with no change on record it was never changed, and is the
//     one set now.
//   - Held under it: the month's messages the limit held back since that limit was set. A message held before the
//     limit was changed says nothing about the limit that replaced it.
// Runs as the founder (nca_super): only the platform reads every school's audit rows.
async function limitsInForce(db: Sql, month: string, thisMonth: string): Promise<Map<string, { budgetPaise: number | null; heldUnderLimit: number }>> {
  const monthEnd = `((m.first + interval '1 month') at time zone 'Asia/Kolkata')`;
  const { rows } = await db.query(
    `with ${monthCte('$1')},
     lim as (
       select s.school_id, s.monthly_budget_paise as set_now, b.changed_at as set_at, b.found as changed_before, b.paise as became, a.found as changed_after, a.paise as had_been
         from m cross join schools s
         left join lateral (
           select true as found, x.occurred_at as changed_at, (x.after_state ->> 'budgetPaise')::bigint as paise from audit_log x
            where x.school_id = s.school_id and x.event_action = 'whatsapp.budget_set' and x.occurred_at < ${monthEnd}
            order by x.occurred_at desc, x.audit_id desc limit 1) b on true
         left join lateral (
           select true as found, (x.before_state ->> 'budgetPaise')::bigint as paise from audit_log x
            where x.school_id = s.school_id and x.event_action = 'whatsapp.budget_set' and x.occurred_at >= ${monthEnd}
            order by x.occurred_at, x.audit_id limit 1) a on true
        where s.is_test_fixture = false
     )
     select lim.school_id, lim.set_now, lim.changed_before, lim.became, lim.changed_after, lim.had_been,
            (select count(*) from communication_log l
              where l.school_id = lim.school_id and l.channel = 'whatsapp' and ${LOGGED_IN_MONTH} and ${HELD_BY_LIMIT}
                and (lim.set_at is null or l.created_at >= lim.set_at)) as held_under
       from lim cross join m`,
    [`${month}-01`]
  );
  const paise = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const over = month < thisMonth;
  return new Map(rows.map((r) => [r.school_id as string, { budgetPaise: paise(!over ? r.set_now : r.changed_before ? r.became : r.changed_after ? r.had_been : r.set_now), heldUnderLimit: Number(r.held_under) }]));
}

// Every live school's month with its limit and its state: the rows of the list on the screen and of the export.
export async function loadSchoolMonths(db: Sql, month: string, thisMonth: string): Promise<SchoolMonth[]> {
  const limits = await limitsInForce(db, month, thisMonth);
  return (await allSchoolSpend(db, month)).map((s) => {
    const limit = limits.get(s.schoolId) ?? { budgetPaise: s.budgetPaise, heldUnderLimit: s.heldForBudget };
    return { ...s, budgetPaise: limit.budgetPaise, state: limitState(limit.budgetPaise, s.countedPaise, limit.heldUnderLimit) };
  });
}

// The month's messages by school and category: the school list's figures, split by Meta's category, and attempts
// (every message logged, whatever became of it).
export async function loadMonthCategories(db: Sql, month: string): Promise<{ byCategory: SchoolCategories[]; totals: MonthLine }> {
  const { rows } = await db.query(
    `with ${monthCte('$1')}
     select s.school_id, s.name, coalesce(l.billing_category, 'not set') as category, count(*) as attempts,
            ${SPEND_FIGURES}
       from m cross join schools s join communication_log l on l.school_id = s.school_id and l.channel = 'whatsapp' and ${LOGGED_IN_MONTH}
      where s.is_test_fixture = false
      group by s.school_id, s.name, coalesce(l.billing_category, 'not set')
      order by lower(s.name), s.school_id, category`,
    [`${month}-01`]
  );
  const byCategory: SchoolCategories[] = [];
  const totals = noLine();
  for (const r of rows) {
    let school = byCategory.find((s) => s.schoolId === r.school_id);
    if (!school) byCategory.push((school = { schoolId: r.school_id, schoolName: r.name, categories: [] }));
    const spent = Number(r.spent);
    const gst = Number(r.gst);
    const l: MonthLine = { attempts: Number(r.attempts), delivered: Number(r.delivered), costPaise: spent - gst, gstPaise: gst, spentPaise: spent, onItsWay: Number(r.on_its_way), onItsWayPaise: Number(r.on_its_way_cost), heldForBudget: Number(r.held), heldNoRate: Number(r.held_no_rate), rateNotVerified: Number(r.unverified) };
    school.categories.push({ category: r.category as string, ...l });
    for (const k of MONTH_LINE_KEYS) totals[k] += l[k];
  }
  return { byCategory, totals };
}

// Each live school's delivered spend in the `count` months ending with `month`, oldest first.
export async function loadHistory(db: Sql, month: string, count: number = HISTORY_MONTHS): Promise<CostMonth['history']> {
  const months = Array.from({ length: count }, (_, i) => shiftMonth(month, i - (count - 1)));
  const { rows } = await db.query(
    `with ${monthCte('$1')}, months as (select (m.first - make_interval(months => g))::date as first from m, generate_series(0, $2::int - 1) g)
     select s.school_id, s.name, to_char(m.first, 'YYYY-MM') as month,
            ${SPEND_FIGURES}
       from months m cross join schools s left join communication_log l on l.school_id = s.school_id and l.channel = 'whatsapp' and ${LOGGED_IN_MONTH}
      where s.is_test_fixture = false
      group by s.school_id, s.name, m.first
      order by lower(s.name), s.school_id, m.first`,
    [`${month}-01`, count]
  );
  const schools: CostMonth['history']['schools'] = [];
  for (const r of rows) {
    let school = schools.find((s) => s.schoolId === r.school_id);
    if (!school) schools.push((school = { schoolId: r.school_id, schoolName: r.name, spentPaise: months.map(() => 0) }));
    const at = months.indexOf(r.month as string);
    if (at >= 0) school.spentPaise[at] = Number(r.spent);
  }
  return { months, schools };
}

// Everything the page shows for one month. Runs as the founder (nca_super); the caller is /control, guarded by its
// layout. `month` has already been checked (monthToShow): a real month, no later than `thisMonth`.
export async function loadCostMonth(db: Sql, month: string, thisMonth: string): Promise<CostMonth> {
  const schools = await loadSchoolMonths(db, month, thisMonth);
  const { byCategory, totals } = await loadMonthCategories(db, month);
  const history = await loadHistory(db, month);
  const first = (await db.query(
    `select to_char(min(l.created_at) at time zone 'Asia/Kolkata', 'YYYY-MM') as first
       from communication_log l join schools s on s.school_id = l.school_id
      where s.is_test_fixture = false and l.channel = 'whatsapp'`
  )).rows[0]?.first as string | null | undefined;
  const months: string[] = [];
  for (let m = thisMonth; months.length < PICKER_MONTHS && m >= (first && first < thisMonth ? first : thisMonth); m = shiftMonth(m, -1)) months.push(m);
  if (!months.includes(month)) months.push(month);
  months.sort().reverse();
  return { month, thisMonth, months, firstMonth: first && first < month ? first : month, schools, byCategory, totals, history, ...(await loadRates(db)) };
}

// ---------------------------------------------------------------------------------------------------------------
// The list of schools as rows: what the screen shows and what the export writes come from this one function, so
// the file has the rows on the screen. No personal data: a school's name and its counts.

// Paise as rupees with two decimals, in plain digits: "1298.00". For a file; the screen adds the sign and commas.
export function plainRupees(paise: number): string {
  const whole = Math.trunc(Math.abs(paise) / 100);
  return `${paise < 0 ? '-' : ''}${whole}.${String(Math.abs(paise) % 100).padStart(2, '0')}`;
}

export const LIMIT_STATE_KEY: Record<LimitState, MessageKey> = { not_set: 'cost.month.state.not_set', within: 'cost.month.state.within', near: 'cost.month.state.near', held: 'cost.month.state.held', reached: 'cost.month.state.reached' };
// The columns, in the order of the screen. The file has one more in front: the month.
export const COST_LIST_COLUMNS = ['cost.school', 'cost.month.limit', 'cost.month.spent', 'cost.month.delivered', 'cost.month.onItsWay', 'cost.month.onItsWayCost', 'cost.month.counted', 'cost.month.held', 'cost.month.heldNoRate', 'cost.month.state'] as const satisfies readonly MessageKey[];
export const COST_CSV_HEADER = ['cost.month.month', 'cost.school', 'cost.month.csv.limit', 'cost.month.csv.spent', 'cost.month.delivered', 'cost.month.onItsWay', 'cost.month.csv.onItsWayCost', 'cost.month.csv.counted', 'cost.month.held', 'cost.month.heldNoRate', 'cost.month.state'] as const satisfies readonly MessageKey[];

// One school's cells, in the order of COST_LIST_COLUMNS. Amounts are plain rupees; a limit that is not set says so.
export function costListCells(lang: Lang, s: SchoolMonth): [string, string, string, number, number, string, string, number, number, string] {
  return [s.schoolName, s.budgetPaise === null ? t(lang, 'cost.month.notSet') : plainRupees(s.budgetPaise), plainRupees(s.spentPaise), s.delivered, s.onItsWay, plainRupees(s.onItsWayPaise), plainRupees(s.countedPaise), s.heldForBudget, s.heldNoRate, t(lang, LIMIT_STATE_KEY[s.state])];
}

export function costCsvRows(lang: Lang, schools: SchoolMonth[]): CsvValue[][] {
  return schools.map((s) => [s.month, ...costListCells(lang, s)]);
}
