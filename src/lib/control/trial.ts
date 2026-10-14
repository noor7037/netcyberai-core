import { writeEntitlementAudit } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { isModuleId, type ModuleId } from '@/lib/contracts/modules';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { addLegacySubscription, applyPlan, defaultPlanId, workingModules } from '@/lib/frameworks/plans';
import type { Sql } from '@/lib/jobs/types';
import { indiaDate, isIsoDate } from '@/lib/time/india';
import { syncComplimentaryModules } from './billing-terms';

// The free first month (C223-A answer 2, C226; the design is docs/30_FREE_MONTH_TRIAL.md).
//
// DAYS. Day 0 is the day Control starts it (India's date). ends_on is day 30 by default, the LAST day of the free
// month, inclusive. Day 31 begins at midnight in India, and the nightly billing job moves the school to its plan.
// "N days left" is ends_on − today, in India's calendar.
//
// STORED, not worked out: the free month is a row of school_trials; its modules are the school's switch rows with
// source 'trial'; school_plan_has_feature answers yes for every feature while the row has no ended_at. The nightly
// job ends all three together. The plan after the free month is the school's subscription plan.
//
// Control runs everything here as the platform role. Each start and extension carries a reason, kept where only the
// founder reads it (writeEntitlementAudit → entitlement_change_reasons, C124); the audit rows hold dates, plan ids and
// module ids only (C56).

// C223-A: "a 30-day trial", and "the principal is told 7 days before".
export const TRIAL_DAYS = 30;
export const TRIAL_NOTICE_DAYS = 7;
// The last day is at most this many days after day 0: a slip of the year is refused (the database's check too).
export const MAX_TRIAL_DAYS = 90;
// Who of the school reads its free month (row level security says the same).
export const TRIAL_READERS = ['principal', 'school_admin'] as const;

