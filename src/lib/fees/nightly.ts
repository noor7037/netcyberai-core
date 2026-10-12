import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { readSettings } from '@/lib/frameworks/settings-store';
import { PermanentJobError, type JobHandler, type JobQueue, type Sql } from '@/lib/jobs/types';
import { runUpiAlerts } from '@/lib/payments/upi-alerts';
import { indiaDate, isIsoDate } from '@/lib/time/india';
import { rupeesToMinor } from './money';
import { reconcile } from './payments';

// The nightly fee job (docs/23 6d, C163). Just after midnight in India, for
// every school with dues:
//   1. a due past its date with anything still owed is marked overdue,
//      part paid or not;
//   2. if the school has switched the late fee on (off unless it has), each
//      overdue due past the grace days gets one late-fee line, a new due;
//   3. the reconciliation check runs, and its result is recorded.
// One row in fee_status_runs per school and night. Running the same night
// again changes nothing: the row is already there.

export type LateFeeRule = { feeMinor: number; graceDays: number; since: string | null };

// The school's late-fee rule: nothing unless it is switched on and has an
// amount. `since` is the day it was last switched on or its amount changed,
// in India: only dues falling due on or after it are fined, so switching it
// on never fines the past.
export async function lateFeeRule(db: Sql, schoolId: string): Promise<LateFeeRule> {
  const schema = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'fees');
  const v = schema ? (await readSettings(db as PoolClient, schoolId, schema)).effective : {};
  const rupees = v.late_fee_enabled === true && typeof v.late_fee_rupees === 'number' && v.late_fee_rupees > 0 ? v.late_fee_rupees : 0;
  const grace = typeof v.late_fee_grace_days === 'number' && v.late_fee_grace_days >= 0 ? Math.floor(v.late_fee_grace_days) : 0;
  const changed = (await db.query(`select ((max(changed_at) at time zone 'Asia/Kolkata')::date)::text as since from school_setting_changes where school_id = $1 and module_id = 'fees' and setting_key in ('late_fee_enabled', 'late_fee_rupees')`, [schoolId])).rows[0];
  return { feeMinor: rupees > 0 ? rupeesToMinor(String(rupees)) ?? 0 : 0, graceDays: grace, since: (changed?.since as string | null) ?? null };
}

export type NightlyRun = { runDate: string; markedOverdue: number; lateFeesRaised: number; lateFeeMinor: number; problems: number; balanceMinor: number };

// One school, one night, inside the caller's transaction. Null when that night was already done.
export async function runFeesNightlyForSchool(db: Sql, schoolId: string, today: string): Promise<NightlyRun | null> {
  await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`fees.nightly:${schoolId}`]);
  if ((await db.query(`select 1 from fee_status_runs where school_id = $1 and run_date = $2`, [schoolId, today])).rows[0]) return null;

  const marked = await db.query(
    `update fees_ledger l set status = 'overdue'
      where l.school_id = $1 and l.status::text in ('pending', 'partial') and l.due_date < $2::date
        and l.amount_minor > (select coalesce(sum(p.amount_minor), 0) from payments p where p.fee_id = l.fee_id)`,
    [schoolId, today]
  );

  const rule = await lateFeeRule(db, schoolId);
  let lateFeesRaised = 0;
  if (rule.feeMinor > 0 && rule.since) {
    const raised = await db.query(
      `insert into fees_ledger (school_id, student_id, gross_minor, concession_minor, amount_minor, due_date, late_fee_for)
       select l.school_id, l.student_id, $3, 0, $3, $2::date, l.fee_id
         from fees_ledger l
        where l.school_id = $1 and l.status::text = 'overdue' and l.late_fee_for is null
          and l.due_date >= $5::date and l.due_date + $4::int < $2::date
          and l.amount_minor > (select coalesce(sum(p.amount_minor), 0) from payments p where p.fee_id = l.fee_id)
       on conflict (school_id, late_fee_for) where late_fee_for is not null do nothing`,
      [schoolId, today, rule.feeMinor, rule.graceDays, rule.since]
    );
    lateFeesRaised = raised.rowCount ?? 0;
  }

  const books = await reconcile(db as PoolClient, schoolId);
  const run: NightlyRun = { runDate: today, markedOverdue: marked.rowCount ?? 0, lateFeesRaised, lateFeeMinor: lateFeesRaised * rule.feeMinor, problems: books.problems.length, balanceMinor: books.balanceMinor };
  await db.query(`insert into fee_status_runs (school_id, run_date, marked_overdue, late_fees_raised, late_fee_minor, problems, balance_minor) values ($1, $2, $3, $4, $5, $6, $7)`, [schoolId, today, run.markedOverdue, run.lateFeesRaised, run.lateFeeMinor, run.problems, run.balanceMinor]);
  if (run.markedOverdue > 0 || run.lateFeesRaised > 0 || run.problems > 0)
    await writeAuditLog(db, { schoolId, actorUserId: null, actorRole: null, eventAction: 'fees.nightly_run', targetType: 'fee_status_runs', targetId: undefined, beforeState: undefined, afterState: run });
  return run;
}

type Platform = <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;

// The job: every school with a due, each in its own transaction, so one
// school's failure does not undo another's night. A failure is retried by
// the queue; schools already done are skipped.
export function feesNightlyHandler(deps: { platform: Platform; queue?: JobQueue; now?: () => Date }): JobHandler {
  return async (job) => {
    const today = indiaDate((deps.now ?? (() => new Date()))());
    const asked = job.payload.date;
    if (asked !== undefined && !isIsoDate(asked)) throw new PermanentJobError('fees.nightly: bad date');
    // A job that waited in the queue runs for the day it is now, never for a day still to come.
    const runDate = typeof asked === 'string' && asked < today ? today : (asked as string | undefined) ?? today;
    if (runDate > today) throw new Error('fees.nightly: that day has not begun in India');
    const schools = await deps.platform(async (db) => (await db.query(`select distinct school_id from fees_ledger`)).rows.map((r) => r.school_id as string));
    const failed: string[] = [];
    for (const schoolId of schools) {
      try {
        await deps.platform((db) => runFeesNightlyForSchool(db, schoolId, runDate));
      } catch {
        failed.push(schoolId);
      }
    }
    // UPI payments still waiting to be verified (C175): the digest, the reminder after one working day, the
    // principal's alert after two. Each report is marked as it is told, so a second run tells nobody twice.
    const queue = deps.queue;
    if (queue) {
      const waiting = await deps.platform(async (db) => (await db.query(`select distinct school_id from payment_reports where status in ('reported', 'awaiting_principal')`)).rows.map((r) => r.school_id as string));
      for (const schoolId of waiting) {
        try {
          await deps.platform((db) => runUpiAlerts(db, queue, schoolId, runDate));
        } catch {
          failed.push(schoolId);
        }
      }
    }
    if (failed.length > 0) throw new Error(`fees.nightly: ${failed.length} school(s) not done`);
  };
}

// The latest night's result, for the fee desk.
export async function lastNightlyRun(db: Sql, schoolId: string): Promise<NightlyRun | null> {
  const r = (await db.query(`select run_date::text as run_date, marked_overdue, late_fees_raised, late_fee_minor, problems, balance_minor from fee_status_runs where school_id = $1 order by run_date desc limit 1`, [schoolId])).rows[0];
  return r ? { runDate: r.run_date as string, markedOverdue: Number(r.marked_overdue), lateFeesRaised: Number(r.late_fees_raised), lateFeeMinor: Number(r.late_fee_minor), problems: Number(r.problems), balanceMinor: Number(r.balance_minor) } : null;
}
