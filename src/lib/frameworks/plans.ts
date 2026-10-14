import { writeEntitlementAudit } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { ALWAYS_ON_MODULES } from '@/lib/contracts/entitlements';
import { isModuleId, MODULE_REGISTRY, type ModuleId } from '@/lib/contracts/modules';
import type { Sql } from '@/lib/jobs/types';

// Plans are settings (docs/26 rule 8, C204): their names and prices are rows
// of the `plans` table, typed in Control. Nothing here names a plan or a
// price. Which plan a new school gets is a platform setting.
//
// Priced per enrolled student (founder, C212): a price a month and a price a
// year, each per student, in paise; the school's subscription says which of
// the two it pays. The amount due is worked out in one place,
// src/lib/control/billing-amount.ts.
//
// A plan gives either every module that works today (derived from the
// registry at the moment it is applied, never listed by hand) or a chosen
// list. A chosen list may name a module that is not built yet: the plan
// sells it, and it is switched on once it works. The rows a school gets are
// fixed when the plan is applied; a module that goes live later reaches a
// school when the plan is applied again.
//
// A plan may be for test schools only (C219: the first plan, with every module): no real school is put on it, here
// or by the database (school_subscriptions_real_plan), and it is never the plan for new schools.

// The two periods a school can pay for.
export const BILLING_PERIODS = ['month', 'year'] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];
export const isBillingPeriod = (v: unknown): v is BillingPeriod => (BILLING_PERIODS as readonly unknown[]).includes(v);
// Parts of a module that a plan gives or holds back. Only the module that owns a feature reads it, through
// planHasFeature (personal-best: Exams, from P6; principal-dashboard: Dashboard; staff-leave: Staff; rte-claim-desk:
// Fees; compliance-desk: Compliance; timetable-generator: Timetable; the last three placed by C223-A).
export const PLAN_FEATURES = ['personal-best', 'principal-dashboard', 'staff-leave', 'rte-claim-desk', 'compliance-desk', 'timetable-generator'] as const;
export type PlanFeature = (typeof PLAN_FEATURES)[number];
export const isPlanFeature = (v: unknown): v is PlanFeature => (PLAN_FEATURES as readonly unknown[]).includes(v);
// Named whole-number limits a module, as school_module_entitlements.limits holds them.
export type PlanLimits = Partial<Record<ModuleId, Record<string, number>>>;

export type Plan = {
  planId: string;
  name: string;
  // Per enrolled student, in paise. Both null: no price set yet (never zero by default).
  priceMonthMinor: number | null;
  priceYearMinor: number | null;
  currency: string;
  graceDays: number;
  allWorkingModules: boolean;
  moduleIds: ModuleId[]; // the modules it gives today
  waitingModuleIds: ModuleId[]; // listed, not built yet: switched on once they work and the plan is applied again
  features: PlanFeature[];
  messagesPerStudentMonth: number | null; // WhatsApp messages included per student a month; null: not set yet
  limits: PlanLimits;
  retired: boolean;
  testSchoolsOnly: boolean; // only a test-fixture school may be on it (C219)
};

// The platform setting that holds the id of the plan a new school starts on.
export const DEFAULT_PLAN_SETTING = 'billing.default_plan';
const PLAN_COLUMNS = `plan_id, name, price_month_minor, price_year_minor, currency, grace_days, all_working_modules, module_ids, features, whatsapp_messages_per_student_month, limits, retired_at, test_schools_only`;

// A school put on a plan before subscriptions existed (school_entitlements.plan) gets its subscription row: a plan of
// the table, and never one for test schools only for a real school (C219: such a school has no plan until Control
// puts it on a plan for schools). Runs as nca_super.
export async function addLegacySubscription(db: Sql, schoolId: string, userId: string): Promise<void> {
  await db.query(
    `insert into school_subscriptions (school_id, plan_id, updated_by)
     select e.school_id, e.plan, $2 from school_entitlements e join schools s on s.school_id = e.school_id
      where e.school_id = $1 and e.plan in (select p.plan_id from plans p where not p.test_schools_only or s.is_test_fixture)
     on conflict (school_id) do nothing`,
    [schoolId, userId]
  );
}

