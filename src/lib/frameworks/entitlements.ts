import { writeEntitlementAudit } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { canWrite, isAlwaysOn, isModuleEnabled, type AccessMode, type EntitlementChange, type EntitlementHistoryEntry, type ModuleEntitlement, type SchoolEntitlements } from '@/lib/contracts/entitlements';
import { AI_MARKING_PAGES_LIMIT } from '@/lib/contracts/marking';
import { isModuleId, moduleById, type ModuleId, type SchoolRole } from '@/lib/contracts/modules';
import { loadPlan, type Plan, type PlanLimits } from '@/lib/frameworks/plans';
import type { Sql } from '@/lib/jobs/types';

// Per-school entitlements (contracts/entitlements.ts, C112): read by every
// module gate, changed only by the founder in Control (nca_super; the
// database grants school roles SELECT only). Every change is audited; the
// founder's reason is kept apart, where only the founder can read it (C124).

const ACCESS_MODES: readonly AccessMode[] = ['full', 'grace', 'read_only', 'suspended'];

export async function loadEntitlements(db: Sql, schoolId: string): Promise<SchoolEntitlements> {
  const { rows: head } = await db.query(
    `select plan, access_mode, grace_ends_at from school_entitlements where school_id = $1`,
    [schoolId]
  );
  const { rows } = await db.query(
    `select module_id, enabled, source, limits, overridden_by, overridden_at
     from school_module_entitlements where school_id = $1`,
    [schoolId]
  );
  const modules: Partial<Record<ModuleId, ModuleEntitlement>> = {};
  for (const r of rows) {
    const id: unknown = r.module_id;
    if (!isModuleId(id)) continue; // a module removed from the registry
    modules[id] = {
      enabled: r.enabled,
      source: r.source,
      ...(r.limits && Object.keys(r.limits).length ? { limits: r.limits } : {}),
      ...(r.overridden_by ? { overriddenBy: r.overridden_by, overriddenAt: new Date(r.overridden_at).toISOString() } : {}),
    };
  }
  const h = head[0];
  // Grace ends on its own: past graceEndsAt the school is read-only until
  // the founder changes it (17 §3a: "grace period then read-only").
  const graceOver = h?.access_mode === 'grace' && h.grace_ends_at && new Date(h.grace_ends_at) <= new Date();
  return {
    schoolId,
    plan: h?.plan ?? 'unassigned',
    accessMode: graceOver ? 'read_only' : h?.access_mode ?? 'full',
    ...(h?.grace_ends_at ? { graceEndsAt: new Date(h.grace_ends_at).toISOString() } : {}),
    modules,
  };
}

// The plan the school is on (school_entitlements.plan), or null for none. Runs as nca_super: the plans table is the platform's.
export async function loadSchoolPlan(db: Sql, schoolId: string): Promise<Plan | null> {
  const { rows } = await db.query(`select plan from school_entitlements where school_id = $1`, [schoolId]);
  return loadPlan(db, rows[0]?.plan);
}

// The plan's own limits, per module, so Control can show them beside the school's (W15-D). Marking reads the school's own
// row (loadEntitlements), never this. Runs as nca_super.
export async function loadPlanLimits(db: Sql, schoolId: string): Promise<PlanLimits> {
  return (await loadSchoolPlan(db, schoolId))?.limits ?? {};
}

export type ModuleAccess =
  | { ok: true; entitlements: SchoolEntitlements }
  | { ok: false; status: 403; error: 'role_not_allowed' | 'module_not_enabled' | 'read_only' };

// The gate every module API runs before touching the module's data: the
// role may use the module (17 §5), the school is entitled to it, and, for
// a change, the school is not read-only or suspended.
export async function checkModuleAccess(
  db: Sql,
  claims: { schoolId: string; role: StaffRole },
  moduleId: ModuleId,
  opts: { write?: boolean; roles?: readonly SchoolRole[] } = {}
): Promise<ModuleAccess> {
  const roles = opts.roles ?? moduleById(moduleId).roles;
  if (!(roles as readonly string[]).includes(claims.role)) return { ok: false, status: 403, error: 'role_not_allowed' };
  const entitlements = await loadEntitlements(db, claims.schoolId);
  if (!isModuleEnabled(entitlements, moduleId)) return { ok: false, status: 403, error: 'module_not_enabled' };
  if (opts.write && !isAlwaysOn(moduleId) && !canWrite(entitlements)) return { ok: false, status: 403, error: 'read_only' };
  return { ok: true, entitlements };
}

export type EntitlementChangeResult = { ok: true } | { ok: false; error: string };

