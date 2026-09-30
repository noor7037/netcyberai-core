import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { canWrite, isAlwaysOn, isModuleEnabled, type AccessMode, type EntitlementChange, type ModuleEntitlement, type SchoolEntitlements } from '@/lib/contracts/entitlements';
import { isModuleId, moduleById, type ModuleId, type SchoolRole } from '@/lib/contracts/modules';
import type { Sql } from '@/lib/jobs/types';

// Per-school entitlements (contracts/entitlements.ts, C112): read by every
// module gate, changed only by the founder in Control (nca_super; the
// database grants school roles SELECT only). Every change is audited.

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
  return {
    schoolId,
    plan: h?.plan ?? 'unassigned',
    accessMode: h?.access_mode ?? 'full',
    ...(h?.grace_ends_at ? { graceEndsAt: new Date(h.grace_ends_at).toISOString() } : {}),
    modules,
  };
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

// The founder's module switch (Control). Runs as nca_super.
export async function changeModuleEntitlement(
  db: Sql,
  change: EntitlementChange,
  actor: { userId: string; role: StaffRole }
): Promise<EntitlementChangeResult> {
  if (!isModuleId(change.moduleId)) return { ok: false, error: 'unknown module' };
  if (isAlwaysOn(change.moduleId) && !change.enabled) return { ok: false, error: 'Help Center and Raise Ticket are always on' };
  if (change.limits !== undefined && !validLimits(change.limits)) return { ok: false, error: 'limits must be whole numbers of at least 0' };
  const reason = typeof change.reason === 'string' ? change.reason.trim() : '';
  if (reason.length < 3 || reason.length > 500) return { ok: false, error: 'a reason of 3 to 500 characters is required' };

  const { rows: before } = await db.query(
    `select enabled, source, limits from school_module_entitlements where school_id = $1 and module_id = $2`,
    [change.schoolId, change.moduleId]
  );
  const { rows } = await db.query(
    `insert into school_module_entitlements (school_id, module_id, enabled, source, limits, overridden_by, overridden_at)
     values ($1, $2, $3, 'founder_override', coalesce($4::jsonb, '{}'::jsonb), $5, now())
     on conflict (school_id, module_id) do update
       set enabled = excluded.enabled, source = 'founder_override',
           limits = coalesce($4::jsonb, school_module_entitlements.limits),
           overridden_by = excluded.overridden_by, overridden_at = now(), updated_at = now()
     returning enabled, source, limits`,
    [change.schoolId, change.moduleId, change.enabled, change.limits ? JSON.stringify(change.limits) : null, actor.userId]
  );
  await writeAuditLog(db, {
    schoolId: change.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'entitlement.module_changed',
    targetType: 'school_module_entitlements',
    targetId: change.moduleId,
    beforeState: before[0] ?? null,
    afterState: { ...rows[0], reason },
  });
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
  await writeAuditLog(db, {
    schoolId: change.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'entitlement.access_changed',
    targetType: 'school_entitlements',
    targetId: change.schoolId,
    beforeState: before[0] ?? null,
    afterState: { ...rows[0], reason },
  });
  return { ok: true };
}
