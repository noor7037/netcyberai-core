import type { PoolClient } from 'pg';
import { withSchoolJobContext, type SchoolJob } from '@/lib/auth/db';
import { canWrite, isModuleEnabled, type SchoolEntitlements } from '@/lib/contracts/entitlements';
import type { ModuleId } from '@/lib/contracts/modules';
import { loadEntitlements } from '@/lib/frameworks/entitlements';
import { isIsoDate } from '@/lib/time/india';
import { PermanentJobError, type ClaimedJob } from './types';

// A school's own scheduled check (C210): Early Warning each night, the School Health Auditor each week.
//
//   - It runs AS THE SCHOOL'S OFFICE SEES IT: the app's role in the school's own tenant, the role 'principal', no
//     person, and the job's name in app.current_job (withSchoolJobContext, src/lib/auth/db.ts, the one place a
//     session is set up). Row level security decides every read exactly as for the principal, so what the job finds
//     is what the office's own "Check now" finds. The platform role is not used for any of it.
//   - The school comes from the job row only, which the database's own enqueue functions wrote (a school session
//     cannot queue these job types). Nothing here is reachable from a request: only the job runner's handlers
//     (./school-checks.ts, wired in ./handlers.ts) call it, which a test holds.
//   - A school whose module was switched off, or that became read-only or suspended, after the job was queued is
//     left as it is: the job does nothing and succeeds.

// The session a check runs in. Production opens a real one; a test passes the same statements on its own database.
export type AsSchool = <T>(schoolId: string, job: SchoolJob, fn: (db: PoolClient) => Promise<T>) => Promise<T>;
export const asSchool: AsSchool = withSchoolJobContext;

// The school a job is for, and that its date (or week) has begun in India. A job that waited in the queue runs for
// the day it is now; it never runs for a day still to come.
export function schoolOfJob(job: ClaimedJob, dateKey: 'date' | 'week', today: string): string {
  if (!job.schoolId) throw new PermanentJobError(`${job.type}: no school`);
  const asked = job.payload[dateKey];
  if (asked !== undefined && !isIsoDate(asked)) throw new PermanentJobError(`${job.type}: bad ${dateKey}`);
  if (typeof asked === 'string' && asked > today) throw new Error(`${job.type}: that day has not begun in India`);
  return job.schoolId;
}

// The school's entitlements when it still has the module on and may have its records changed, read in the job's
// own session; null otherwise.
export async function entitlementsIfOn(db: PoolClient, schoolId: string, moduleId: ModuleId): Promise<SchoolEntitlements | null> {
  const entitlements = await loadEntitlements(db, schoolId);
  return isModuleEnabled(entitlements, moduleId) && canWrite(entitlements) ? entitlements : null;
}
