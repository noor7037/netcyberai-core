import { writeEntitlementAudit } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { MODULE_REGISTRY, type ModuleId } from '@/lib/contracts/modules';
import type { Sql } from '@/lib/jobs/types';

// Plans (C114). Entitlements are opt-in, so a school with no rows has only
// Help. A new school starts on the default plan, written in the same
// transaction that creates it (application approval, or Control → new
// school). Plan names and prices are the founder's decision (16 §4, P5);
// 'standard' is the technical starting point until then.
//
// A plan's modules are derived from the registry, never listed by hand:
// 'standard' is every module that works today (status live or partial).
// The rows a school gets are fixed when the plan is applied; a module that
// goes live later reaches a school when the founder applies the plan again.

export type PlanDefinition = { planId: string; label: string; modules: readonly ModuleId[] };

export const DEFAULT_PLAN_ID = 'standard';

export const PLANS: readonly PlanDefinition[] = [
  {
    planId: 'standard',
    label: 'Standard',
    modules: MODULE_REGISTRY.filter((m) => m.status === 'live' || m.status === 'partial').map((m) => m.id),
  },
];

export function planById(planId: unknown): PlanDefinition | null {
  return PLANS.find((p) => p.planId === planId) ?? null;
}

// Switches the plan's modules on for a school and records the plan.
// Idempotent. A module the founder set by hand (source founder_override)
// keeps the founder's choice; access mode is left as it is. Runs as
// nca_super (only the platform writes entitlements).
export async function applyPlan(
  db: Sql,
  schoolId: string,
  planId: string,
  actor: { userId: string | null; role: StaffRole | null },
  reason: string
): Promise<{ ok: true; modules: ModuleId[] } | { ok: false; error: string }> {
  const plan = planById(planId);
  if (!plan) return { ok: false, error: 'unknown plan' };
  await db.query(
    `insert into school_entitlements (school_id, plan, updated_by) values ($1, $2, $3)
     on conflict (school_id) do update set plan = excluded.plan, updated_by = excluded.updated_by, updated_at = now()`,
    [schoolId, plan.planId, actor.userId]
  );
  const { rows } = await db.query(
    `insert into school_module_entitlements (school_id, module_id, enabled, source)
     select $1, m, true, 'plan' from unnest($2::text[]) as m
     on conflict (school_id, module_id) do update
       set enabled = true, updated_at = now()
       where school_module_entitlements.source = 'plan'
     returning module_id`,
    [schoolId, plan.modules]
  );
  const modules = rows.map((r) => r.module_id as ModuleId).sort();
  await writeEntitlementAudit(db, {
    schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'entitlement.plan_applied',
    targetType: 'school_entitlements',
    targetId: schoolId,
    afterState: { plan: plan.planId, modules },
  }, reason);
  return { ok: true, modules };
}
