import { writeEntitlementAudit } from '@/lib/audit/log';
import { PermanentJobError, type JobHandler, type Sql } from '@/lib/jobs/types';
import { indiaDate, isIsoDate } from '@/lib/time/india';

// The nightly billing check (docs/26 slice 8e, C204). Just after midnight in
// India, for every school that is not a test school and has a paid-until day:
//
//   past paid-until, within the plan's grace days  → access 'grace', ending
//                                                     when the last grace day ends
//   past the grace days                            → access 'read_only'
//
// So a school's state is a stored fact, changed on a date, and not something
// worked out only when somebody opens a screen.
//
// WHAT IT NEVER TOUCHES, and how it knows. The check remembers its own work
// in school_subscriptions (billing_access, billing_grace_ends_at): what it
// last set for this paid-until day. It moves a school one step at a time,
// and only from the state it left it in:
//
//   'full', and it has set nothing for this paid-until day  → grace or read-only
//   'grace', exactly as it set it (same mode, same end)      → read-only when that end has passed
//   anything else                                            → nothing
//
// "Anything else" is a person's decision: a suspended school, a read-only or
// a grace period set by hand in Control (a hand-set mode never has the
// check's own end time: the check ends grace at midnight, Control at
// 23:59:59, and a hand-set read-only has no end time at all), and also
// 'full' set by hand after the check had acted (the founder giving a school
// more time). That choice stands until a payment moves the paid-until day:
// the memory is of that day, so it goes with it (recordPayment in
// billing.ts). Until then the check is off for that school, and Billing &
// Plans says so on the school's card. A school with no paid-until day is not
// billed yet and is never touched.
//
// Every change is audited as an access change with its reason, by nobody
// (the platform itself), so it shows in the school's history in Control.
// Running the same night again changes nothing: the school is no longer in
// the state the step starts from.
//
// A payment recorded in Control settles the school's access in its own
// transaction, from the same facts and with the same writer as the check
// (billingFacts, writeBillingAccess), but audited as the payment's doing, by
// the person who recorded it: the nightly job is named only for what the
// nightly job did.

export const BILLING_NIGHTLY_JOB = 'billing.nightly';

// True when the school's stored access is exactly what the check last set.
export const billingOwnSql = (sub: string, ent: string) => `(${sub}.billing_access is not null and ${ent}.access_mode = ${sub}.billing_access and ${ent}.grace_ends_at = ${sub}.billing_grace_ends_at)`;

export type BillingStep = { from: 'full' | 'grace'; to: 'grace' | 'read_only'; paidUntil: string; graceDays: number; since: string };

// What the check works from: one billed school's paid-until day against
// `today` (India's date), with its plan's days of grace and the access it
// has now. Undefined: no paid-until day yet, or a test school. Locks the
// school's subscription row, inside the caller's transaction as the platform
// role.
export type BillingFacts = {
  planId: string;
  paidUntil: string;
  graceDays: number;
  accessMode: 'full' | 'grace' | 'read_only' | 'suspended';
  graceEndsAt: unknown; // the stored end, as the database gave it
  billingAccess: 'grace' | 'read_only' | null; // what the check last set for this paid-until day
  own: boolean; // the stored access is exactly what the check last set
  pastDue: boolean;
  pastGrace: boolean;
  graceEnd: unknown; // when the plan's grace ends for this paid-until day: midnight in India after the last grace day
  lastGraceDay: string;
  storedGraceOver: boolean;
  storedGraceDay: string | null;
};

export async function billingFacts(db: Sql, schoolId: string, today: string): Promise<BillingFacts | undefined> {
  await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`billing:${schoolId}`]);
  const r = (await db.query(
    `select sub.plan_id, sub.paid_until::text as paid_until, sub.billing_access, p.grace_days,
            coalesce(e.access_mode, 'full') as access_mode, e.grace_ends_at,
            coalesce(${billingOwnSql('sub', 'e')}, false) as own,
            ($2::date > sub.paid_until) as past_due,
            ($2::date > sub.paid_until + p.grace_days) as past_grace,
            ((sub.paid_until + p.grace_days + 1)::timestamp at time zone 'Asia/Kolkata') as grace_end,
            (sub.paid_until + p.grace_days)::text as last_grace_day,
            coalesce(e.grace_ends_at <= ($2::date::timestamp at time zone 'Asia/Kolkata'), false) as stored_grace_over,
            ((e.grace_ends_at at time zone 'Asia/Kolkata')::date)::text as stored_grace_day
       from school_subscriptions sub
       join plans p on p.plan_id = sub.plan_id
       join schools s on s.school_id = sub.school_id
       left join school_entitlements e on e.school_id = sub.school_id
      where sub.school_id = $1 and sub.paid_until is not null and not s.is_test_fixture
        for update of sub`,
    [schoolId, today]
  )).rows[0];
  if (!r) return undefined;
  return {
    planId: r.plan_id,
    paidUntil: r.paid_until,
    graceDays: Number(r.grace_days),
    accessMode: r.access_mode,
    graceEndsAt: r.grace_ends_at ?? null,
    billingAccess: r.billing_access ?? null,
    own: r.own === true,
    pastDue: r.past_due === true,
    pastGrace: r.past_grace === true,
    graceEnd: r.grace_end,
    lastGraceDay: r.last_grace_day,
    storedGraceOver: r.stored_grace_over === true,
    storedGraceDay: r.stored_grace_day ?? null,
  };
}

