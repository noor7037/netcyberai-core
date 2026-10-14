import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import { indiaDate, isIsoDate } from '@/lib/time/india';

// What WhatsApp costs, and the limit on it (docs/25 slice 7o, C197).
//
//   - A RATE is entered by NetCyberAI staff from Meta's own pricing pages, with the page's address and the day it
//     was read. No rate ships with the code, and a rate from anywhere else is refused. A real send without a rate
//     in force for its category is refused by the send-gate (gate.ts, unpricedRealSend).
//   - MONTH SPEND is the sum of DELIVERED, BILLABLE messages this month in India, at the price recorded when each
//     was sent. Sent but not yet delivered is shown apart as "on its way". The stand-in's messages cost nothing.
//     Any earlier month is counted the same way (docs/26 slice 8f, C205): a message belongs to the India month it
//     was logged in, so one logged at 23:50 on a month's last day is that month's and one at 00:10 is the next's.
//   - A school's BUDGET is the most it may spend in a month. Not set, nothing sends; it is set with the school by
//     NetCyberAI staff, who pay Meta.
//   - COUNTED AGAINST THE LIMIT is not month spend: the send-gate adds a priced message of a real account to its sum
//     from the moment it is sent, delivered or not (gate.ts, step 4). That sum is written once, below, and the gate
//     reads it from here, so what a screen says about a limit is judged on the figure the gate itself holds
//     messages back on.

type Sql = Pick<PoolClient, 'query'>;
// Meta's billing categories: a rate is entered for one of these, and a template belongs to one.
export const BILLING_CATEGORIES = ['marketing', 'utility', 'authentication', 'service'] as const;
// Where a rate may be read from: Meta's own sites, and nowhere else.
const META_HOSTS = ['developers.facebook.com', 'business.whatsapp.com', 'www.facebook.com', 'business.facebook.com'];
// Upper bounds, in paise, against a slip of the hand: one thousand rupees a message, ten lakh rupees a month.
export const MAX_RATE_PAISE = 100000;
export const MAX_BUDGET_PAISE = 100_000_000;

export function metaPricingPage(source: string): string | null {
  try {
    const u = new URL(source.trim());
    return u.protocol === 'https:' && META_HOSTS.includes(u.hostname) && u.pathname.length > 1 ? u.toString() : null;
  } catch {
    return null;
  }
}

export type RateInput = { category: string; ratePaise: number; gstPercent: number; source: string; verifiedOn: string; effectiveFrom: string };
export type RateResult = { ok: true; rateId: string } | { ok: false; reason: 'category' | 'rate' | 'gst' | 'source' | 'verified_on' | 'effective_from' };

// As the platform role. A rate is added, never edited: a new price is a new row from its own day.
export async function addRate(db: PoolClient, by: { userId: string }, input: RateInput, today: string = indiaDate()): Promise<RateResult> {
  if (!(BILLING_CATEGORIES as readonly string[]).includes(input.category)) return { ok: false, reason: 'category' };
  if (!Number.isInteger(input.ratePaise) || input.ratePaise < 0 || input.ratePaise > MAX_RATE_PAISE) return { ok: false, reason: 'rate' };
  if (typeof input.gstPercent !== 'number' || !(input.gstPercent >= 0 && input.gstPercent <= 40)) return { ok: false, reason: 'gst' };
  const source = metaPricingPage(input.source);
  if (!source) return { ok: false, reason: 'source' };
  // Read today or in the last 30 days: an older reading is read again before it is relied on.
  if (!isIsoDate(input.verifiedOn) || input.verifiedOn > today || input.verifiedOn < new Date(new Date(`${today}T00:00:00Z`).getTime() - 30 * 86400_000).toISOString().slice(0, 10)) return { ok: false, reason: 'verified_on' };
  if (!isIsoDate(input.effectiveFrom)) return { ok: false, reason: 'effective_from' };
  const rateId = (await db.query(
    `insert into message_rate_table (channel, billing_category, rate_paise, gst_percent, verified_source, verified_at, effective_from) values ('whatsapp', $1, $2, $3, $4, ($5::date)::timestamp at time zone 'Asia/Kolkata', $6) returning rate_id`,
    [input.category, input.ratePaise, input.gstPercent, source, input.verifiedOn, input.effectiveFrom]
  )).rows[0].rate_id as string;
  await writeAuditLog(db, { schoolId: null, actorUserId: by.userId, actorRole: 'super_admin', eventAction: 'whatsapp.rate_added', targetType: 'message_rate_table', targetId: rateId, beforeState: undefined, afterState: { category: input.category, ratePaise: input.ratePaise, gstPercent: input.gstPercent, source, verifiedOn: input.verifiedOn, effectiveFrom: input.effectiveFrom } });
  return { ok: true, rateId };
}

