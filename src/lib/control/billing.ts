import { writeAuditLog, writeEntitlementAudit } from '@/lib/audit/log';
import { AI_MARKING_PAGES_LIMIT } from '@/lib/contracts/marking';
import type { AccessMode } from '@/lib/contracts/entitlements';
import { isModuleId, MODULE_IDS, type ModuleId } from '@/lib/contracts/modules';
import { LIMIT_KEY } from '@/lib/copilot/copilot';
import { MAX_MINOR } from '@/lib/fees/money';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { DEFAULT_PLAN_SETTING, defaultPlanId, addLegacySubscription, isBillingPeriod, isPlanFeature, listPlans, loadPlan, PLAN_FEATURES, workingModules, type BillingPeriod, type Plan, type PlanFeature, type PlanLimits } from '@/lib/frameworks/plans';
import type { Sql } from '@/lib/jobs/types';
import { indiaDate, isIsoDate } from '@/lib/time/india';
import { amountDue, MAX_STUDENT_MONTH_PAISE, MAX_STUDENT_YEAR_PAISE, type AmountDue } from './billing-amount';
import { billingFacts, billingOwnSql, graceDaysInWords, writeBillingAccess } from './billing-nightly';
import { lastGraceDay } from './grace-day';
import { listTrials, MAX_TRIAL_DAYS, TRIAL_DAYS, TRIAL_NOTICE_DAYS, type Trial } from './trial';

// Control → Billing & Plans (docs/26 slice 8e, C204). Everything here runs
// as the platform role, for NetCyberAI staff only: the plans (create, edit,
// retire), which plan a new school gets, every school's plan and paid-until
// day, and payments recorded by hand. A person decides each of these; each
// is audited with who and when. No plan name and no price is written in
// this file: they are rows.

type By = { userId: string };

// The limits a module actually reads today, so Control offers only those.
export const PLAN_LIMIT_CHOICES: readonly { moduleId: ModuleId; key: string }[] = [
  { moduleId: 'teacher-copilot', key: LIMIT_KEY },
  // AI answer-sheet marking (C347): pages a school's scripts may have read and marked in a month.
  { moduleId: 'exams', key: AI_MARKING_PAGES_LIMIT },
];
export const MAX_GRACE_DAYS = 90;
const PLAN_ID_RE = /^[a-z0-9_-]{1,40}$/;
const LIMIT_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;

// ---- plans ------------------------------------------------------------------------------------

// Prices are per enrolled student, in paise (C212), up to MAX_STUDENT_MONTH_PAISE and MAX_STUDENT_YEAR_PAISE.
export const MAX_MESSAGES_PER_STUDENT = 100_000;
// The module a feature is part of: a plan gives a feature only with its module.
export const FEATURE_MODULE: Record<PlanFeature, ModuleId> = {
  'personal-best': 'exams',
  'principal-dashboard': 'dashboard',
  'staff-leave': 'staff',
  'rte-claim-desk': 'fees',
  'compliance-desk': 'compliance',
  'timetable-generator': 'timetable',
};

export type PlanInput = {
  planId?: unknown;
  name: unknown;
  priceMonthMinor: unknown;
  priceYearMinor: unknown;
  graceDays: unknown;
  allWorkingModules: unknown;
  moduleIds: unknown;
  limits: unknown;
  features?: unknown;
  messagesPerStudentMonth?: unknown;
};
export type PlanProblem = 'plan_id' | 'name' | 'price' | 'prices' | 'grace_days' | 'modules' | 'limits' | 'features' | 'messages' | 'id_taken' | 'name_taken' | 'not_found' | 'is_default' | 'retired' | 'test_only';
export type PlanResult = { ok: true; plan: Plan } | { ok: false; reason: PlanProblem };
type CleanPlan = { name: string; priceMonthMinor: number | null; priceYearMinor: number | null; graceDays: number; allWorkingModules: boolean; moduleIds: ModuleId[]; limits: PlanLimits; features: PlanFeature[]; messagesPerStudentMonth: number | null };

