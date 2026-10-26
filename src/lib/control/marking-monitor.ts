import type { PoolClient } from 'pg';
import { BACKLOG_AFTER_MINUTES } from '@/lib/observability/health';
import { cutContacts } from './monitoring';

// Control → Monitoring → AI marking (docs/35, C347): how each school's answer-sheet marking is going, read in one
// place as the platform role (the founder's session), by the conventions of ./monitoring.ts.
//
// COUNTS AND AGES ONLY. The platform role has no right on the marking tables (AM-1), so the counts are read through
// one definer function, public.marking_monitor() (the file am-6-marking-monitor.sql, to become a migration),
// that names no column of a child, a page or a mark. The loader reads no child's name, no page (not its picture, its
// storage key or what the AI read on it) and no mark, and not a job's payload. What it returns is how many, how long
// ago, which school (its name, nothing else) and which job type. The one free text it returns, a dead job's last
// error, goes through cutContacts first.
//
// A school here is a LIVE school: a test school's scripts are left out, as everywhere in Control. Jobs belong to the
// platform, so every dead marking job counts; its school is named only when it is a live one.
//
// Which schools are listed: those with a page limit set for AI marking in their plan, and those that have any
// script or page at all.

type Sql = Pick<PoolClient, 'query'>;

// The marking jobs' type names begin with this (the pipeline's job handlers, docs/35 PR AM-2).
export const MARKING_JOB_PREFIX = 'marking.';
export const MARKING_JOBS_LISTED = 20;
export const MARKING_SCHOOLS_LISTED = 100;

export type MarkingSchoolRow = {
  schoolName: string;
  pagesThisMonth: number; // pages kept for marking since the first of this month in India; a duplicate is not counted
  limit: number | null; // the plan's monthly page limit; null: none set (AI marking is off for the school)
  waiting: number; // scripts waiting for the AI to mark them
  marking: number; // being marked now
  marked: number; // marked, with a teacher to check and approve
  failed: number;
  approvedThisMonth: number;
  oldestWaitingSeconds: number | null;
};
export type MarkingDeadJob = { jobId: string; type: string; schoolName: string | null; attempts: number; maxAttempts: number; error: string | null; forSeconds: number };
export type MarkingMonitor = {
  schools: MarkingSchoolRow[];
  schoolsNotListed: number; // live schools with marking activity beyond the list's length
  jobs: { dead: number; retrying: number; listed: MarkingDeadJob[] };
  backlogAfterMinutes: number;
};

const num = (v: unknown) => Number(v ?? 0);

export async function loadMarkingMonitor(db: Sql): Promise<MarkingMonitor> {
  // One clock for every age: the database's, as this transaction sees it.
  const at = new Date((await db.query(`select now() as at`)).rows[0].at as string).getTime();
  const since = (v: unknown): number | null => (v ? Math.max(0, Math.floor((at - new Date(v as string).getTime()) / 1000)) : null);

  // The counts come from public.marking_monitor(): the platform role has no right on the marking tables, and that one
  // function, which names none of a child, a page or a mark, returns counts and times per live school.
  const rows = (await db.query(`select * from public.marking_monitor()`)).rows;
  const schools: MarkingSchoolRow[] = rows.slice(0, MARKING_SCHOOLS_LISTED).map((r) => ({
    schoolName: r.school_name as string,
    pagesThisMonth: num(r.pages_this_month),
    limit: r.page_limit === null || r.page_limit === undefined ? null : Number(r.page_limit),
    waiting: num(r.waiting),
    marking: num(r.marking),
    marked: num(r.marked),
    failed: num(r.failed),
    approvedThisMonth: num(r.approved_this_month),
    oldestWaitingSeconds: since(r.oldest_waiting_at),
  }));

  // Dead marking jobs, newest first, with the same Retry the Background jobs section offers. The payload is not read.
  const count = (await db.query(
    `select count(*) filter (where status = 'dead')::int as dead, count(*) filter (where status = 'pending' and attempts > 0)::int as retrying from jobs where left(type, ${MARKING_JOB_PREFIX.length}) = $1`,
    [MARKING_JOB_PREFIX]
  )).rows[0];
  const listed: MarkingDeadJob[] = (await db.query(
    `select j.job_id, j.type, j.attempts, j.max_attempts, j.last_error, j.updated_at, case when s.is_test_fixture then null else s.name end as school_name
       from jobs j left join schools s on s.school_id = j.school_id
      where left(j.type, ${MARKING_JOB_PREFIX.length}) = $1 and j.status = 'dead'
      order by j.updated_at desc, j.job_id limit $2`,
    [MARKING_JOB_PREFIX, MARKING_JOBS_LISTED]
  )).rows.map((p) => ({
    jobId: p.job_id as string,
    type: p.type as string,
    schoolName: (p.school_name as string | null) ?? null,
    attempts: num(p.attempts),
    maxAttempts: num(p.max_attempts),
    error: cutContacts(p.last_error as string | null),
    forSeconds: since(p.updated_at) ?? 0,
  }));

  return { schools, schoolsNotListed: Math.max(0, rows.length - schools.length), jobs: { dead: num(count.dead), retrying: num(count.retrying), listed }, backlogAfterMinutes: BACKLOG_AFTER_MINUTES };
}

// A school that has used its month's pages: marking stops until the plan's limit is raised.
export const atLimit = (s: Pick<MarkingSchoolRow, 'limit' | 'pagesThisMonth'>) => s.limit !== null && s.pagesThisMonth >= s.limit;
// A script that has waited past the minutes the job queue allows before it calls itself backed up.
export const backedUp = (s: Pick<MarkingSchoolRow, 'oldestWaitingSeconds'>, minutes: number) => s.oldestWaitingSeconds !== null && s.oldestWaitingSeconds > minutes * 60;

// The section "needs a look" when something in it waits on NetCyberAI: a job that gave up, a school at its page
// limit (only the plan's limit lets it go on), or a script that has waited too long for the AI.
export function markingNeedsALook(m: MarkingMonitor): boolean {
  return m.jobs.dead > 0 || m.schools.some((s) => atLimit(s) || backedUp(s, m.backlogAfterMinutes));
}
