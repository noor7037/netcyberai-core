import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import { BILLING_CATEGORIES } from '@/lib/control/messaging-cost';
import { indiaDate, isIsoDate } from '@/lib/time/india';

// What WhatsApp costs, and the limit on it (docs/25 slice 7o, C197).
//
//   - A RATE is entered by NetCyberAI staff from Meta's own pricing pages, with the page's address and the day it
//     was read. No rate ships with the code, and a rate from anywhere else is refused. A real send without a rate
//     in force for its category is refused by the send-gate (gate.ts, unpricedRealSend).
//   - MONTH SPEND is the sum of DELIVERED, BILLABLE messages this month in India, at the price recorded when each
//     was sent. Sent but not yet delivered is shown apart as "on its way". The stand-in's messages cost nothing.
//   - A school's BUDGET is the most it may spend in a month. Not set, nothing sends; it is set with the school by
//     NetCyberAI staff, who pay Meta.

type Sql = Pick<PoolClient, 'query'>;
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

export type Spend = { budgetPaise: number | null; spentPaise: number; delivered: number; onItsWayPaise: number; onItsWay: number; heldForBudget: number; month: string };
const MONTH = `date_trunc('month', l.created_at at time zone 'Asia/Kolkata') = date_trunc('month', now() at time zone 'Asia/Kolkata')`;

// One school's month. In the caller's own transaction: the school's office reads its own; the platform, any.
export async function schoolSpend(db: Sql, schoolId: string): Promise<Spend> {
  const r = (await db.query(
    `select s.monthly_budget_paise as budget,
            coalesce(sum(l.est_cost_paise + l.gst_paise) filter (where l.billable and l.status::text in ('delivered', 'read') and l.cost_basis = 'rate_table' and ${MONTH}), 0) as spent,
            count(*) filter (where l.billable and l.status::text in ('delivered', 'read') and ${MONTH}) as delivered,
            coalesce(sum(l.est_cost_paise + l.gst_paise) filter (where l.status::text in ('sent', 'uncertain') and l.cost_basis = 'rate_table' and ${MONTH}), 0) as on_its_way_cost,
            count(*) filter (where l.status::text in ('sent', 'uncertain') and l.cost_basis = 'rate_table' and ${MONTH}) as on_its_way,
            count(*) filter (where l.status::text = 'blocked_budget' and ${MONTH}) as held
       from schools s left join communication_log l on l.school_id = s.school_id and l.channel = 'whatsapp'
      where s.school_id = $1 group by s.school_id, s.monthly_budget_paise`,
    [schoolId]
  )).rows[0];
  return { budgetPaise: r?.budget === null || r?.budget === undefined ? null : Number(r.budget), spentPaise: Number(r?.spent ?? 0), delivered: Number(r?.delivered ?? 0), onItsWayPaise: Number(r?.on_its_way_cost ?? 0), onItsWay: Number(r?.on_its_way ?? 0), heldForBudget: Number(r?.held ?? 0), month: indiaDate().slice(0, 7) };
}

// Every live school's month, for Control.
export async function allSchoolSpend(db: Sql): Promise<(Spend & { schoolId: string; schoolName: string })[]> {
  const schools = (await db.query(`select school_id, name from schools where is_test_fixture = false order by lower(name), school_id`)).rows;
  const out = [];
  for (const s of schools) out.push({ schoolId: s.school_id as string, schoolName: s.name as string, ...(await schoolSpend(db, s.school_id)) });
  return out;
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
  await writeAuditLog(db, { schoolId, actorUserId: by.userId, actorRole: 'super_admin', eventAction: 'whatsapp.budget_set', targetType: 'schools', targetId: schoolId, beforeState: { budgetPaise: before.monthly_budget_paise === null ? null : Number(before.monthly_budget_paise) }, afterState: { budgetPaise, reason } });
  return { ok: true };
}
