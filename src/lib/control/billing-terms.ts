import { writeAuditLog, writeEntitlementAudit } from '@/lib/audit/log';
import { isAlwaysOn } from '@/lib/contracts/entitlements';
import { isModuleId, type ModuleId } from '@/lib/contracts/modules';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { addLegacySubscription, isBillingPeriod, loadPlan, workingModules, type BillingPeriod } from '@/lib/frameworks/plans';
import type { Sql } from '@/lib/jobs/types';
import { indiaDate, isIsoDate } from '@/lib/time/india';
import { BP_IN_WHOLE, MAX_STUDENT_MONTH_PAISE, MAX_STUDENT_YEAR_PAISE } from './billing-amount';

// A school's own terms (founder, C212), typed in Control and read there only: a negotiated price per student (a
// month and a year), a complimentary module (always with a last day), a discount and a minimum number of billed
// students. Each carries a reason, a first day and an optional last day, and is audited. They are dated rows,
// never changed and never removed: a new row of the same kind ends the old one the day before it begins (a row that
// had not begun yet is replaced before its first day), and "End" brings a row's last day forward. A day already
// past is never rewritten, so what was in force on any day stays on record. The database holds the same rules
// (the school_billing_terms_guard trigger). The amount these give is worked out in billing-amount.ts.
//
// The audit rows ('billing.terms.%') carry the values and the reason; the database hides them from every school
// role. Everything here runs as the platform role.
//
// COMPLIMENTARY MODULES are switched on and off by stored rows, not worked out when a screen is read: the
// module's school_module_entitlements row gets source 'complimentary' from the term's first day, and after its
// last day goes back to what the school's plan gives. Every place that reads a module's switch therefore agrees.
// syncComplimentaryModules does it: at once when a term is added or ended (for today), and each night in the
// billing nightly job (src/lib/control/billing-nightly.ts) for terms that begin or end on that day. A module the
// founder switched by hand, or a trial, keeps that choice.

export const TERM_KINDS = ['price', 'complimentary', 'discount', 'minimum'] as const;
export type TermKind = (typeof TERM_KINDS)[number];
const isTermKind = (v: unknown): v is TermKind => (TERM_KINDS as readonly unknown[]).includes(v);
export const MAX_MINIMUM_STUDENTS = 1_000_000;
// A first day is today or later, and not further ahead than this (a slip of the year).
const MAX_DAYS_AHEAD = 3660;