// A month of India's calendar, written YYYY-MM.
export function isCostMonth(value: unknown): value is string {
  return typeof value === 'string' && /^20\d{2}-(0[1-9]|1[0-2])$/.test(value);
}
export function indiaMonth(at: Date = new Date()): string {
  return indiaDate(at).slice(0, 7);
}
// `by` months after `month` (before it, when negative).
export function shiftMonth(month: string, by: number): string {
  const at = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + by;
  return `${String(Math.floor(at / 12)).padStart(4, '0')}-${String((at % 12) + 1).padStart(2, '0')}`;
}
// The month a screen shows: the one asked for when it is a real month no later than this one; this month otherwise.
export function monthToShow(asked: unknown, thisMonth: string = indiaMonth()): string {
  return isCostMonth(asked) && asked <= thisMonth ? asked : thisMonth;
}

// `countedPaise` is what the send-gate counts against the limit; `heldForBudget` the messages the limit held back
// (or the lack of one); `heldNoRate` those held because their category had no verified rate.
export type Spend = { budgetPaise: number | null; spentPaise: number; delivered: number; onItsWayPaise: number; onItsWay: number; countedPaise: number; heldForBudget: number; heldNoRate: number; month: string };
export type SchoolSpend = Spend & { schoolId: string; schoolName: string };

// --- What each figure counts. ONE place: a school's own month, Control's list of schools, its table by category
// --- and its six months all read these, so two screens cannot count the same month differently.
// The month, as `m.first` (its first day). The parameter is that day, or null for this month by the database's own
// clock in India: the clock the send-gate's budget check goes by.
export const monthCte = (param: string) => `m as (select date_trunc('month', coalesce(${param}::date, (now() at time zone 'Asia/Kolkata')::date)::timestamp)::date as first)`;
// A message belongs to the India month it was logged in: from that month's first midnight in India up to the next.
export const LOGGED_IN_MONTH = `l.created_at >= (m.first::timestamp at time zone 'Asia/Kolkata') and l.created_at < ((m.first + interval '1 month') at time zone 'Asia/Kolkata')`;
// Delivered and billable: the provider said it reached the phone, on a real account.
const DELIVERED = `l.billable and l.status::text in ('delivered', 'read')`;
// Money spent: a delivered, billable message at the price recorded from the rate table when it was sent.
const PAID = `${DELIVERED} and l.cost_basis = 'rate_table'`;
// On its way: sent and priced, not yet confirmed delivered. Not money spent.
const ON_ITS_WAY = `l.status::text in ('sent', 'uncertain') and l.cost_basis = 'rate_table'`;
// Counted against the limit: the rows the send-gate adds up before it lets a message go. A priced message counts
// from the moment it is sent and stops counting only if the provider says it failed; so this is month spend and the
// priced messages still "sent" (one whose send was interrupted, "uncertain", is on its way but is not in this sum).
// gate.ts builds its own budget check from this fragment (rows of `communication_log l`).
export const COUNTED_AGAINST_LIMIT = `l.cost_basis = 'rate_table' and (l.billable or l.status::text = 'sent')`;
// The gate records one status, blocked_budget, for a message it held for money, and says why in its reason:
// the limit (reached, about to be passed, or not set), or a real account's message whose category has no verified
// rate. The second is not the limit's doing: its reason starts with these words (gate.ts, unpricedRealSend).
export const RATE_NOT_VERIFIED = 'rate not verified';
const HELD_NO_RATE = `l.status::text = 'blocked_budget' and l.reason like '${RATE_NOT_VERIFIED}%'`;
export const HELD_BY_LIMIT = `l.status::text = 'blocked_budget' and coalesce(l.reason, '') not like '${RATE_NOT_VERIFIED}%'`;
export const SPEND_FIGURES = `coalesce(sum(l.est_cost_paise + l.gst_paise) filter (where ${PAID}), 0) as spent,
            coalesce(sum(l.gst_paise) filter (where ${PAID} and l.est_cost_paise is not null), 0) as gst,
            count(*) filter (where ${DELIVERED}) as delivered,
            count(*) filter (where ${DELIVERED} and l.cost_basis is distinct from 'rate_table') as unverified,
            coalesce(sum(l.est_cost_paise + l.gst_paise) filter (where ${ON_ITS_WAY}), 0) as on_its_way_cost,
            count(*) filter (where ${ON_ITS_WAY}) as on_its_way,
            coalesce(sum(l.est_cost_paise + l.gst_paise) filter (where ${COUNTED_AGAINST_LIMIT}), 0) as counted,
            count(*) filter (where ${HELD_BY_LIMIT}) as held,
            count(*) filter (where ${HELD_NO_RATE}) as held_no_rate`;

