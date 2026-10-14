import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import { INDIA_TODAY_SQL } from '@/lib/time/india';
import type { Auditor } from './run';
import { AUDITOR_ROLES, readResults, type CheckUp, type CheckUpLine, type StoredCheckUp } from './rules';

// The dated record of a school's check-ups (docs/26 slice 8i, C208): school_health_runs, one row a school and
// India date.
//
//   - Written by the office's own session when a person runs a check-up: the first of the day inserts, "Check
//     again" the same day rewrites that day's row. Nothing else writes it: no job, no schedule.
//   - The day is the database's own India date, so the row and the rule that guards it (a row is written for
//     today only; a past day's row never changes) read one clock.
//   - Only the principal and the school admin read it. That is the database's rule (the school_health_runs
//     policies); the role is also asked here so that nobody else's request reaches a query at all.
//   - What is kept is counts and addresses of the app: no name, number or word of any person.

type Sql = Pick<PoolClient, 'query'>;

// How many past check-ups the screen lists: the trend is a short list.
export const HISTORY_MAX = 14;

const iso = (v: unknown) => new Date(v as string).toISOString();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const shape = (r: any): StoredCheckUp => {
  // The two numbers are the day's own record. The database holds them to the results they were written with
  // (the check school_health_runs_n_of_m), so the sentence and the list under it agree.
  return { date: r.run_date, ruleVersion: Number(r.rule_version), results: readResults(r.results), passed: Number(r.passed), applicable: Number(r.applicable), recordedAt: iso(r.recorded_at), recordedBy: (r.recorded_by_name as string | null) ?? null };
};

// Keep a check-up as today's. Returns it as it is now on record.
export async function recordCheckUp(db: Sql, who: Auditor, checkUp: CheckUp): Promise<StoredCheckUp | null> {
  if (!AUDITOR_ROLES.includes(who.role)) return null;
  const kept = checkUp.results.map((r) => ({ id: r.id, state: r.state, count: r.count, href: r.href, ...(r.off ? { off: true } : {}) }));
  const saved = (await db.query(
    `insert into school_health_runs (school_id, run_date, rule_version, results, passed, applicable, recorded_by)
     values ($1, ${INDIA_TODAY_SQL}, $2, $3::jsonb, $4, $5, $6)
     on conflict (school_id, run_date) do update
       set rule_version = excluded.rule_version, results = excluded.results, passed = excluded.passed, applicable = excluded.applicable, recorded_by = excluded.recorded_by
     returning run_id, run_date::text as run_date`,
    [who.schoolId, checkUp.ruleVersion, JSON.stringify(kept), checkUp.passed, checkUp.applicable, who.userId]
  )).rows[0] as { run_id: string; run_date: string };
  // Who ran a check-up, for which day, and the two numbers. Never what any check counted.
  await writeAuditLog(db, { schoolId: who.schoolId, actorUserId: who.userId, actorRole: who.role, eventAction: 'school_health.checked', targetType: 'school_health_runs', targetId: saved.run_id, beforeState: undefined, afterState: { date: saved.run_date, ruleVersion: checkUp.ruleVersion, passed: checkUp.passed, applicable: checkUp.applicable } });
  return latestCheckUp(db, who);
}

const RUNS = `select r.run_date::text as run_date, r.rule_version, r.results, r.passed, r.applicable, r.recorded_at, u.display_name as recorded_by_name
                from school_health_runs r left join users u on u.user_id = r.recorded_by`;

// The latest check-up on record, or null when none has been run.
export async function latestCheckUp(db: Sql, who: Auditor): Promise<StoredCheckUp | null> {
  if (!AUDITOR_ROLES.includes(who.role)) return null;
  const row = (await db.query(`${RUNS} where r.school_id = $1 order by r.run_date desc limit 1`, [who.schoolId])).rows[0];
  return row ? shape(row) : null;
}

// The last check-ups, the latest first: one line a day, which is the trend.
export async function checkUpHistory(db: Sql, who: Auditor, limit: number = HISTORY_MAX): Promise<CheckUpLine[]> {
  if (!AUDITOR_ROLES.includes(who.role)) return [];
  const { rows } = await db.query(`select run_date::text as run_date, rule_version, passed, applicable from school_health_runs where school_id = $1 order by run_date desc limit $2`, [who.schoolId, limit]);
  return rows.map((r) => ({ date: r.run_date as string, ruleVersion: Number(r.rule_version), passed: Number(r.passed), applicable: Number(r.applicable) }));
}
