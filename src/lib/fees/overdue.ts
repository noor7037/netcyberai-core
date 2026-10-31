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

// Every fee entry with what has come in for it. `paid`: an entry stored as
// paid with no payment rows (recorded before payments were kept) counts as
// paid in full. The summary and the lists below read this one shape, so a
// total and the rows under it cannot disagree. Its first parameter is the
// school: the entries are asked for by school, as every other number is, so
// the answer is one school's whoever asks (a nightly job or a check running
// as the platform role is not narrowed by row level security).
export const ENTRIES_WITH_PAID = `select l.fee_id, l.status, l.due_date, l.amount_minor,
              case when l.status::text = 'paid' then l.amount_minor
                   when l.status::text = 'waived' then 0
                   else least(l.amount_minor, greatest(0, coalesce((select sum(p.amount_minor) from payments p where p.fee_id = l.fee_id), 0))) end as paid
         from fees_ledger l where l.school_id = $1`;

// The school's fee entries by status. In a school session row level security
// also decides which roles see any of them (the finance roles).
export async function loadFeesSummary(db: Sql, schoolId: string): Promise<FeesSummary> {
  const { rows } = await db.query(
    `select
       coalesce(sum(x.paid), 0) as collected_minor,
       coalesce(sum(x.amount_minor - x.paid) filter (where ${feeIsPendingSql('x.')}), 0) as pending_minor,
       coalesce(sum(x.amount_minor - x.paid) filter (where ${feeIsOverdueSql('x.')}), 0) as overdue_minor,
       count(*) filter (where ${feeIsOverdueSql('x.')} and x.amount_minor > x.paid) as overdue_count,
       coalesce(sum(x.amount_minor) filter (where x.status::text = 'waived'), 0) as waived_minor
     from (${ENTRIES_WITH_PAID}) x`,
    [schoolId]
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

// The entries behind the summary's two "owed" figures (docs/26 slice 8d, C203): what the Fees screen lists when
// it is opened on /app/fees?show=overdue or ?show=owed. 'overdue' is the rule above; 'owed' is still owed and not
// yet past its date. The oldest due first; never ordered by amount, and never beside anything about learning.
export const DUE_LISTS = ['overdue', 'owed'] as const;
export type DueList = (typeof DUE_LISTS)[number];
export const DUE_ROWS_MAX = 2000;
export type DueRow = { fee_id: string; student_id: string; student_name: string | null; class_name: string | null; head_name: string | null; period_key: string | null; is_late_fee: boolean; due_date: string; amount_minor: number; paid_minor: number; balance_minor: number };

export async function listDues(db: Sql, schoolId: string, which: DueList, limit: number = DUE_ROWS_MAX): Promise<DueRow[]> {
  const { rows } = await db.query(
    `select x.fee_id, e.student_id, st.name as student_name, c.name as class_name, h.name as head_name, e.period_key, e.late_fee_for is not null as is_late_fee,
            x.due_date::text as due_date, x.amount_minor, x.paid as paid_minor, x.amount_minor - x.paid as balance_minor
       from (${ENTRIES_WITH_PAID}) x
       join fees_ledger e on e.fee_id = x.fee_id
       left join fee_billing_students() st on st.school_id = e.school_id and st.student_id = e.student_id
       left join classes c on c.school_id = st.school_id and c.class_id = st.class_id
       left join fee_heads h on h.school_id = e.school_id and h.head_id = e.head_id
      where ${which === 'overdue' ? feeIsOverdueSql('x.') : feeIsPendingSql('x.')} and x.amount_minor > x.paid
      order by x.due_date, st.name, x.fee_id
      limit $2`,
    [schoolId, limit]
  );
  return rows.map((r) => ({ ...(r as unknown as DueRow), amount_minor: Number(r.amount_minor), paid_minor: Number(r.paid_minor), balance_minor: Number(r.balance_minor) }));
}