const firstDay = (month: string | undefined) => (month === undefined ? null : `${month}-01`);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const spendOf = (r: Record<string, any> | undefined, month: string | undefined): Spend => ({
  budgetPaise: r?.budget === null || r?.budget === undefined ? null : Number(r.budget),
  spentPaise: Number(r?.spent ?? 0),
  delivered: Number(r?.delivered ?? 0),
  onItsWayPaise: Number(r?.on_its_way_cost ?? 0),
  onItsWay: Number(r?.on_its_way ?? 0),
  countedPaise: Number(r?.counted ?? 0),
  heldForBudget: Number(r?.held ?? 0),
  heldNoRate: Number(r?.held_no_rate ?? 0),
  month: (r?.month as string | undefined) ?? month ?? indiaMonth(),
});
const SPEND_FROM = `from m cross join schools s left join communication_log l on l.school_id = s.school_id and l.channel = 'whatsapp' and ${LOGGED_IN_MONTH}`;

// One school's month: this month when none is given. In the caller's own transaction: the school's office reads its
// own; the platform, any. The limit is the one set now: a limit is not kept month by month. (Control's list for a
// month that is over reads the limit in force at that month's end from the audit log: messaging-cost.ts.) The
// database answers it only to the people who read the school's whole message log (reads_school_message_totals(),
// C219): anyone else gets no row, so no spend and no limit.
export async function schoolSpend(db: Sql, schoolId: string, month?: string): Promise<Spend> {
  const r = (await db.query(
    `with ${monthCte('$2')}
     select to_char(m.first, 'YYYY-MM') as month, s.monthly_budget_paise as budget,
            ${SPEND_FIGURES}
       ${SPEND_FROM}
      where s.school_id = $1 and public.reads_school_message_totals() group by m.first, s.school_id, s.monthly_budget_paise`,
    [schoolId, firstDay(month)]
  )).rows[0];
  return spendOf(r, month);
}

// Every live school's month, for Control: this month when none is given. One query, whatever the number of schools.
export async function allSchoolSpend(db: Sql, month?: string): Promise<SchoolSpend[]> {
  const { rows } = await db.query(
    `with ${monthCte('$1')}
     select to_char(m.first, 'YYYY-MM') as month, s.school_id, s.name, s.monthly_budget_paise as budget,
            ${SPEND_FIGURES}
       ${SPEND_FROM}
      where s.is_test_fixture = false
      group by m.first, s.school_id, s.name, s.monthly_budget_paise
      order by lower(s.name), s.school_id`,
    [firstDay(month)]
  );
  return rows.map((r) => ({ schoolId: r.school_id as string, schoolName: r.name as string, ...spendOf(r, month) }));
}

// Where a school stands against its limit, judged on what the send-gate counts (`countedPaise`), never on delivered
// spend alone: the gate holds a message back when the counted sum has reached the limit, or would pass it with
// that message.
//   reached  all of the limit is counted, or more: nothing more is sent;
//   held     less than all of it is counted, and the gate still held a message back under this limit, because that
//            message would have passed it (`heldUnderLimit`: messages held by the limit since it was last set);
//   near     four fifths of the limit or more is counted.
export type LimitState = 'not_set' | 'within' | 'near' | 'held' | 'reached';
export function limitState(budgetPaise: number | null, countedPaise: number, heldUnderLimit: number = 0): LimitState {
  if (budgetPaise === null) return 'not_set';
  if (countedPaise >= budgetPaise) return 'reached';
  if (heldUnderLimit > 0) return 'held';
  return countedPaise * 5 >= budgetPaise * 4 ? 'near' : 'within';
}

export type BudgetResult = { ok: true } | { ok: false; reason: 'amount' | 'reason' | 'not_found' };
// As the platform role: NetCyberAI staff set a school's monthly limit, with why. null takes it away (nothing sends).
export async function setSchoolBudget(db: PoolClient, by: { userId: string }, schoolId: string, budgetPaise: number | null, why: string): Promise<BudgetResult> {
  if (budgetPaise !== null && (!Number.isInteger(budgetPaise) || budgetPaise < 0 || budgetPaise > MAX_BUDGET_PAISE)) return { ok: false, reason: 'amount' };
  const reason = why.trim().replace(/\s+/g, ' ').slice(0, 300);
  if (!reason) return { ok: false, reason: 'reason' };
  const before = (await db.query(`select monthly_budget_paise from schools where school_id = $1 for update`, [schoolId])).rows[0];
  if (!before) return { ok: false, reason: 'not_found' };
  await db.query(`update schools set monthly_budget_paise = $2 where school_id = $1`, [schoolId, budgetPaise]);
  await writeAuditLog(db, { schoolId, actorUserId: by.userId, actorRole: 'super_admin', eventAction: 'whatsapp.budget_set', targetType: 'schools', targetId: schoolId, beforeState: { budgetPaise: before.monthly_budget_paise === null ? null : Number(before.monthly_budget_paise) }, afterState: { budgetPaise, reasoned: true } }); // never a reason's words (C224)
  return { ok: true };
}
