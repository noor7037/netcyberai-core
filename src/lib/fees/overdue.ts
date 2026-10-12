// When a fee counts as overdue (C137, C163), in one place for every screen
// that says "overdue": the dashboard's tile, its attention item and chart,
// My Day's card and the fee desk.
//
// A fee is overdue when its due date has passed, by the date in India (the
// day a school means), and something is still owed on it: part paid or not.
// What is overdue is the unpaid balance, never the billed amount. The
// nightly job (src/lib/fees/nightly.ts) stores that as the status
// `overdue`; between midnight and the job, the date decides, so the screens
// never wait for the job. Paid and waived fees are never counted.

export const INDIA_TODAY_SQL = `(now() at time zone 'Asia/Kolkata')::date`;

// A condition on fees_ledger (give the table's alias with its dot, or nothing).
export const feeIsOverdueSql = (alias = ''): string => `(${alias}status::text = 'overdue' or (${alias}status::text in ('pending', 'partial') and ${alias}due_date < ${INDIA_TODAY_SQL}))`;
// Something still owed and not yet past its date.
export const feeIsPendingSql = (alias = ''): string => `(${alias}status::text in ('pending', 'partial') and ${alias}due_date >= ${INDIA_TODAY_SQL})`;

export type FeesSummary = {
  collectedMinor: number; // money received, on fully and partly paid entries alike
  pendingMinor: number; // still owed and not yet due
  overdueMinor: number; // still owed and past its date
  overdueCount: number;
  waivedMinor: number;
};

type Sql = { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

// The school's fee entries by status, for the caller's own tenant context
// (row-level security decides which school's rows exist).
export async function loadFeesSummary(db: Sql): Promise<FeesSummary> {
  // `paid`: what has come in for the entry. An entry stored as paid with no
  // payment rows (recorded before payments were kept) counts as paid in full.
  const { rows } = await db.query(
    `select
       coalesce(sum(x.paid), 0) as collected_minor,
       coalesce(sum(x.amount_minor - x.paid) filter (where ${feeIsPendingSql('x.')}), 0) as pending_minor,
       coalesce(sum(x.amount_minor - x.paid) filter (where ${feeIsOverdueSql('x.')}), 0) as overdue_minor,
       count(*) filter (where ${feeIsOverdueSql('x.')} and x.amount_minor > x.paid) as overdue_count,
       coalesce(sum(x.amount_minor) filter (where x.status::text = 'waived'), 0) as waived_minor
     from (
       select l.status, l.due_date, l.amount_minor,
              case when l.status::text = 'paid' then l.amount_minor
                   when l.status::text = 'waived' then 0
                   else least(l.amount_minor, greatest(0, coalesce((select sum(p.amount_minor) from payments p where p.fee_id = l.fee_id), 0))) end as paid
         from fees_ledger l
     ) x`
  );
  const r = rows[0] ?? {};
  return {
    collectedMinor: Number(r.collected_minor ?? 0),
    pendingMinor: Number(r.pending_minor ?? 0),
    overdueMinor: Number(r.overdue_minor ?? 0),
    overdueCount: Number(r.overdue_count ?? 0),
    waivedMinor: Number(r.waived_minor ?? 0),
  };
}