export const addDays = (isoDay: string, n: number) => new Date(Date.parse(`${isoDay}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const cleanReason = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');
// The same lock as the payment check and a recorded payment: a free month, a payment and the check never cross.
const lockSchool = (db: Sql, schoolId: string) => db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`billing:${schoolId}`]);

export type Trial = {
  schoolId: string;
  schoolName: string;
  isTest: boolean;
  startsOn: string; // day 0
  endsOn: string; // the last day, inclusive
  daysLeft: number; // endsOn − today; 0 on the last day, below 0 once past
  inForce: boolean; // not moved to its plan yet
  endedAt: string | null;
  planId: string | null; // the plan after the free month (the one it moved to, once ended)
  planName: string | null;
  extensions: number;
  startedBy: string;
  startedAt: string;
};

// Every school with a free month (or one school's), in force first, the soonest last day first; then those that have
// ended, the latest first. Read as the platform role only.
export async function listTrials(db: Sql, today: string = indiaDate(), schoolId: string | null = null): Promise<Trial[]> {
  const { rows } = await db.query(
    `select t.school_id, s.name, s.is_test_fixture, t.starts_on::text as starts_on, t.ends_on::text as ends_on, t.ended_at,
            coalesce(t.ended_plan_id, sub.plan_id) as plan_id, p.name as plan_name, coalesce(u.display_name, '') as started_by, t.started_at,
            (select count(*)::int from audit_log a where a.school_id = t.school_id and a.event_action = 'entitlement.trial_extended') as extensions
       from school_trials t
       join schools s on s.school_id = t.school_id
       left join school_subscriptions sub on sub.school_id = t.school_id
       left join plans p on p.plan_id = coalesce(t.ended_plan_id, sub.plan_id)
       left join users u on u.user_id = t.started_by
      where ($1::uuid is null or t.school_id = $1::uuid)
      order by (t.ended_at is not null), case when t.ended_at is null then t.ends_on end, t.ends_on desc, lower(s.name), t.school_id`,
    [schoolId]
  );
  return rows.map((r) => ({
    schoolId: r.school_id,
    schoolName: r.name,
    isTest: r.is_test_fixture === true,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    daysLeft: daysBetween(today, r.ends_on),
    inForce: r.ended_at === null || r.ended_at === undefined,
    endedAt: r.ended_at ? new Date(r.ended_at).toISOString() : null,
    planId: (r.plan_id as string | null) ?? null,
    planName: (r.plan_name as string | null) ?? null,
    extensions: Number(r.extensions),
    startedBy: r.started_by,
    startedAt: new Date(r.started_at).toISOString(),
  }));
}

export type TrialEvent = {
  id: string;
  at: string;
  kind: 'started' | 'extended' | 'ended';
  endsOn: string | null;
  endsOnBefore: string | null;
  planId: string | null;
  actorName: string | null; // null: the nightly job
  reason: string | null; // the founder's own words; Control only
};

// A school's free month as it happened, newest first, with each reason (from the founder-only table: this fails for a
// school role, which has no grant on it). Read as the platform role only.
export async function trialHistory(db: Sql, schoolId: string): Promise<TrialEvent[]> {
  const { rows } = await db.query(
    `select a.audit_id, a.occurred_at, a.event_action, a.before_state, a.after_state, u.display_name, r.reason
       from audit_log a
       left join users u on u.user_id = a.actor_user_id
       left join entitlement_change_reasons r on r.audit_id = a.audit_id
      where a.school_id = $1 and a.event_action in ('entitlement.trial_started', 'entitlement.trial_extended', 'entitlement.trial_ended')
      order by a.audit_id desc limit 50`,
    [schoolId]
  );
  return rows.map((r) => {
    const before = (r.before_state ?? {}) as Record<string, unknown>;
    const after = (r.after_state ?? {}) as Record<string, unknown>;
    const text = (v: unknown) => (typeof v === 'string' ? v : null);
    return {
      id: String(r.audit_id),
      at: new Date(r.occurred_at).toISOString(),
      kind: r.event_action === 'entitlement.trial_started' ? 'started' : r.event_action === 'entitlement.trial_extended' ? 'extended' : 'ended',
      endsOn: text(after.ends_on),
      endsOnBefore: text(before.ends_on),
      planId: text(after.plan),
      actorName: (r.display_name as string | null) ?? null,
      reason: (r.reason as string | null) ?? null,
    };
  });
}

// Every module that works today switched on as 'trial', except a module the founder set by hand (founder_override),
// which keeps the founder's choice. A 'plan' or 'complimentary' row becomes 'trial' and keeps its limits. Returns the
// modules this changed.
async function trialModulesOn(db: Sql, schoolId: string): Promise<ModuleId[]> {
  const { rows } = await db.query(
    `insert into school_module_entitlements (school_id, module_id, enabled, source)
     select $1, m, true, 'trial' from unnest($2::text[]) as m
     on conflict (school_id, module_id) do update set enabled = true, source = 'trial', updated_at = now()
       where school_module_entitlements.source in ('plan', 'complimentary')
          or (school_module_entitlements.source = 'trial' and not school_module_entitlements.enabled)
     returning module_id`,
    [schoolId, workingModules()]
  );
  return rows.map((r) => r.module_id as string).filter(isModuleId).sort();
}

type By = { userId: string; role: StaffRole };
export type TrialProblem = 'not_found' | 'trial_used' | 'billed' | 'ends_on' | 'reason' | 'plan' | 'retired' | 'test_only' | 'no_trial' | 'trial_over';
export type StartTrialResult = { ok: true; endsOn: string; planId: string; modules: ModuleId[] } | { ok: false; reason: TrialProblem };
export type ExtendTrialResult = { ok: true; endsOn: string } | { ok: false; reason: TrialProblem };

// Starts a school's free month today (day 0), to `endsOn` (day 30 when not given), with the plan after it: the one
// Control chose, else the school's subscription plan, else the plan for new schools. A school has one free month,
// ever, and only before it has paid (a school that pays gets complimentary modules instead, C212).
export async function startTrial(db: Sql, by: By, schoolId: string, input: { endsOn?: unknown; planId?: unknown; reason: unknown }, today: string = indiaDate()): Promise<StartTrialResult> {
  if (!isUuid(schoolId)) return { ok: false, reason: 'not_found' };
  const reason = cleanReason(input.reason);
  if (reason.length < 3 || reason.length > 500) return { ok: false, reason: 'reason' };
  const endsOn = input.endsOn === undefined || input.endsOn === null || input.endsOn === '' ? addDays(today, TRIAL_DAYS) : input.endsOn;
  if (!isIsoDate(endsOn) || endsOn <= today || daysBetween(today, endsOn) > MAX_TRIAL_DAYS) return { ok: false, reason: 'ends_on' };
  const chosen = input.planId === undefined || input.planId === null || input.planId === '' ? null : input.planId;
  if (chosen !== null && typeof chosen !== 'string') return { ok: false, reason: 'plan' };

  await lockSchool(db, schoolId);
  if (!(await db.query(`select 1 from schools where school_id = $1`, [schoolId])).rows[0]) return { ok: false, reason: 'not_found' };
  if ((await db.query(`select 1 from school_trials where school_id = $1`, [schoolId])).rows[0]) return { ok: false, reason: 'trial_used' };
  await addLegacySubscription(db, schoolId, by.userId);
  const sub = (await db.query(`select plan_id, paid_until from school_subscriptions where school_id = $1 for update`, [schoolId])).rows[0];
  if (sub?.paid_until) return { ok: false, reason: 'billed' };
  const planId = chosen ?? (sub?.plan_id as string | undefined) ?? (await defaultPlanId(db));
  if (!planId) return { ok: false, reason: 'plan' };
  if (planId !== sub?.plan_id) {
    // The plan after the free month is the school's plan: put it on that plan first, as "Change plan" would.
    const applied = await applyPlan(db, schoolId, planId, by, reason);
    if (!applied.ok) return { ok: false, reason: applied.error === 'plan retired' ? 'retired' : applied.error === 'test schools only' ? 'test_only' : 'plan' };
  }
  await db.query(`insert into school_trials (school_id, starts_on, ends_on, started_by) values ($1, $2::date, $3::date, $4)`, [schoolId, today, endsOn, by.userId]);
  const modules = await trialModulesOn(db, schoolId);
  await writeEntitlementAudit(db, {
    schoolId,
    actorUserId: by.userId,
    actorRole: by.role,
    eventAction: 'entitlement.trial_started',
    targetType: 'school_trials',
    targetId: schoolId,
    afterState: { starts_on: today, ends_on: endsOn, plan: planId, modules },
  }, reason);
  return { ok: true, endsOn, planId, modules };
}

// Moves the last day later: today or later, at most MAX_TRIAL_DAYS after day 0, with a reason. Until the nightly job
// has moved the school (so also on day 31 before it runs); after that the free month is over for good.
export async function extendTrial(db: Sql, by: By, schoolId: string, input: { endsOn: unknown; reason: unknown }, today: string = indiaDate()): Promise<ExtendTrialResult> {
  if (!isUuid(schoolId)) return { ok: false, reason: 'not_found' };
  const reason = cleanReason(input.reason);
  if (reason.length < 3 || reason.length > 500) return { ok: false, reason: 'reason' };
  await lockSchool(db, schoolId);
  const row = (await db.query(`select starts_on::text as starts_on, ends_on::text as ends_on, ended_at from school_trials where school_id = $1 for update`, [schoolId])).rows[0];
  if (!row) return { ok: false, reason: (await db.query(`select 1 from schools where school_id = $1`, [schoolId])).rows[0] ? 'no_trial' : 'not_found' };
  if (row.ended_at !== null) return { ok: false, reason: 'trial_over' };
  const endsOn = input.endsOn;
  if (!isIsoDate(endsOn) || endsOn <= row.ends_on || endsOn < today || daysBetween(row.starts_on, endsOn) > MAX_TRIAL_DAYS) return { ok: false, reason: 'ends_on' };
  await db.query(`update school_trials set ends_on = $2::date where school_id = $1`, [schoolId, endsOn]);
  await writeEntitlementAudit(db, {
    schoolId,
    actorUserId: by.userId,
    actorRole: by.role,
    eventAction: 'entitlement.trial_extended',
    targetType: 'school_trials',
    targetId: schoolId,
    beforeState: { ends_on: row.ends_on },
    afterState: { ends_on: endsOn },
  }, reason);
  return { ok: true, endsOn };
}

// The free months the nightly job looks after: every one in force, with its last day.
export async function trialsInForce(db: Sql): Promise<{ schoolId: string; endsOn: string }[]> {
  const { rows } = await db.query(`select school_id, ends_on::text as ends_on from school_trials where ended_at is null order by ends_on, school_id`);
  return rows.map((r) => ({ schoolId: r.school_id as string, endsOn: r.ends_on as string }));
}

export type TrialMove = { planId: string; switchedOff: ModuleId[] };

// The nightly move, for one school, as of `today` (India's date of the job's own clock): when the last day is before
// today and the school has not been moved yet, its 'trial' rows become 'plan' rows, its plan is applied (on with the
// plan's limits; the rest off; Help never), complimentary terms in force today are switched on again, and the free
// month is ended, audited by nobody (`job` names the job). Re-reads the row under the school's lock, so a second run,
// or a late one, moves it once. Null when there was nothing to do.
export async function endTrialIfOver(db: Sql, schoolId: string, today: string, job: string): Promise<TrialMove | null> {
  await lockSchool(db, schoolId);
  const row = (await db.query(`select ends_on::text as ends_on, ended_at from school_trials where school_id = $1 for update`, [schoolId])).rows[0];
  if (!row || row.ended_at !== null || row.ends_on >= today) return null;
  const planId = ((await db.query(`select plan_id from school_subscriptions where school_id = $1`, [schoolId])).rows[0]?.plan_id as string | undefined) ?? (await defaultPlanId(db));
  if (!planId) throw new Error('trial: no plan to move the school to');
  await db.query(`update school_module_entitlements set source = 'plan', updated_at = now() where school_id = $1 and source = 'trial'`, [schoolId]);
  const reason = `Free month: the last day was ${row.ends_on}. On the school's plan from ${today}.`;
  const applied = await applyPlan(db, schoolId, planId, { userId: null, role: null }, reason);
  if (!applied.ok) throw new Error(`trial: the plan was not applied (${applied.error})`);
  const complimentary = await syncComplimentaryModules(db, schoolId, today, null);
  const switchedOff = applied.switchedOff.filter((m) => !complimentary.on.includes(m));
  await db.query(`update school_trials set ended_at = now(), ended_plan_id = $2 where school_id = $1`, [schoolId, planId]);
  await writeEntitlementAudit(db, {
    schoolId,
    actorUserId: null,
    actorRole: null,
    eventAction: 'entitlement.trial_ended',
    targetType: 'school_trials',
    targetId: schoolId,
    beforeState: { ends_on: row.ends_on },
    afterState: { ends_on: row.ends_on, plan: planId, switched_off: switchedOff, by: job, checked_for: today },
  }, reason);
  return { planId, switchedOff };
}

// For a school still in its free month: a module that has started working since (a deploy) is switched on as 'trial',
// audited as a module change by nobody. Idempotent.
export async function topUpTrialModules(db: Sql, schoolId: string): Promise<ModuleId[]> {
  await lockSchool(db, schoolId);
  const row = (await db.query(`select ended_at from school_trials where school_id = $1 for update`, [schoolId])).rows[0];
  if (!row || row.ended_at !== null) return [];
  const added = await trialModulesOn(db, schoolId);
  for (const moduleId of added) {
    await writeEntitlementAudit(db, {
      schoolId,
      actorUserId: null,
      actorRole: null,
      eventAction: 'entitlement.module_changed',
      targetType: 'school_module_entitlements',
      targetId: moduleId,
      afterState: { enabled: true, source: 'trial' },
    }, 'Free month: this module works now, so it is switched on until the free month ends.');
  }
  return added;
}