function validLimits(limits: unknown): limits is Record<string, number> {
  if (typeof limits !== 'object' || limits === null || Array.isArray(limits)) return false;
  const entries = Object.entries(limits);
  return entries.length <= 20 && entries.every(([k, v]) => /^[a-z][a-z0-9_]{0,39}$/.test(k) && Number.isInteger(v) && (v as number) >= 0);
}

// The limits the founder may take back to the plan's (W15-D), by module. Written here, not read from Control's billing
// list, which imports this file's neighbours (a cycle).
const CLEARABLE_LIMITS: Partial<Record<ModuleId, readonly string[]>> = { exams: [AI_MARKING_PAGES_LIMIT] };
const sameLimits = (a: Record<string, number>, b: Record<string, number>): boolean => {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
};

// The founder's module switch (Control). Runs as nca_super.
// `limits` sets the school's own limits (replacing the row's). `clearLimit` takes one limit back to the plan's: the key
// leaves the school's row and the plan's value for it, if the plan has one, goes in; when nothing else on the module
// differs from the plan, the row's source is 'plan' again, so a re-applied plan owns it.
export async function changeModuleEntitlement(
  db: Sql,
  change: EntitlementChange,
  actor: { userId: string; role: StaffRole }
): Promise<EntitlementChangeResult> {
  if (!isModuleId(change.moduleId)) return { ok: false, error: 'unknown module' };
  if (isAlwaysOn(change.moduleId) && !change.enabled) return { ok: false, error: 'Help Center and Raise Ticket are always on' };
  if (change.limits !== undefined && !validLimits(change.limits)) return { ok: false, error: 'limits must be whole numbers of at least 0' };
  const clearKey = change.clearLimit;
  if (clearKey !== undefined) {
    if (change.limits !== undefined) return { ok: false, error: 'set a limit or clear one, not both' };
    if (typeof clearKey !== 'string' || !CLEARABLE_LIMITS[change.moduleId]?.includes(clearKey)) return { ok: false, error: 'unknown limit' };
  }
  const reason = typeof change.reason === 'string' ? change.reason.trim() : '';
  if (reason.length < 3 || reason.length > 500) return { ok: false, error: 'a reason of 3 to 500 characters is required' };

  const { rows: before } = await db.query(
    `select enabled, source, limits from school_module_entitlements where school_id = $1 and module_id = $2`,
    [change.schoolId, change.moduleId]
  );
  let limits: Record<string, number> | undefined = change.limits as Record<string, number> | undefined;
  let source: 'founder_override' | 'plan' = 'founder_override';
  if (clearKey !== undefined) {
    if (!before[0]) return { ok: false, error: 'this school has no row for that module, so there is no limit to clear' };
    const plan = await loadSchoolPlan(db, change.schoolId);
    const planOwn = plan?.limits[change.moduleId] ?? {};
    const next: Record<string, number> = { ...(before[0].limits ?? {}) };
    delete next[clearKey];
    if (Number.isInteger(planOwn[clearKey])) next[clearKey] = planOwn[clearKey];
    limits = next;
    const planGives = !!plan && plan.moduleIds.includes(change.moduleId) === change.enabled;
    if (planGives && sameLimits(next, planOwn) && (before[0].source === 'plan' || before[0].source === 'founder_override')) source = 'plan';
  }
  const { rows } = await db.query(
    `insert into school_module_entitlements (school_id, module_id, enabled, source, limits, overridden_by, overridden_at)
     values ($1, $2, $3, $6, coalesce($4::jsonb, '{}'::jsonb), $5, now())
     on conflict (school_id, module_id) do update
       set enabled = excluded.enabled, source = $6,
           limits = coalesce($4::jsonb, school_module_entitlements.limits),
           overridden_by = excluded.overridden_by, overridden_at = now(), updated_at = now()
     returning enabled, source, limits`,
    [change.schoolId, change.moduleId, change.enabled, limits ? JSON.stringify(limits) : null, actor.userId, source]
  );
  await writeEntitlementAudit(db, {
    schoolId: change.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'entitlement.module_changed',
    targetType: 'school_module_entitlements',
    targetId: change.moduleId,
    beforeState: before[0] ?? null,
    afterState: clearKey !== undefined ? { ...rows[0], cleared_limit: clearKey } : rows[0],
  }, reason);
  return { ok: true };
}

export type AccessChange = { schoolId: string; plan?: string; accessMode: AccessMode; graceEndsAt?: string | null; reason: string };