// Every module that works today: status live or partial.
export function workingModules(): ModuleId[] {
  return MODULE_REGISTRY.filter((m) => m.status === 'live' || m.status === 'partial').map((m) => m.id);
}

const paise = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function planFromRow(r: any): Plan {
  const listed = (Array.isArray(r.module_ids) ? r.module_ids : []).filter(isModuleId); // a module removed from the registry is dropped
  const working = workingModules();
  const limits: PlanLimits = {};
  for (const [id, value] of Object.entries((r.limits ?? {}) as Record<string, unknown>)) {
    if (isModuleId(id) && value && typeof value === 'object' && !Array.isArray(value)) limits[id] = value as Record<string, number>;
  }
  const all = r.all_working_modules === true;
  return {
    planId: r.plan_id,
    name: r.name,
    priceMonthMinor: paise(r.price_month_minor),
    priceYearMinor: paise(r.price_year_minor),
    currency: r.currency,
    graceDays: Number(r.grace_days),
    allWorkingModules: all,
    moduleIds: all ? working : listed.filter((m: ModuleId) => working.includes(m)),
    waitingModuleIds: all ? [] : listed.filter((m: ModuleId) => !working.includes(m)),
    features: (Array.isArray(r.features) ? r.features : []).filter(isPlanFeature),
    messagesPerStudentMonth: r.whatsapp_messages_per_student_month === null || r.whatsapp_messages_per_student_month === undefined ? null : Number(r.whatsapp_messages_per_student_month),
    limits,
    retired: r.retired_at !== null && r.retired_at !== undefined,
    testSchoolsOnly: r.test_schools_only === true,
  };
}

// Whether the plan a school is on gives a feature (P6 asks for 'personal-best'). Through a database function, so a
// school's own session can ask about its own school without reading any plan, name or price; for another school it
// answers false. The platform role may ask about any school. Read when asked: a change of plan counts at once.
export async function planHasFeature(db: Sql, schoolId: string, feature: PlanFeature): Promise<boolean> {
  const { rows } = await db.query(`select school_plan_has_feature($1::uuid, $2) as yes`, [schoolId, feature]);
  return rows[0]?.yes === true;
}

export async function loadPlan(db: Sql, planId: unknown): Promise<Plan | null> {
  if (typeof planId !== 'string') return null;
  const { rows } = await db.query(`select ${PLAN_COLUMNS} from plans where plan_id = $1`, [planId]);
  return rows[0] ? planFromRow(rows[0]) : null;
}

// Every plan, in use first, then by name. Runs as nca_super: the table is the platform's.
export async function listPlans(db: Sql): Promise<Plan[]> {
  const { rows } = await db.query(`select ${PLAN_COLUMNS} from plans order by (retired_at is not null), lower(name), plan_id`);
  return rows.map(planFromRow);
}

export async function defaultPlanId(db: Sql): Promise<string | null> {
  const { rows } = await db.query(`select value from platform_settings where key = $1`, [DEFAULT_PLAN_SETTING]);
  return typeof rows[0]?.value === 'string' ? rows[0].value : null;
}

type Actor = { userId: string | null; role: StaffRole | null };

const isTestSchool = async (db: Sql, schoolId: string): Promise<boolean> =>
  (await db.query(`select is_test_fixture from schools where school_id = $1`, [schoolId])).rows[0]?.is_test_fixture === true;
export type ApplyPlanResult = { ok: true; modules: ModuleId[]; switchedOff: ModuleId[] } | { ok: false; error: 'unknown plan' | 'plan retired' | 'test schools only' };