const wholeUpTo = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;
const emptyToNull = (v: unknown) => (v === null || v === undefined || v === '' ? null : v);

function cleanPlan(input: PlanInput): CleanPlan | PlanProblem {
  const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 1 || name.length > 60) return 'name';
  const month = emptyToNull(input.priceMonthMinor);
  const year = emptyToNull(input.priceYearMinor);
  if ((month !== null && !wholeUpTo(month, MAX_STUDENT_MONTH_PAISE)) || (year !== null && !wholeUpTo(year, MAX_STUDENT_YEAR_PAISE))) return 'price';
  if ((month === null) !== (year === null)) return 'prices'; // a school pays for a month or a year: both, or neither yet
  const graceDays = input.graceDays;
  if (typeof graceDays !== 'number' || !Number.isInteger(graceDays) || graceDays < 0 || graceDays > MAX_GRACE_DAYS) return 'grace_days';
  const allWorkingModules = input.allWorkingModules === true;
  const working = workingModules();
  const chosen = Array.isArray(input.moduleIds) ? input.moduleIds : [];
  // A chosen list holds modules of the registry, each once, and at least one that works today. A module not built
  // yet may be listed: the plan sells it, and it is switched on once it works.
  if (!allWorkingModules && (new Set(chosen).size !== chosen.length || !chosen.every((m) => isModuleId(m)) || !chosen.some((m) => working.includes(m as ModuleId)))) return 'modules';
  const moduleIds = allWorkingModules ? [] : (chosen as ModuleId[]);
  const given = allWorkingModules ? working : moduleIds;
  const raw = input.limits ?? {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'limits';
  const limits: PlanLimits = {};
  for (const [moduleId, values] of Object.entries(raw as Record<string, unknown>)) {
    if (!isModuleId(moduleId) || !given.includes(moduleId) || typeof values !== 'object' || values === null || Array.isArray(values)) return 'limits';
    const entries = Object.entries(values as Record<string, unknown>);
    if (entries.length > 20 || !entries.every(([k, v]) => LIMIT_KEY_RE.test(k) && typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 2_000_000_000)) return 'limits';
    if (entries.length > 0) limits[moduleId] = Object.fromEntries(entries) as Record<string, number>;
  }
  const features = input.features === undefined || input.features === null ? [] : input.features;
  if (!Array.isArray(features) || new Set(features).size !== features.length || !features.every((f) => isPlanFeature(f) && given.includes(FEATURE_MODULE[f]))) return 'features';
  const messages = emptyToNull(input.messagesPerStudentMonth);
  if (messages !== null && !wholeUpTo(messages, MAX_MESSAGES_PER_STUDENT)) return 'messages';
  return { name, priceMonthMinor: month as number | null, priceYearMinor: year as number | null, graceDays, allWorkingModules, moduleIds, limits, features: features as PlanFeature[], messagesPerStudentMonth: messages as number | null };
}

const planState = (p: Plan) => ({
  name: p.name,
  price_month_minor: p.priceMonthMinor,
  price_year_minor: p.priceYearMinor,
  grace_days: p.graceDays,
  all_working_modules: p.allWorkingModules,
  module_ids: p.allWorkingModules ? [] : [...p.moduleIds, ...p.waitingModuleIds],
  features: p.features,
  whatsapp_messages_per_student_month: p.messagesPerStudentMonth,
  limits: p.limits,
  retired: p.retired,
});
const nameTaken = async (db: Sql, name: string, exceptPlanId: string | null) =>
  (await db.query(`select 1 from plans where lower(btrim(name)) = lower($1) and plan_id is distinct from $2`, [name, exceptPlanId])).rows.length > 0;
const planValues = (c: CleanPlan) => [c.name, c.priceMonthMinor, c.priceYearMinor, c.graceDays, c.allWorkingModules, c.moduleIds, JSON.stringify(c.limits), c.features, c.messagesPerStudentMonth];

