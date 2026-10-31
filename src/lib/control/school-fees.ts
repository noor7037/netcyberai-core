import { feeIsOverdueSql, feeIsPendingSql, ENTRIES_WITH_PAID, INDIA_TODAY_SQL, loadFeesSummary, type FeesSummary } from '@/lib/fees/overdue';

// One school's fees, read-only, for the platform super admin's Control → school → Fees tab (W13-D). Totals reuse the
// fee screens' own rule (loadFeesSummary); the last 30 days of money received are read from the payments table. No
// student names and no bank details: counts and paise only. Every query names the school.

type Sql = { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export const FEES_WINDOW_DAYS = 30;

export type SchoolFees = {
  hasFees: boolean; // the school has a fee structure or at least one fee entry
  summary: FeesSummary;
  studentsWithDues: number; // students with something still owed (pending, part paid or overdue)
  byMethod: { method: string; amountMinor: number; count: number }[]; // last 30 days
  perDay: { day: string; amountMinor: number; count: number }[]; // last 30 days, only days with a payment
};

// A payment counts once: a reversed payment and the reversal row that undid it are both left out, so the series and
// the methods agree with the balances.
const LIVE_PAYMENTS = `p.school_id = $1 and p.reverses_payment_id is null
       and not exists (select 1 from payments r where r.school_id = p.school_id and r.reverses_payment_id = p.payment_id)
       and (p.received_at at time zone 'Asia/Kolkata')::date > ${INDIA_TODAY_SQL} - ${FEES_WINDOW_DAYS}`;

export async function loadSchoolFees(db: Sql, schoolId: string): Promise<SchoolFees> {
  const summary = await loadFeesSummary(db, schoolId);
  const has = await db.query(`select (exists (select 1 from fee_structures where school_id = $1) or exists (select 1 from fees_ledger where school_id = $1)) as has`, [schoolId]);
  const dues = await db.query(
    `select count(distinct e.student_id) as n
       from (${ENTRIES_WITH_PAID}) x join fees_ledger e on e.fee_id = x.fee_id
      where (${feeIsOverdueSql('x.')} or ${feeIsPendingSql('x.')}) and x.amount_minor > x.paid`,
    [schoolId]
  );
  const methods = await db.query(`select p.method, sum(p.amount_minor) as amount_minor, count(*) as n from payments p where ${LIVE_PAYMENTS} group by p.method order by sum(p.amount_minor) desc, p.method`, [schoolId]);
  const days = await db.query(`select (p.received_at at time zone 'Asia/Kolkata')::date::text as day, sum(p.amount_minor) as amount_minor, count(*) as n from payments p where ${LIVE_PAYMENTS} group by 1 order by 1`, [schoolId]);
  return {
    hasFees: has.rows[0]?.has === true,
    summary,
    studentsWithDues: Number(dues.rows[0]?.n ?? 0),
    byMethod: methods.rows.map((r) => ({ method: String(r.method), amountMinor: Number(r.amount_minor), count: Number(r.n) })),
    perDay: days.rows.map((r) => ({ day: String(r.day), amountMinor: Number(r.amount_minor), count: Number(r.n) })),
  };
}
