import { NO_PERSON } from '@/lib/auth/db';
import { WEEKLY_CHECK_UP_JOB, weekStart } from '@/lib/auditor/rules';
import { runCheckUp } from '@/lib/auditor/run';
import { recordWeeklyCheckUp } from '@/lib/auditor/store';
import { runCheck } from '@/lib/early-warning/early-warning';
import { NIGHTLY_CHECK_JOB } from '@/lib/early-warning/rules';
import { indiaDate } from '@/lib/time/india';
import { entitlementsIfOn, schoolOfJob, type AsSchool } from './school-context';
import { PermanentJobError, type JobHandler } from './types';

// A school's own scheduled checks (C210), each the very function a person's tap runs, in the school's own session
// as its office sees it, with no person (./school-context.ts says how). The database queues one job a school whose
// module is on (the c210_schedules migration); nothing here queues anything, and nothing reaches a parent.
//
//   - EARLY WARNING, EACH NIGHT (early_warning.nightly, just after midnight in India): runCheck, the check "Check
//     now" runs. The flags it opens or closes say "the nightly check". A second run the same night changes nothing.
//   - THE SCHOOL HEALTH AUDITOR, EACH WEEK (auditor.weekly, early each Monday in India): runCheckUp, the check-up a
//     person runs, kept as the day's record, which says "the weekly check-up". ONE A WEEK: a school that already has
//     a check-up this week (a person ran one, or an earlier try of this job recorded it) is left as it is. The job
//     only ever inserts: a past day's check-up never changes, and nor does today's once it is there.
//   - A school whose module was switched off, or that became read-only or suspended, after the job was queued is left
//     as it is: the job does nothing and succeeds. A failure is retried by the queue. Rules only: no language model.

export { NIGHTLY_CHECK_JOB, WEEKLY_CHECK_UP_JOB };

export type CheckOutcome = 'done' | 'already' | 'off';
type Deps = { asSchool: AsSchool; now?: () => Date; onDone?: (schoolId: string, outcome: CheckOutcome) => void };

export function earlyWarningNightlyHandler(deps: Deps): JobHandler {
  return async (job) => {
    const now = (deps.now ?? (() => new Date()))();
    const schoolId = schoolOfJob(job, 'date', indiaDate(now));
    const outcome = await deps.asSchool(schoolId, NIGHTLY_CHECK_JOB, async (db): Promise<CheckOutcome> => {
      if (!(await entitlementsIfOn(db, schoolId, 'early-warning'))) return 'off';
      const done = await runCheck(db, { schoolId, job: NIGHTLY_CHECK_JOB }, now);
      if (!done.ok) throw new PermanentJobError(`${NIGHTLY_CHECK_JOB}: the check was refused (${done.reason})`);
      return 'done';
    });
    deps.onDone?.(schoolId, outcome);
  };
}

export function auditorWeeklyHandler(deps: Deps): JobHandler {
  return async (job) => {
    const today = indiaDate((deps.now ?? (() => new Date()))());
    const schoolId = schoolOfJob(job, 'week', today);
    const outcome = await deps.asSchool(schoolId, WEEKLY_CHECK_UP_JOB, async (db): Promise<CheckOutcome> => {
      const entitlements = await entitlementsIfOn(db, schoolId, 'school-auditor');
      if (!entitlements) return 'off';
      // One a week: the Monday of today's week to today, in India.
      if ((await db.query(`select 1 from school_health_runs where school_id = $1 and run_date between $2::date and $3::date limit 1`, [schoolId, weekStart(today), today])).rows[0]) return 'already';
      const checkUp = await runCheckUp(db, { schoolId, userId: NO_PERSON, role: 'principal' }, entitlements, { today });
      return (await recordWeeklyCheckUp(db, schoolId, checkUp)) ? 'done' : 'already';
    });
    deps.onDone?.(schoolId, outcome);
  };
}