export async function createPlan(db: Sql, by: By, input: PlanInput): Promise<PlanResult> {
  const planId = typeof input.planId === 'string' ? input.planId.trim() : '';
  if (!PLAN_ID_RE.test(planId) || planId === 'unassigned') return { ok: false, reason: 'plan_id' };
  const clean = cleanPlan(input);
  if (typeof clean === 'string') return { ok: false, reason: clean };
  if ((await db.query(`select 1 from plans where plan_id = $1`, [planId])).rows[0]) return { ok: false, reason: 'id_taken' };
  if (await nameTaken(db, clean.name, null)) return { ok: false, reason: 'name_taken' };
  await db.query(
    `insert into plans (plan_id, name, price_month_minor, price_year_minor, grace_days, all_working_modules, module_ids, limits, features, whatsapp_messages_per_student_month, created_by, updated_by)
     values ($1, $2, $3, $4, $5, $6, $7::text[], $8::jsonb, $9::text[], $10, $11, $11)`,
    [planId, ...planValues(clean), by.userId]
  );
  const plan = (await loadPlan(db, planId))!;
  await writeAuditLog(db, { schoolId: null, actorUserId: by.userId, actorRole: 'super_admin', eventAction: 'billing.plan_created', targetType: 'plans', targetId: planId, afterState: planState(plan) });
  return { ok: true, plan };
}

// A plan's id never changes. Schools already on the plan keep the modules they have until the plan is applied to them
// again; a changed price counts the next time an amount is worked out.
export async function updatePlan(db: Sql, by: By, planId: string, input: PlanInput): Promise<PlanResult> {
  const clean = cleanPlan(input);
  if (typeof clean === 'string') return { ok: false, reason: clean };
  const { rows } = await db.query(`select plan_id from plans where plan_id = $1 for update`, [planId]);
  if (!rows[0]) return { ok: false, reason: 'not_found' };
  const before = (await loadPlan(db, planId))!;
  if (await nameTaken(db, clean.name, planId)) return { ok: false, reason: 'name_taken' };
  await db.query(
    `update plans set name = $2, price_month_minor = $3, price_year_minor = $4, grace_days = $5, all_working_modules = $6, module_ids = $7::text[], limits = $8::jsonb,
            features = $9::text[], whatsapp_messages_per_student_month = $10, updated_by = $11, updated_at = now()
      where plan_id = $1`,
    [planId, ...planValues(clean), by.userId]
  );
  const plan = (await loadPlan(db, planId))!;
  await writeAuditLog(db, { schoolId: null, actorUserId: by.userId, actorRole: 'super_admin', eventAction: 'billing.plan_changed', targetType: 'plans', targetId: planId, beforeState: planState(before), afterState: planState(plan) });
  return { ok: true, plan };
}

// Retired: not offered to a school that is not on it; schools on it keep it. The plan new schools get cannot be retired.
export async function setPlanRetired(db: Sql, by: By, planId: string, retired: boolean): Promise<PlanResult> {
  const { rows } = await db.query(`select retired_at from plans where plan_id = $1 for update`, [planId]);
  if (!rows[0]) return { ok: false, reason: 'not_found' };
  if (retired && (await defaultPlanId(db)) === planId) return { ok: false, reason: 'is_default' };
  if ((rows[0].retired_at !== null) !== retired) {
    await db.query(`update plans set retired_at = case when $2 then now() end, retired_by = case when $2 then $3::uuid end, updated_by = $3, updated_at = now() where plan_id = $1`, [planId, retired, by.userId]);
    await writeAuditLog(db, { schoolId: null, actorUserId: by.userId, actorRole: 'super_admin', eventAction: retired ? 'billing.plan_retired' : 'billing.plan_restored', targetType: 'plans', targetId: planId, afterState: { retired } });
  }
  return { ok: true, plan: (await loadPlan(db, planId))! };
}