// Plan and access mode (full, grace, read-only, suspended). Runs as nca_super.
export async function changeSchoolAccess(db: Sql, change: AccessChange, actor: { userId: string; role: StaffRole }): Promise<EntitlementChangeResult> {
  if (!ACCESS_MODES.includes(change.accessMode)) return { ok: false, error: 'unknown access mode' };
  if (change.plan !== undefined && !/^[a-z0-9_-]{1,40}$/.test(change.plan)) return { ok: false, error: 'plan must be a short id' };
  const grace = change.accessMode === 'grace' ? change.graceEndsAt : null;
  if (change.accessMode === 'grace' && (!grace || Number.isNaN(Date.parse(grace)))) return { ok: false, error: 'grace needs an end date' };
  const reason = typeof change.reason === 'string' ? change.reason.trim() : '';
  if (reason.length < 3 || reason.length > 500) return { ok: false, error: 'a reason of 3 to 500 characters is required' };

  const { rows: before } = await db.query(`select plan, access_mode, grace_ends_at from school_entitlements where school_id = $1`, [change.schoolId]);
  const { rows } = await db.query(
    `insert into school_entitlements (school_id, plan, access_mode, grace_ends_at, updated_by)
     values ($1, coalesce($2, 'unassigned'), $3, $4, $5)
     on conflict (school_id) do update
       set plan = coalesce($2, school_entitlements.plan), access_mode = excluded.access_mode,
           grace_ends_at = excluded.grace_ends_at, updated_by = excluded.updated_by, updated_at = now()
     returning plan, access_mode, grace_ends_at`,
    [change.schoolId, change.plan ?? null, change.accessMode, grace ?? null, actor.userId]
  );
  await writeEntitlementAudit(db, {
    schoolId: change.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'entitlement.access_changed',
    targetType: 'school_entitlements',
    targetId: change.schoolId,
    beforeState: before[0] ?? null,
    afterState: rows[0],
  }, reason);
  return { ok: true };
}

// The school's entitlement history for Control (C123): the audit log's own
// rows (every change above writes one), newest first, with the actor's
// name and the founder's reason (C124: from the founder-only table, which a
// school role has no grant on, so this fails for one; a row written by a
// deployment from before C124 still has it in after_state, hidden from
// schools). Runs as nca_super. Read only.
export async function entitlementHistory(db: Sql, schoolId: string, limit = 50): Promise<EntitlementHistoryEntry[]> {
  const { rows } = await db.query(
    `select a.audit_id, a.occurred_at, a.event_action, a.target_id, a.before_state, a.after_state, u.display_name,
            coalesce(r.reason, a.after_state ->> 'reason') as reason
     from audit_log a
     left join users u on u.user_id = a.actor_user_id
     left join entitlement_change_reasons r on r.audit_id = a.audit_id
     where a.school_id = $1 and a.event_action in ('entitlement.module_changed', 'entitlement.access_changed', 'entitlement.plan_applied')
     order by a.audit_id desc limit $2`,
    [schoolId, Math.min(Math.max(limit, 1), 200)]
  );
  return rows.map((r): EntitlementHistoryEntry => {
    const before = (r.before_state ?? {}) as Record<string, any>;
    const after = (r.after_state ?? {}) as Record<string, any>;
    const base = { id: String(r.audit_id), at: new Date(r.occurred_at).toISOString(), actorName: (r.display_name as string | null) ?? null, reason: (r.reason as string | null) ?? null };
    if (r.event_action === 'entitlement.module_changed') {
      // A change of one limit (W15-D): the first limit whose number differs between the two states.
      const bl = (before.limits ?? {}) as Record<string, number>;
      const al = (after.limits ?? {}) as Record<string, number>;
      const key = [...new Set([...Object.keys(bl), ...Object.keys(al)])].sort().find((k) => bl[k] !== al[k]);
      const limit = key ? { key, from: typeof bl[key] === 'number' ? bl[key] : null, to: typeof al[key] === 'number' ? al[key] : null, ...(after.cleared_limit === key ? { toPlan: true } : {}) } : undefined;
      return { ...base, kind: 'module_changed', moduleId: r.target_id, enabled: { from: typeof before.enabled === 'boolean' ? before.enabled : null, to: after.enabled === true }, ...(limit ? { limit } : {}) };
    }
    if (r.event_action === 'entitlement.access_changed') {
      return { ...base, kind: 'access_changed', accessMode: { from: before.access_mode ?? null, to: after.access_mode }, graceEndsAt: after.grace_ends_at ? new Date(after.grace_ends_at).toISOString() : null };
    }
    return { ...base, kind: 'plan_applied', plan: after.plan, moduleCount: Array.isArray(after.modules) ? after.modules.length : undefined };
  });
}

