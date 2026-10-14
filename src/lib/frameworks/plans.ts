import { writeEntitlementAudit } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { ALWAYS_ON_MODULES } from '@/lib/contracts/entitlements';
import { isModuleId, MODULE_REGISTRY, type ModuleId } from '@/lib/contracts/modules';
import type { Sql } from '@/lib/jobs/types';

// Plans are settings (docs/26 rule 8, C204): their names, prices and periods
// are rows of the `plans` table, typed in Control. Nothing here names a plan
// or a price. Which plan a new school gets is a platform setting.
//
// A plan gives either every module that works today (derived from the
// registry at the moment it is applied, never listed by hand) or a chosen
// list. The rows a school gets are fixed when the plan is applied; a module
// that goes live later reaches a school when the plan is applied again.

export const PLAN_PERIODS = ['month', 'quarter', 'year'] as const;
export type PlanPeriod = (typeof PLAN_PERIODS)[number];
// Named whole-number limits a module, as school_module_entitlements.limits holds them.
export type PlanLimits = Partial<Record<ModuleId, Record<string, number>>>;

export type Plan = {
  planId: string;
  name: string;
  priceMinor: number | null; // null: no price set yet
  currency: string;
  period: PlanPeriod | null;
  graceDays: number;
  allWorkingModules: boolean;
  moduleIds: ModuleId[]; // the modules it gives today
  limits: PlanLimits;
  retired: boolean;
};

// The platform setting that holds the id of the plan a new school starts on.
export const DEFAULT_PLAN_SETTING = 'billing.default_plan';
const PLAN_COLUMNS = `plan_id, name, price_minor, currency, period, grace_days, all_working_modules, module_ids, limits, retired_at`;

// Every module that works today: status live or partial.
export function workingModules(): ModuleId[] {
  return MODULE_REGISTRY.filter((m) => m.status === 'live' || m.status === 'partial').map((m) => m.id);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function planFromRow(r: any): Plan {
  const chosen = (Array.isArray(r.module_ids) ? r.module_ids : []).filter(isModuleId); // a module removed from the registry is dropped
  const limits: PlanLimits = {};
  for (const [id, value] of Object.entries((r.limits ?? {}) as Record<string, unknown>)) {
    if (isModuleId(id) && value && typeof value === 'object' && !Array.isArray(value)) limits[id] = value as Record<string, number>;
  }
  return {
    planId: r.plan_id,
    name: r.name,
    priceMinor: r.price_minor === null || r.price_minor === undefined ? null : Number(r.price_minor),
    currency: r.currency,
    period: (r.period as PlanPeriod | null) ?? null,
    graceDays: Number(r.grace_days),
    allWorkingModules: r.all_working_modules === true,
    moduleIds: r.all_working_modules === true ? workingModules() : chosen,
    limits,
    retired: r.retired_at !== null && r.retired_at !== undefined,
  };
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
export type ApplyPlanResult = { ok: true; modules: ModuleId[]; switchedOff: ModuleId[] } | { ok: false; error: 'unknown plan' | 'plan retired' };

// Puts a school on a plan: exactly the plan's modules are on. A module the
// plan gives is switched on with the plan's limits; a module an earlier plan
// gave and this one does not is switched off. A module the founder set by
// hand (source founder_override) keeps the founder's choice, and a trial is
// left alone; Help is never switched off. Access mode and the paid-until day
// are left as they are. A retired plan is not given to a school that is not
// already on it. Idempotent. Runs as nca_super (only the platform writes
// entitlements and subscriptions).
export async function applyPlan(db: Sql, schoolId: string, planId: string, actor: Actor, reason: string): Promise<ApplyPlanResult> {
  const plan = await loadPlan(db, planId);
  if (!plan) return { ok: false, error: 'unknown plan' };
  const { rows: sub } = await db.query(`select plan_id from school_subscriptions where school_id = $1 for update`, [schoolId]);
  const { rows: ent } = await db.query(`select plan from school_entitlements where school_id = $1`, [schoolId]);
  const before = ((sub[0]?.plan_id ?? ent[0]?.plan) as string | undefined) ?? null;
  if (plan.retired && before !== plan.planId) return { ok: false, error: 'plan retired' };

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
// with nothing switched on.
export async function applyDefaultPlan(db: Sql, schoolId: string, actor: Actor, reason: string): Promise<{ planId: string; modules: ModuleId[] }> {
  const planId = await defaultPlanId(db);
  const applied = planId ? await applyPlan(db, schoolId, planId, actor, reason) : null;
  if (!planId || !applied?.ok) throw new Error('plans: the plan for new schools is not set, or is retired (Control → Billing & Plans)');
  return { planId, modules: applied.modules };
}