// Which plan a new school starts on (a platform setting, so no plan is named in code). A new school is a real school:
// a plan for test schools only is never the plan for new schools (C219).
export async function setDefaultPlan(db: Sql, by: By, planId: string): Promise<PlanResult> {
  const plan = await loadPlan(db, planId);
  if (!plan) return { ok: false, reason: 'not_found' };
  if (plan.retired) return { ok: false, reason: 'retired' };
  if (plan.testSchoolsOnly) return { ok: false, reason: 'test_only' };
  const before = await defaultPlanId(db);
  if (before !== planId) {
    await db.query(`update platform_settings set value = $2::jsonb, updated_by = $3, updated_at = now() where key = $1`, [DEFAULT_PLAN_SETTING, JSON.stringify(planId), by.userId]);
    await writeAuditLog(db, { schoolId: null, actorUserId: by.userId, actorRole: 'super_admin', eventAction: 'platform_setting.update', targetType: 'platform_settings', targetId: DEFAULT_PLAN_SETTING, beforeState: { value: before }, afterState: { value: planId } });
  }
  return { ok: true, plan };
}

// ---- schools by plan and state ----------------------------------------------------------------

// not_billed: no paid-until day yet. due: past paid-until, still on full access (the nightly check has not run yet, or a person set full).
export type BillingState = 'not_billed' | 'paid' | 'due' | 'grace' | 'read_only' | 'suspended';
export type SchoolBilling = {
  schoolId: string;
  schoolName: string;
  isTest: boolean;
  planId: string | null; // null: not on a plan of the table
  planName: string | null;
  period: BillingPeriod | null; // the period the school pays for (C212); null: not chosen yet
  paidUntil: string | null;
  accessMode: AccessMode;
  graceEndsAt: string | null;
  state: BillingState;
  byBilling: boolean; // the access mode is the nightly check's doing, not a person's
  // Full access a person set after the check had acted for this paid-until day: the check leaves the school alone
  // until a payment moves that day. The school's card says so, since nothing else would.
  checkOff: boolean;
};
export type BillingOverview = {
  today: string;
  plans: (Plan & { schools: number })[];
  defaultPlanId: string | null;
  workingModules: ModuleId[];
  // Every module of the registry, for a plan's chosen list: one not built yet may be listed (it waits until it works).
  allModules: ModuleId[];
  features: readonly PlanFeature[];
  limitChoices: typeof PLAN_LIMIT_CHOICES;
  maxGraceDays: number;
  // Each school with the amount it owes for one period, from the one rule (billing-amount.ts).
  schools: (SchoolBilling & { amount: AmountDue | null })[];
  // C226: every school's free month, in force first and the soonest last day first (docs/30).
  trials: Trial[];
  trialDays: number;
  maxTrialDays: number;
  trialNoticeDays: number;
};

const SCHOOL_BILLING_SQL = `select s.school_id, s.name, s.is_test_fixture, p.plan_id, p.name as plan_name, sub.billing_period, sub.paid_until::text as paid_until,
            coalesce(e.access_mode, 'full') as access_mode, e.grace_ends_at,
            coalesce(e.access_mode = 'grace' and e.grace_ends_at <= now(), false) as grace_over,
            coalesce(${billingOwnSql('sub', 'e')}, false) as own,
            (sub.billing_access is not null and coalesce(e.access_mode, 'full') = 'full') as check_off,
            coalesce(sub.paid_until < $1::date, false) as past_due
       from schools s
       left join school_subscriptions sub on sub.school_id = s.school_id
       left join school_entitlements e on e.school_id = s.school_id
       left join plans p on p.plan_id = coalesce(sub.plan_id, e.plan)`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function schoolBillingFromRow(r: any): SchoolBilling {
  // Grace ends on its own, as the school's own gate reads it (loadEntitlements).
  const accessMode: AccessMode = r.grace_over ? 'read_only' : r.access_mode;
  const state: BillingState = accessMode === 'suspended' ? 'suspended' : accessMode === 'read_only' ? 'read_only' : accessMode === 'grace' ? 'grace' : r.paid_until === null ? 'not_billed' : r.past_due ? 'due' : 'paid';
  return {
    schoolId: r.school_id,
    schoolName: r.name,
    isTest: r.is_test_fixture === true,
    planId: (r.plan_id as string | null) ?? null,
    planName: (r.plan_name as string | null) ?? null,
    period: isBillingPeriod(r.billing_period) ? r.billing_period : null,
    paidUntil: (r.paid_until as string | null) ?? null,
    accessMode,
    graceEndsAt: r.grace_ends_at ? new Date(r.grace_ends_at).toISOString() : null,
    state,
    byBilling: r.own === true,
    checkOff: r.check_off === true,
  };
}