export const graceDaysInWords = (graceDays: number) => `${graceDays} ${graceDays === 1 ? 'day' : 'days'} of grace`;

// Stores grace or read-only for a school and remembers it as the check's own
// work for this paid-until day. The end time in the memory is copied from the
// row just written, so the two are the same to the microsecond: that
// sameness is how the check knows its own work. updatedBy is nobody for the
// nightly check, and the person when a payment recorded in Control caused it.
export async function writeBillingAccess(
  db: Sql,
  schoolId: string,
  set: { planId: string; to: 'grace' | 'read_only'; graceEndsAt: unknown; since: string; updatedBy: string | null }
): Promise<{ access_mode: string; grace_ends_at: unknown }> {
  const { rows: after } = await db.query(
    `insert into school_entitlements (school_id, plan, access_mode, grace_ends_at, updated_by) values ($1, $2, $3, $4, $5)
     on conflict (school_id) do update
       set access_mode = excluded.access_mode, grace_ends_at = excluded.grace_ends_at, updated_by = excluded.updated_by, updated_at = now()
     returning access_mode, grace_ends_at`,
    [schoolId, set.planId, set.to, set.graceEndsAt, set.updatedBy]
  );
  await db.query(
    `update school_subscriptions sub set billing_access = $2, billing_access_since = $3::date, billing_grace_ends_at = e.grace_ends_at
       from school_entitlements e where e.school_id = sub.school_id and sub.school_id = $1`,
    [schoolId, set.to, set.since]
  );
  return after[0];
}

// One school, as of `today` (India's date), inside the caller's transaction as the platform role.
export async function runBillingCheckForSchool(db: Sql, schoolId: string, today: string): Promise<BillingStep | null> {
  const r = await billingFacts(db, schoolId, today);
  if (!r || !r.pastDue) return null;

  let step: { to: 'grace' | 'read_only'; graceEndsAt: unknown; since: string; reason: string } | null = null;
  const days = graceDaysInWords(r.graceDays);
  if (r.accessMode === 'full' && r.billingAccess === null) {
    step = r.pastGrace
      ? { to: 'read_only', graceEndsAt: r.graceEnd, since: today, reason: `Billing check: paid until ${r.paidUntil}; the plan gives ${days}, which ended with ${r.lastGraceDay}. Read-only from ${today}.` }
      : { to: 'grace', graceEndsAt: r.graceEnd, since: today, reason: `Billing check: paid until ${r.paidUntil}; the plan gives ${days}. In grace until the end of ${r.lastGraceDay}.` };
  } else if (r.accessMode === 'grace' && r.own && r.storedGraceOver && r.storedGraceDay) {
    step = { to: 'read_only', graceEndsAt: r.graceEndsAt, since: r.storedGraceDay, reason: `Billing check: paid until ${r.paidUntil}; the grace period ended. Read-only from ${r.storedGraceDay}.` };
  }
  if (!step) return null;

  const after = await writeBillingAccess(db, schoolId, { planId: r.planId, to: step.to, graceEndsAt: step.graceEndsAt, since: step.since, updatedBy: null });
  await writeEntitlementAudit(db, {
    schoolId,
    actorUserId: null,
    actorRole: null,
    eventAction: 'entitlement.access_changed',
    targetType: 'school_entitlements',
    targetId: schoolId,
    beforeState: { access_mode: r.accessMode, grace_ends_at: r.graceEndsAt },
    afterState: { ...after, by: BILLING_NIGHTLY_JOB, paid_until: r.paidUntil, grace_days: r.graceDays, checked_for: today },
  }, step.reason);
  return { from: r.accessMode as 'full' | 'grace', to: step.to, paidUntil: r.paidUntil, graceDays: r.graceDays, since: step.since };
}

type Platform = <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;

// The job: every billed school past its paid-until day, each in its own
// transaction, so one school's failure does not undo another's. A failure
// is retried by the queue; a school already moved is left as it is.
export function billingNightlyHandler(deps: { platform: Platform; now?: () => Date }): JobHandler {
  return async (job) => {
    const today = indiaDate((deps.now ?? (() => new Date()))());
    const asked = job.payload.date;
    if (asked !== undefined && !isIsoDate(asked)) throw new PermanentJobError('billing.nightly: bad date');
    // A job that waited in the queue checks for the day it is now, never for a day still to come.
    if (typeof asked === 'string' && asked > today) throw new Error('billing.nightly: that day has not begun in India');
    const schools = await deps.platform(async (db) =>
      (await db.query(
        `select sub.school_id from school_subscriptions sub join schools s on s.school_id = sub.school_id
          where not s.is_test_fixture and sub.paid_until is not null and sub.paid_until < $1::date order by sub.school_id`,
        [today]
      )).rows.map((r) => r.school_id as string)
    );
    const failed: string[] = [];
    for (const schoolId of schools) {
      try {
        await deps.platform((db) => runBillingCheckForSchool(db, schoolId, today));
      } catch {
        failed.push(schoolId);
      }
    }
    if (failed.length > 0) throw new Error(`billing.nightly: ${failed.length} school(s) not done`);
  };
}