type By = { userId: string };
const lockTerms = (db: Sql, schoolId: string) => db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`billing-terms:${schoolId}`]);
const addDays = (isoDay: string, n: number) => new Date(Date.parse(`${isoDay}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const cleanReason = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

// in_force: today is one of its days. later: it begins after today. ended: its last day is past. never: replaced
// or ended before its first day.
export type TermState = 'in_force' | 'later' | 'ended' | 'never';
export type BillingTerm = {
  termId: string;
  kind: TermKind;
  priceMonthMinor: number | null;
  priceYearMinor: number | null;
  moduleId: ModuleId | null;
  discountBp: number | null;
  minimumStudents: number | null;
  startsOn: string;
  endsOn: string | null;
  reason: string;
  createdBy: string;
  createdAt: string;
  endedBy: string | null;
  endedAt: string | null;
  endReason: string | null;
  replacedBy: string | null;
  state: TermState;
};

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

// A school's terms, newest first. Read as the platform role only.
export async function listTerms(db: Sql, schoolId: string, today: string = indiaDate()): Promise<BillingTerm[]> {
  const { rows } = await db.query(
    `select t.term_id, t.kind, t.price_month_minor, t.price_year_minor, t.module_id, t.discount_bp, t.minimum_students, t.starts_on::text as starts_on, t.ends_on::text as ends_on,
            t.reason, coalesce(c.display_name, '') as created_by, t.created_at, e.display_name as ended_by, t.ended_at, t.end_reason, t.replaced_by
       from school_billing_terms t left join users c on c.user_id = t.created_by left join users e on e.user_id = t.ended_by
      where t.school_id = $1 order by t.created_at desc, t.term_id`,
    [schoolId]
  );
  return rows.map((r) => {
    const startsOn = r.starts_on as string;
    const endsOn = (r.ends_on as string | null) ?? null;
    const state: TermState = endsOn !== null && endsOn < startsOn ? 'never' : startsOn > today ? 'later' : endsOn !== null && endsOn < today ? 'ended' : 'in_force';
    return {
      termId: r.term_id,
      kind: r.kind,
      priceMonthMinor: num(r.price_month_minor),
      priceYearMinor: num(r.price_year_minor),
      moduleId: isModuleId(r.module_id) ? r.module_id : null,
      discountBp: num(r.discount_bp),
      minimumStudents: num(r.minimum_students),
      startsOn,
      endsOn,
      reason: r.reason,
      createdBy: r.created_by,
      createdAt: new Date(r.created_at).toISOString(),
      endedBy: (r.ended_by as string | null) ?? null,
      endedAt: r.ended_at ? new Date(r.ended_at).toISOString() : null,
      endReason: (r.end_reason as string | null) ?? null,
      replacedBy: (r.replaced_by as string | null) ?? null,
      state,
    };
  });
}

export type TermInput = {
  kind: unknown;
  priceMonthMinor?: unknown;
  priceYearMinor?: unknown;
  moduleId?: unknown;
  discountBp?: unknown;
  minimumStudents?: unknown;
  startsOn: unknown;
  endsOn?: unknown;
  reason: unknown;
};
export type TermProblem = 'not_found' | 'kind' | 'price' | 'module' | 'percent' | 'minimum' | 'starts_on' | 'ends_on' | 'reason' | 'term';
export type TermResult = { ok: true; termId: string; replaced: string[]; switchedOn: ModuleId[]; switchedOff: ModuleId[] } | { ok: false; reason: TermProblem };

const whole = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;

type CleanTerm = { kind: TermKind; month: number | null; year: number | null; moduleId: ModuleId | null; discountBp: number | null; minimumStudents: number | null; startsOn: string; endsOn: string | null; reason: string };

function cleanTerm(input: TermInput, today: string): CleanTerm | TermProblem {
  if (!isTermKind(input.kind)) return 'kind';
  const kind = input.kind;
  const t: CleanTerm = { kind, month: null, year: null, moduleId: null, discountBp: null, minimumStudents: null, startsOn: '', endsOn: null, reason: '' };
  if (kind === 'price') {
    if (!whole(input.priceMonthMinor, MAX_STUDENT_MONTH_PAISE) || !whole(input.priceYearMinor, MAX_STUDENT_YEAR_PAISE)) return 'price';
    [t.month, t.year] = [input.priceMonthMinor, input.priceYearMinor];
  }
  if (kind === 'complimentary') {
    // A module that works today, and not one that is always on anyway.
    if (!isModuleId(input.moduleId) || isAlwaysOn(input.moduleId) || !workingModules().includes(input.moduleId)) return 'module';
    t.moduleId = input.moduleId;
  }
  if (kind === 'discount') {
    if (!whole(input.discountBp, BP_IN_WHOLE)) return 'percent';
    t.discountBp = input.discountBp;
  }
  if (kind === 'minimum') {
    if (!whole(input.minimumStudents, MAX_MINIMUM_STUDENTS)) return 'minimum';
    t.minimumStudents = input.minimumStudents;
  }
  if (!isIsoDate(input.startsOn) || input.startsOn < today || daysBetween(today, input.startsOn) > MAX_DAYS_AHEAD) return 'starts_on';
  t.startsOn = input.startsOn;
  const endsOn = input.endsOn === null || input.endsOn === undefined || input.endsOn === '' ? null : input.endsOn;
  // A complimentary module always has a last day.
  if ((endsOn === null && kind === 'complimentary') || (endsOn !== null && (!isIsoDate(endsOn) || endsOn < t.startsOn || daysBetween(t.startsOn, endsOn) > MAX_DAYS_AHEAD))) return 'ends_on';
  t.endsOn = endsOn as string | null;
  t.reason = cleanReason(input.reason);
  if (t.reason.length < 3 || t.reason.length > 500) return 'reason';
  return t;
}

const termValues = (t: CleanTerm) => ({
  kind: t.kind,
  ...(t.kind === 'price' ? { price_month_minor: t.month, price_year_minor: t.year } : {}),
  ...(t.kind === 'complimentary' ? { module_id: t.moduleId } : {}),
  ...(t.kind === 'discount' ? { discount_bp: t.discountBp } : {}),
  ...(t.kind === 'minimum' ? { minimum_students: t.minimumStudents } : {}),
});

// Adds a term for the school in the address. A row of the same kind (for a complimentary module: of the same
// module) that would be in force on any of the new row's days is ended first: the day before the new row begins,
// or, if it had not begun by then, the day before its own first day. Audited with what it replaced.
export async function addTerm(db: Sql, by: By, schoolId: string, input: TermInput, today: string = indiaDate()): Promise<TermResult> {
  if (!isUuid(schoolId)) return { ok: false, reason: 'not_found' };
  const t = cleanTerm(input, today);
  if (typeof t === 'string') return { ok: false, reason: t };
  await lockTerms(db, schoolId);
  if (!(await db.query(`select 1 from schools where school_id = $1`, [schoolId])).rows[0]) return { ok: false, reason: 'not_found' };
  const termId = (await db.query(`select gen_random_uuid() as id`)).rows[0].id as string;
  const { rows: replaced } = await db.query(
    `with old as (
       select term_id, ends_on from school_billing_terms
        where school_id = $1 and kind = $2 and module_id is not distinct from $3
          and daterange(starts_on, ends_on + 1, '[)') && daterange($4::date, $5::date + 1, '[)')
        for update
     )
     update school_billing_terms t
        set ends_on = case when t.starts_on < $4::date then $4::date - 1 else t.starts_on - 1 end,
            ended_by = $6, ended_at = now(), replaced_by = $7
       from old where t.term_id = old.term_id
     returning t.term_id, old.ends_on::text as was, t.ends_on::text as now`,
    [schoolId, t.kind, t.moduleId, t.startsOn, t.endsOn, by.userId, termId]
  );
  await db.query(
    `insert into school_billing_terms (term_id, school_id, kind, price_month_minor, price_year_minor, module_id, discount_bp, minimum_students, starts_on, ends_on, reason, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10::date, $11, $12)`,
    [termId, schoolId, t.kind, t.month, t.year, t.moduleId, t.discountBp, t.minimumStudents, t.startsOn, t.endsOn, t.reason, by.userId]
  );
  await writeAuditLog(db, {
    schoolId,
    actorUserId: by.userId,
    actorRole: 'super_admin',
    eventAction: 'billing.terms.added',
    targetType: 'school_billing_terms',
    targetId: termId,
    afterState: { ...termValues(t), starts_on: t.startsOn, ends_on: t.endsOn, reason: t.reason, replaced: replaced.map((r) => ({ term_id: r.term_id, ends_on: { from: r.was ?? null, to: r.now } })) },
  });
  const synced = t.kind === 'complimentary' ? await syncComplimentaryModules(db, schoolId, today, by.userId) : { on: [], off: [] };
  return { ok: true, termId, replaced: replaced.map((r) => r.term_id as string), switchedOn: synced.on, switchedOff: synced.off };
}

// Brings a term's last day forward: never later than it was, never before yesterday (a day past is never
// rewritten; yesterday as the last day means "not in force from today"), and never more than a day before its
// first day (that day means "never in force"). Audited with the reason.
export async function endTerm(db: Sql, by: By, schoolId: string, input: { termId: unknown; endsOn: unknown; reason: unknown }, today: string = indiaDate()): Promise<TermResult> {
  if (!isUuid(schoolId) || !isUuid(input.termId)) return { ok: false, reason: 'not_found' };
  const reason = cleanReason(input.reason);
  if (reason.length < 3 || reason.length > 500) return { ok: false, reason: 'reason' };
  await lockTerms(db, schoolId);
  const row = (await db.query(`select kind, module_id, starts_on::text as starts_on, ends_on::text as ends_on from school_billing_terms where school_id = $1 and term_id = $2 for update`, [schoolId, input.termId])).rows[0];
  if (!row) return { ok: false, reason: 'not_found' };
  const endsOn = input.endsOn;
  if (!isIsoDate(endsOn) || endsOn < addDays(today, -1) || endsOn < addDays(row.starts_on, -1)) return { ok: false, reason: 'ends_on' };
  // Already over by then: nothing to end.
  if (row.ends_on !== null && endsOn >= row.ends_on) return { ok: false, reason: 'term' };
  await db.query(`update school_billing_terms set ends_on = $3::date, ended_by = $4, ended_at = now(), end_reason = $5 where school_id = $1 and term_id = $2`, [schoolId, input.termId, endsOn, by.userId, reason]);
  await writeAuditLog(db, {
    schoolId,
    actorUserId: by.userId,
    actorRole: 'super_admin',
    eventAction: 'billing.terms.ended',
    targetType: 'school_billing_terms',
    targetId: input.termId as string,
    beforeState: { ends_on: row.ends_on },
    afterState: { kind: row.kind, ends_on: endsOn, reason },
  });
  const synced = row.kind === 'complimentary' ? await syncComplimentaryModules(db, schoolId, today, by.userId) : { on: [], off: [] };
  return { ok: true, termId: input.termId as string, replaced: [], switchedOn: synced.on, switchedOff: synced.off };
}

export type PeriodResult = { ok: true; period: BillingPeriod } | { ok: false; reason: 'not_found' | 'no_plan' | 'billing_period' | 'reason' };

// The period the school pays for: a month or a year. Audited with the reason, in the platform's own rows.
export async function setBillingPeriod(db: Sql, by: By, schoolId: string, input: { period: unknown; reason: unknown }): Promise<PeriodResult> {
  if (!isUuid(schoolId)) return { ok: false, reason: 'not_found' };
  if (!isBillingPeriod(input.period)) return { ok: false, reason: 'billing_period' };
  const reason = cleanReason(input.reason);
  if (reason.length < 3 || reason.length > 500) return { ok: false, reason: 'reason' };
  if (!(await db.query(`select 1 from schools where school_id = $1`, [schoolId])).rows[0]) return { ok: false, reason: 'not_found' };
  // A school put on a plan before subscriptions existed gets its row now (as recordPayment does, by the same rule).
  await addLegacySubscription(db, schoolId, by.userId);
  const sub = (await db.query(`select billing_period from school_subscriptions where school_id = $1 for update`, [schoolId])).rows[0];
  if (!sub) return { ok: false, reason: 'no_plan' };
  if (sub.billing_period !== input.period) {
    await db.query(`update school_subscriptions set billing_period = $2, updated_by = $3, updated_at = now() where school_id = $1`, [schoolId, input.period, by.userId]);
    await writeAuditLog(db, {
      schoolId,
      actorUserId: by.userId,
      actorRole: 'super_admin',
      eventAction: 'billing.terms.period_changed',
      targetType: 'school_subscriptions',
      targetId: schoolId,
      beforeState: { billing_period: sub.billing_period ?? null },
      afterState: { billing_period: input.period, reason },
    });
  }
  return { ok: true, period: input.period };
}

// Puts the school's complimentary modules where `today` (India's date) says: each module of a complimentary term in
// force today is on, as 'complimentary'; each 'complimentary' row whose terms are all over (or not begun) goes back
// to what the school's plan gives, as 'plan'. A module the founder switched by hand, a trial, and Help (always on)
// are left alone. Each change is audited as a module change, with the reason kept for the founder only. Idempotent.
// `by` is the person who added or ended a term, or null for the nightly job.
export async function syncComplimentaryModules(db: Sql, schoolId: string, today: string, by: string | null): Promise<{ on: ModuleId[]; off: ModuleId[] }> {
  await lockTerms(db, schoolId);
  const { rows: inForce } = await db.query(
    `select distinct on (module_id) module_id, ends_on::text as ends_on from school_billing_terms
      where school_id = $1 and kind = 'complimentary' and starts_on <= $2::date and ends_on >= $2::date
      order by module_id, ends_on desc`,
    [schoolId, today]
  );
  const { rows: current } = await db.query(`select module_id, enabled, source from school_module_entitlements where school_id = $1 for update`, [schoolId]);
  const now = new Map(current.map((r) => [r.module_id as string, { enabled: r.enabled === true, source: r.source as string }]));
  const free = new Map(inForce.filter((r) => isModuleId(r.module_id) && !isAlwaysOn(r.module_id)).map((r) => [r.module_id as ModuleId, r.ends_on as string]));
  const audit = (moduleId: ModuleId, before: unknown, after: unknown, reason: string) =>
    writeEntitlementAudit(db, { schoolId, actorUserId: by, actorRole: by ? 'super_admin' : null, eventAction: 'entitlement.module_changed', targetType: 'school_module_entitlements', targetId: moduleId, beforeState: before, afterState: after }, reason);

  const on: ModuleId[] = [];
  for (const [moduleId, endsOn] of free) {
    const row = now.get(moduleId);
    if (row && (row.source === 'founder_override' || row.source === 'trial')) continue;
    if (row && row.source === 'complimentary' && row.enabled) continue;
    await db.query(
      `insert into school_module_entitlements (school_id, module_id, enabled, source) values ($1, $2, true, 'complimentary')
       on conflict (school_id, module_id) do update set enabled = true, source = 'complimentary', updated_at = now()
         where school_module_entitlements.source in ('plan', 'complimentary')`,
      [schoolId, moduleId]
    );
    await audit(moduleId, row ?? null, { enabled: true, source: 'complimentary' }, `Complimentary until the end of ${endsOn}.`);
    on.push(moduleId);
  }

  const off: ModuleId[] = [];
  const over = current.filter((r) => r.source === 'complimentary' && isModuleId(r.module_id) && !free.has(r.module_id));
  if (over.length > 0) {
    const planId = (await db.query(`select coalesce(sub.plan_id, e.plan) as plan_id from schools s left join school_subscriptions sub on sub.school_id = s.school_id left join school_entitlements e on e.school_id = s.school_id where s.school_id = $1`, [schoolId])).rows[0]?.plan_id;
    const plan = await loadPlan(db, planId);
    for (const r of over) {
      const moduleId = r.module_id as ModuleId;
      const gives = isAlwaysOn(moduleId) || (plan?.moduleIds.includes(moduleId) ?? false);
      await db.query(
        `update school_module_entitlements set enabled = $3, source = 'plan', limits = coalesce($4::jsonb, '{}'::jsonb), updated_at = now()
          where school_id = $1 and module_id = $2 and source = 'complimentary'`,
        [schoolId, moduleId, gives, gives && plan?.limits[moduleId] ? JSON.stringify(plan.limits[moduleId]) : null]
      );
      await audit(moduleId, { enabled: r.enabled === true, source: 'complimentary' }, { enabled: gives, source: 'plan' }, gives ? 'The complimentary period is over; the plan gives this module.' : 'The complimentary period is over; the plan does not give this module.');
      if (!gives) off.push(moduleId);
    }
  }
  return { on: on.sort(), off: off.sort() };
}

// The schools the nightly job looks at for complimentary modules: a term that begins or ends around today, or a row
// still marked complimentary.
export async function schoolsWithComplimentary(db: Sql, today: string): Promise<string[]> {
  const { rows } = await db.query(
    `select school_id from school_billing_terms where kind = 'complimentary' and ends_on >= $1::date - 1
     union
     select school_id from school_module_entitlements where source = 'complimentary'
     order by 1`,
    [today]
  );
  return rows.map((r) => r.school_id as string);
}