export async function schoolBilling(db: Sql, schoolId: string, today: string = indiaDate()): Promise<SchoolBilling | null> {
  const { rows } = await db.query(`${SCHOOL_BILLING_SQL} where s.school_id = $2`, [today, schoolId]);
  return rows[0] ? schoolBillingFromRow(rows[0]) : null;
}

export async function billingOverview(db: Sql, today: string = indiaDate()): Promise<BillingOverview> {
  const plans = await listPlans(db);
  const { rows } = await db.query(`${SCHOOL_BILLING_SQL} order by lower(coalesce(p.name, '')), lower(s.name), s.school_id`, [today]);
  const schools: BillingOverview['schools'] = [];
  for (const school of rows.map(schoolBillingFromRow)) schools.push({ ...school, amount: await amountDue(db, school.schoolId, today) });
  return {
    today,
    plans: plans.map((p) => ({ ...p, schools: schools.filter((s) => s.planId === p.planId).length })),
    defaultPlanId: await defaultPlanId(db),
    workingModules: workingModules(),
    allModules: [...MODULE_IDS],
    features: PLAN_FEATURES,
    limitChoices: PLAN_LIMIT_CHOICES,
    maxGraceDays: MAX_GRACE_DAYS,
    schools,
    trials: await listTrials(db, today),
    trialDays: TRIAL_DAYS,
    maxTrialDays: MAX_TRIAL_DAYS,
    trialNoticeDays: TRIAL_NOTICE_DAYS,
  };
}

// ---- payments ---------------------------------------------------------------------------------

export type PaymentRow = {
  paymentId: string;
  planName: string;
  amountMinor: number;
  paidOn: string;
  coversUntil: string | null;
  reference: string;
  note: string | null;
  correctsPaymentId: string | null;
  correctedBy: string | null; // the later row that corrects this one; it no longer counts
  recordedBy: string;
  recordedAt: string;
};

// A school's payments, newest first. Read as the platform role only.
export async function schoolPayments(db: Sql, schoolId: string): Promise<PaymentRow[]> {
  const { rows } = await db.query(
    `select p.payment_id, pl.name as plan_name, p.amount_minor, p.paid_on::text as paid_on, p.covers_until::text as covers_until, p.reference, p.note, p.corrects_payment_id,
            (select c.payment_id from subscription_payments c where c.corrects_payment_id = p.payment_id) as corrected_by, coalesce(u.display_name, '') as recorded_by, p.recorded_at
       from subscription_payments p join plans pl on pl.plan_id = p.plan_id left join users u on u.user_id = p.recorded_by
      where p.school_id = $1 order by p.recorded_at desc, p.payment_id`,
    [schoolId]
  );
  return rows.map((r) => ({
    paymentId: r.payment_id,
    planName: r.plan_name,
    amountMinor: Number(r.amount_minor),
    paidOn: r.paid_on,
    coversUntil: (r.covers_until as string | null) ?? null,
    reference: r.reference,
    note: (r.note as string | null) ?? null,
    correctsPaymentId: (r.corrects_payment_id as string | null) ?? null,
    correctedBy: (r.corrected_by as string | null) ?? null,
    recordedBy: r.recorded_by,
    recordedAt: new Date(r.recorded_at).toISOString(),
  }));
}