// Puts a school on a plan: exactly the plan's modules are on. A module the
// plan gives is switched on with the plan's limits; a module an earlier plan
// gave and this one does not is switched off. A module the founder set by
// hand (source founder_override) keeps the founder's choice, and a trial and
// a complimentary module (C212) are left alone; Help is never switched off. Access mode and the paid-until day
// are left as they are. A retired plan is not given to a school that is not
// already on it. A plan for test schools only is not given to a real school
// (the database refuses it too). Idempotent. Runs as nca_super (only the
// platform writes entitlements and subscriptions).
export async function applyPlan(db: Sql, schoolId: string, planId: string, actor: Actor, reason: string): Promise<ApplyPlanResult> {
  const plan = await loadPlan(db, planId);
  if (!plan) return { ok: false, error: 'unknown plan' };
  const { rows: sub } = await db.query(`select plan_id from school_subscriptions where school_id = $1 for update`, [schoolId]);
  const { rows: ent } = await db.query(`select plan from school_entitlements where school_id = $1`, [schoolId]);
  const before = ((sub[0]?.plan_id ?? ent[0]?.plan) as string | undefined) ?? null;
  if (plan.retired && before !== plan.planId) return { ok: false, error: 'plan retired' };
  if (plan.testSchoolsOnly && !(await isTestSchool(db, schoolId))) return { ok: false, error: 'test schools only' };

  await db.query(
    `insert into school_entitlements (school_id, plan, updated_by) values ($1, $2, $3)
     on conflict (school_id) do update set plan = excluded.plan, updated_by = excluded.updated_by, updated_at = now()`,
    [schoolId, plan.planId, actor.userId]
  );
  await db.query(
    `insert into school_subscriptions (school_id, plan_id, updated_by) values ($1, $2, $3)
     on conflict (school_id) do update set plan_id = excluded.plan_id, updated_by = excluded.updated_by, updated_at = now()`,
    [schoolId, plan.planId, actor.userId]
  );
  const { rows } = await db.query(
    `insert into school_module_entitlements (school_id, module_id, enabled, source, limits)
     select $1, m, true, 'plan', coalesce($3::jsonb -> m, '{}'::jsonb) from unnest($2::text[]) as m
     on conflict (school_id, module_id) do update
       set enabled = true, limits = excluded.limits, updated_at = now()
       where school_module_entitlements.source = 'plan'
     returning module_id`,
    [schoolId, plan.moduleIds, JSON.stringify(plan.limits)]
  );
  const { rows: off } = await db.query(
    `update school_module_entitlements set enabled = false, updated_at = now()
      where school_id = $1 and source = 'plan' and enabled and module_id <> all($2::text[]) and module_id <> all($3::text[])
      returning module_id`,
    [schoolId, plan.moduleIds, ALWAYS_ON_MODULES]
  );
  const modules = rows.map((r) => r.module_id as ModuleId).sort();
  const switchedOff = off.map((r) => r.module_id as ModuleId).sort();
  await writeEntitlementAudit(db, {
    schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'entitlement.plan_applied',
    targetType: 'school_entitlements',
    targetId: schoolId,
    ...(before ? { beforeState: { plan: before } } : {}),
    afterState: { plan: plan.planId, modules, switchedOff },
  }, reason);
  return { ok: true, modules, switchedOff };
}

// A new school starts on the plan the platform setting names, in the same
// transaction that creates it, so it never exists without its modules
// (C114). No usable plan is a fault to be seen at once, not a school left
// with nothing switched on. A new school is a real school, so the plan for
// new schools is never one for test schools only (C219: Control refuses
// it, and the database refuses the subscription).
export async function applyDefaultPlan(db: Sql, schoolId: string, actor: Actor, reason: string): Promise<{ planId: string; modules: ModuleId[] }> {
  const planId = await defaultPlanId(db);
  const applied = planId ? await applyPlan(db, schoolId, planId, actor, reason) : null;
  if (!planId || !applied?.ok) throw new Error('plans: the plan for new schools is not set, is retired, or is for test schools only (Control → Billing & Plans)');
  return { planId, modules: applied.modules };
}
