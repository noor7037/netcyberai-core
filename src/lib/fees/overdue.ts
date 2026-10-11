// When a fee counts as overdue (C137), in one place for every screen that
// says "overdue": the dashboard's tile, its attention item and chart, and My
// Day's card.
//
// A fee is overdue when it is still pending and its due date has passed,
// by the date in India (the day a school means). Nothing changes a fee's
// stored status when its date simply passes: the nightly job that will mark
// such fees `overdue` belongs to P3 Fees (docs/16 §4). Until then, and
// after, the date decides; a fee already stored as `overdue` counts too.
// Paid, waived and part-paid fees are never counted here.

export const INDIA_TODAY_SQL = `(now() at time zone 'Asia/Kolkata')::date`;

// A condition on fees_ledger (give the table's alias with its dot, or nothing).
export const feeIsOverdueSql = (alias = ''): string => `(${alias}status::text = 'overdue' or (${alias}status::text = 'pending' and ${alias}due_date < ${INDIA_TODAY_SQL}))`;
// Pending and not yet past its date.
export const feeIsPendingSql = (alias = ''): string => `(${alias}status::text = 'pending' and ${alias}due_date >= ${INDIA_TODAY_SQL})`;

export type FeesSummary = {
  collectedMinor: number;
  pendingMinor: number; // pending and not yet due
  overdueMinor: number;
  overdueCount: number;
  partialMinor: number; // billed amount of entries that are part paid
  waivedMinor: number;
};

type Sql = { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

// The school's fee entries by status, for the caller's own tenant context
// (row-level security decides which school's rows exist).
export async function loadFeesSummary(db: Sql): Promise<FeesSummary> {
  const { rows } = await db.query(
    `select
       coalesce(sum(amount_minor) filter (where status = 'paid'), 0) as collected_minor,
       coalesce(sum(amount_minor) filter (where ${feeIsPendingSql()}), 0) as pending_minor,
       coalesce(sum(amount_minor) filter (where ${feeIsOverdueSql()}), 0) as overdue_minor,
       count(*) filter (where ${feeIsOverdueSql()}) as overdue_count,
       coalesce(sum(amount_minor) filter (where status::text = 'partial'), 0) as partial_minor,
       coalesce(sum(amount_minor) filter (where status::text = 'waived'), 0) as waived_minor
     from fees_ledger`
  );
  const r = rows[0] ?? {};
  return {
    collectedMinor: Number(r.collected_minor ?? 0),
    pendingMinor: Number(r.pending_minor ?? 0),
    overdueMinor: Number(r.overdue_minor ?? 0),
    overdueCount: Number(r.overdue_count ?? 0),
    partialMinor: Number(r.partial_minor ?? 0),
    waivedMinor: Number(r.waived_minor ?? 0),
  };
}