export type PaymentInput = { amountMinor: unknown; paidOn: unknown; coversUntil: unknown; reference: unknown; note?: unknown; correctsPaymentId?: unknown };
export type PaymentProblem = 'not_found' | 'no_plan' | 'amount' | 'paid_on' | 'covers_until' | 'reference' | 'note' | 'corrects';
// handGraceEnded: this payment ended a grace period that had been set by hand (the screen says so).
export type PaymentResult = { ok: true; paymentId: string; paidUntil: string | null; accessMode: AccessMode; handGraceEnded: boolean } | { ok: false; reason: PaymentProblem };
// A typing slip (a year too far) is refused: nothing is paid for more than this many days ahead.
const MAX_DAYS_AHEAD = 3660;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const sameInstant = (a: unknown, b: unknown) => a !== null && b !== null && new Date(a as string).getTime() === new Date(b as string).getTime();

// The school's access as it stood before the payment was recorded.
type AccessBefore = { paidUntil: string | null; accessMode: AccessMode; graceEndsAt: unknown; own: boolean; since: string | null };

// A payment has moved the paid-until day: this puts the school's access
// where that day says it should be, in the payment's own transaction, and
// audits any change as the payment's doing, by the person who recorded it
// (never as the nightly check by nobody). Returns true when it ended a grace
// period set by hand.
//
//   the check had held the school back (its own grace or read-only):
//     now paid up                → full access
//     still behind, same state   → stays; "read-only since" keeps its earlier day; grace gets its new last day
//     still behind, other state  → that state, from today
//   full access (never checked for the old day, or given back by hand):
//     still behind               → grace or read-only at once, as the check would set it for the new day
//   grace set by hand:
//     was behind, now paid up    → full access: the day the founder gave the school to pay by has done its work
//     otherwise                  → left alone
//   paused, or read-only set by hand → left alone, always
async function settleAccessAfterPayment(db: Sql, by: By, schoolId: string, today: string, was: AccessBefore, payment: { paymentId: string; paidUntil: string | null; isCorrection: boolean }): Promise<boolean> {
  const facts = await billingFacts(db, schoolId, today);
  // Where the check would put the school for the new day. No facts: not billed now, or a test school, which is never held back.
  const target = !facts || !facts.pastDue ? 'full' : facts.pastGrace ? 'read_only' : 'grace';
  const said = payment.isCorrection ? 'Payment corrected' : 'Payment recorded';
  const audit = (after: Record<string, unknown>, reason: string) =>
    writeEntitlementAudit(db, {
      schoolId,
      actorUserId: by.userId,
      actorRole: 'super_admin',
      eventAction: 'entitlement.access_changed',
      targetType: 'school_entitlements',
      targetId: schoolId,
      beforeState: { access_mode: was.accessMode, grace_ends_at: was.graceEndsAt ?? null },
      afterState: { ...after, by: 'billing.payment', payment_id: payment.paymentId },
    }, reason);
  const open = async (reason: string) => {
    const { rows } = await db.query(`update school_entitlements set access_mode = 'full', grace_ends_at = null, updated_by = $2, updated_at = now() where school_id = $1 returning access_mode, grace_ends_at`, [schoolId, by.userId]);
    await audit(rows[0], reason);
  };

  if (target === 'full' || !facts) {
    if (was.own) {
      await open(payment.paidUntil ? `${said}: paid until ${payment.paidUntil}.` : 'Payment corrected: no payment counts now, so the school is not billed yet.');
      return false;
    }
    const wasBehind = was.paidUntil === null || was.paidUntil < today;
    if (was.accessMode === 'grace' && was.graceEndsAt && wasBehind && payment.paidUntil !== null && payment.paidUntil >= today) {
      await open(`${said}: paid until ${payment.paidUntil}. The grace period set by hand, to the end of ${lastGraceDay(was.graceEndsAt as string)}, is over.`);
      return true;
    }
    return false;
  }

  // Still behind. A person's own mode stands.
  if (!was.own && was.accessMode !== 'full') return false;
  const sameState = was.own && was.accessMode === target;
  const since = sameState && was.since ? was.since : today;
  if (sameState && (target === 'read_only' || sameInstant(facts.graceEnd, was.graceEndsAt))) {
    // Nothing about the school's access changes: the check's memory, cleared with the old day, is put back as it was.
    await db.query(
      `update school_subscriptions sub set billing_access = $2, billing_access_since = $3::date, billing_grace_ends_at = e.grace_ends_at
         from school_entitlements e where e.school_id = sub.school_id and sub.school_id = $1`,
      [schoolId, target, since]
    );
    return false;
  }
  const after = await writeBillingAccess(db, schoolId, { planId: facts.planId, to: target, graceEndsAt: facts.graceEnd, since, updatedBy: by.userId });
  const days = graceDaysInWords(facts.graceDays);
  await audit(
    { ...after, paid_until: facts.paidUntil, grace_days: facts.graceDays },
    target === 'grace'
      ? `${said}: paid until ${facts.paidUntil}; the plan gives ${days}. In grace until the end of ${facts.lastGraceDay}.`
      : `${said}: paid until ${facts.paidUntil}; the plan gives ${days}, which ended with ${facts.lastGraceDay}. Read-only from ${today}.`
  );
  return false;
}

