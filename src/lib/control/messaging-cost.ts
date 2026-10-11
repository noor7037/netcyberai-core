// Messaging cost for Control (T7, C140): read only. Live schools, the last
// 30 days, straight from communication_log as the send-gate recorded it:
// attempts, what was billable, cost and GST, by school and by Meta's
// category; how many billable messages had no verified rate; and the rates
// on record with where and when each was verified. Nothing is estimated
// here: a message without a verified rate adds zero and is counted apart.

type Sql = { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, any>[] }> };

export const BILLING_CATEGORIES = ['marketing', 'utility', 'authentication', 'service'] as const;
export type BillingCategoryId = (typeof BILLING_CATEGORIES)[number];

export type CostLine = { attempts: number; billable: number; costPaise: number; gstPaise: number; rateNotVerified: number };
export type MessagingCost = {
  days: 30;
  schools: (CostLine & { schoolId: string; schoolName: string; categories: (CostLine & { category: string })[] })[];
  totals: CostLine;
  rates: { category: string; ratePaise: number; gstPercent: number; effectiveFrom: string; verifiedSource: string; verifiedAt: string; inForce: boolean }[];
  // Categories with no rate in force today: their messages are "rate not verified".
  categoriesWithoutRate: string[];
};

const line = (r: Record<string, any>): CostLine => ({ attempts: Number(r.attempts), billable: Number(r.billable), costPaise: Number(r.cost), gstPaise: Number(r.gst), rateNotVerified: Number(r.unverified) });

// Runs as the founder (nca_super); the caller is /control, guarded by its layout.
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
  return { days: 30, schools, totals, rates, categoriesWithoutRate: BILLING_CATEGORIES.filter((c) => !withRate.has(c)) };
}