// Records a payment taken outside the app (cheque, UPI, bank transfer), or a
// correction of an earlier row. Nothing is ever changed or removed: a wrong
// row is corrected by a new one that names it and says what was wrong, and
// the corrected row stops counting.
//
// Paid-until becomes the latest "covers until" among the rows that count, so
// a payment moves it forward and a correction puts it where it should be.
//
// ACCESS CHANGES ONLY WHEN THE PAID-UNTIL DAY MOVES. An entry that leaves
// the day where it was (an older row's reference retyped, an amount put
// right) writes its row and its audit line and touches nothing else: not
// the school's access, not the nightly check's memory, not the day the
// school is told it has been read-only since. When the day does move, the
// school's access is settled at once for the new day (above), so a payment
// that still leaves a school behind shows the true state straight away.
export async function recordPayment(db: Sql, by: By, schoolId: string, input: PaymentInput, today: string = indiaDate()): Promise<PaymentResult> {
  if (!isUuid(schoolId)) return { ok: false, reason: 'not_found' };
  await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`billing:${schoolId}`]);
  if (!(await db.query(`select 1 from schools where school_id = $1`, [schoolId])).rows[0]) return { ok: false, reason: 'not_found' };
  // A school put on a plan before subscriptions existed gets its row now (never a test schools' plan for a real school, C219).
  await addLegacySubscription(db, schoolId, by.userId);
  const sub = (await db.query(
    `select sub.plan_id, sub.paid_until::text as paid_until, sub.billing_access_since::text as since, coalesce(${billingOwnSql('sub', 'e')}, false) as own, coalesce(e.access_mode, 'full') as access_mode, e.grace_ends_at
       from school_subscriptions sub left join school_entitlements e on e.school_id = sub.school_id where sub.school_id = $1 for update of sub`,
    [schoolId]
  )).rows[0];
  if (!sub) return { ok: false, reason: 'no_plan' };

  const reference = typeof input.reference === 'string' ? input.reference.trim().replace(/\s+/g, ' ') : '';
  if (reference.length < 1 || reference.length > 120) return { ok: false, reason: 'reference' };
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().replace(/\s+/g, ' ') : null;
  if (note !== null && note.length > 500) return { ok: false, reason: 'note' };
  if (!isIsoDate(input.paidOn) || input.paidOn > today) return { ok: false, reason: 'paid_on' };
  const amountMinor = input.amountMinor;
  if (typeof amountMinor !== 'number' || !Number.isInteger(amountMinor) || amountMinor < 0 || amountMinor > MAX_MINOR) return { ok: false, reason: 'amount' };
  const coversUntil = input.coversUntil === null || input.coversUntil === undefined || input.coversUntil === '' ? null : input.coversUntil;
  if (coversUntil !== null && (!isIsoDate(coversUntil) || daysBetween(today, coversUntil) > MAX_DAYS_AHEAD)) return { ok: false, reason: 'covers_until' };

  const corrects = input.correctsPaymentId === null || input.correctsPaymentId === undefined || input.correctsPaymentId === '' ? null : input.correctsPaymentId;
  // A payment is for the plan the school is on; a correction is for the plan of the row it corrects.
  let planId = sub.plan_id as string;
  if (corrects === null) {
    if (amountMinor < 1) return { ok: false, reason: 'amount' };
    // A payment moves paid-until forward.
    if (coversUntil === null || (sub.paid_until !== null && coversUntil <= sub.paid_until)) return { ok: false, reason: 'covers_until' };
  } else {
    if (!isUuid(corrects)) return { ok: false, reason: 'corrects' };
    const target = (await db.query(`select p.plan_id, (select count(*)::int from subscription_payments c where c.corrects_payment_id = p.payment_id) as corrected from subscription_payments p where p.school_id = $1 and p.payment_id = $2`, [schoolId, corrects])).rows[0];
    if (!target || target.corrected > 0) return { ok: false, reason: 'corrects' };
    planId = target.plan_id as string;
    if (note === null) return { ok: false, reason: 'note' };
    // "Nothing was paid" has no amount and covers nothing; anything else has both.
    if ((amountMinor === 0) !== (coversUntil === null)) return { ok: false, reason: amountMinor === 0 ? 'covers_until' : 'amount' };
  }

  const paymentId = (await db.query(
    `insert into subscription_payments (school_id, plan_id, amount_minor, paid_on, covers_until, reference, note, corrects_payment_id, recorded_by)
     values ($1, $2, $3, $4::date, $5::date, $6, $7, $8, $9) returning payment_id`,
    [schoolId, planId, amountMinor, input.paidOn, coversUntil, reference, note, corrects, by.userId]
  )).rows[0].payment_id as string;
  // The check's memory is of one paid-until day, so it is cleared only when that day moves.
  const paidUntil = ((await db.query(
    `with counted as (
       select max(p.covers_until) as paid_until from subscription_payments p
        where p.school_id = $1 and not exists (select 1 from subscription_payments c where c.corrects_payment_id = p.payment_id)
     )
     update school_subscriptions sub
        set paid_until = counted.paid_until,
            billing_access = case when counted.paid_until is distinct from sub.paid_until then null else sub.billing_access end,
            billing_grace_ends_at = case when counted.paid_until is distinct from sub.paid_until then null else sub.billing_grace_ends_at end,
            billing_access_since = case when counted.paid_until is distinct from sub.paid_until then null else sub.billing_access_since end,
            updated_by = $2, updated_at = now()
       from counted
      where sub.school_id = $1 returning sub.paid_until::text as paid_until`,
    [schoolId, by.userId]
  )).rows[0].paid_until as string | null) ?? null;
  // No amount, reference or note in the audit row: a school reads its own audit rows, and payments are the platform's.
  await writeAuditLog(db, {
    schoolId,
    actorUserId: by.userId,
    actorRole: 'super_admin',
    eventAction: corrects ? 'billing.payment_corrected' : 'billing.payment_recorded',
    targetType: 'subscription_payments',
    targetId: paymentId,
    beforeState: { paid_until: sub.paid_until },
    afterState: { paid_until: paidUntil, paid_on: input.paidOn, covers_until: coversUntil, ...(corrects ? { corrects } : {}) },
  });
  const was: AccessBefore = { paidUntil: (sub.paid_until as string | null) ?? null, accessMode: sub.access_mode, graceEndsAt: sub.grace_ends_at ?? null, own: sub.own === true, since: (sub.since as string | null) ?? null };
  const handGraceEnded = paidUntil !== was.paidUntil ? await settleAccessAfterPayment(db, by, schoolId, today, was, { paymentId, paidUntil, isCorrection: corrects !== null }) : false;
  const now = await schoolBilling(db, schoolId, today);
  return { ok: true, paymentId, paidUntil, accessMode: now?.accessMode ?? 'full', handGraceEnded };
}
