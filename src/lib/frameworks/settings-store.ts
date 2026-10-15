import { writeAuditLog } from '@/lib/audit/log';
import type { ModuleId, SchoolRole } from '@/lib/contracts/modules';
import type { StaffRole } from '@/lib/auth/types';
import type { ModuleSettingsSchema, SchoolSettings, SettingChange, SettingDefinition, SettingValue, SettingsUpdate, SettingsUpdateResult } from '@/lib/contracts/settings';
import type { Sql } from '@/lib/jobs/types';
import { checkModuleAccess } from './entitlements';
import { applySettingsUpdate, effectiveValues } from './settings-engine';
import { SETTINGS_SCHEMAS } from './settings-schemas';

// Storage for the settings engine (C112): one row per school and module
// with only the non-default values and a revision; every change also
// lands in school_setting_changes (append-only) and the audit log (keys and
// revision only, C41). A save carries the revision it read; a stale one is
// refused so two people never overwrite each other silently.

export type SettingsView = {
  schema: ModuleSettingsSchema;
  settings: SchoolSettings;
  effective: Record<string, SettingValue>;
};

export async function readSettings(db: Sql, schoolId: string, schema: ModuleSettingsSchema): Promise<SettingsView> {
  const { rows } = await db.query(
    `select setting_values, revision, updated_at from school_settings where school_id = $1 and module_id = $2`,
    [schoolId, schema.moduleId]
  );
  const row = rows[0];
  const effective = effectiveValues(schema, row?.setting_values ?? {});
  const values: Record<string, SettingValue> = {};
  for (const f of schema.fields) {
    // A field with no default that is not set is absent from both (C231).
    if (f.key in effective && JSON.stringify(effective[f.key]) !== JSON.stringify(f.default)) values[f.key] = effective[f.key];
  }
  return {
    schema,
    effective,
    settings: {
      schoolId,
      moduleId: schema.moduleId,
      schemaVersion: schema.version,
      values,
      revision: row?.revision ?? 0,
      updatedAt: row ? new Date(row.updated_at).toISOString() : new Date(0).toISOString(),
    },
  };
}

// Every module's settings this person may open, for the school's Settings
// screen (17 §1a, C166): the schema, the values in force, which of them the
// school has set, and whether this person may change each field. A module
// the school does not have, or this role may not open, is left out.
// `value` is null for a field with no default that the school has not set yet (C231).
export type ModuleSettingsForScreen = { moduleId: ModuleId; revision: number; fields: { def: SettingDefinition; value: SettingValue | null; isDefault: boolean; mayEdit: boolean }[] };
export async function readAllSettings(db: Sql, claims: { schoolId: string; role: StaffRole }): Promise<ModuleSettingsForScreen[]> {
  const out: ModuleSettingsForScreen[] = [];
  for (const schema of SETTINGS_SCHEMAS) {
    if (!(await checkModuleAccess(db, claims, schema.moduleId)).ok) continue;
    const view = await readSettings(db, claims.schoolId, schema);
    out.push({
      moduleId: schema.moduleId,
      revision: view.settings.revision,
      fields: schema.fields.map((def) => ({ def, value: def.key in view.effective ? view.effective[def.key] : null, isDefault: !(def.key in view.settings.values), mayEdit: (def.editableBy as readonly string[]).includes(claims.role) })),
    });
  }
  return out;
}

export async function saveSettings(
  db: Sql,
  actor: { schoolId: string; userId: string; role: SchoolRole },
  schema: ModuleSettingsSchema,
  update: SettingsUpdate
): Promise<SettingsUpdateResult> {
  if (!Number.isInteger(update.baseRevision) || update.baseRevision < 0) {
    return { ok: false, reason: 'invalid', errors: [{ key: '', message: 'baseRevision is required' }] };
  }
  const { rows } = await db.query(
    `select setting_values, revision from school_settings where school_id = $1 and module_id = $2 for update`,
    [actor.schoolId, schema.moduleId]
  );
  const current = rows[0];
  if ((current?.revision ?? 0) !== update.baseRevision) return { ok: false, reason: 'stale_revision' };

  const result = applySettingsUpdate(schema, current?.setting_values ?? {}, update, actor.role);
  if (!result.ok) return { ok: false, reason: result.reason, errors: result.errors };
  if (result.changes.length === 0) return { ok: true, settings: (await readSettings(db, actor.schoolId, schema)).settings };

  const revision = update.baseRevision + 1;
  const written = current
    ? await db.query(
        `update school_settings set setting_values = $3, revision = $4, schema_version = $5, updated_by = $6, updated_at = now()
         where school_id = $1 and module_id = $2 and revision = $7`,
        [actor.schoolId, schema.moduleId, JSON.stringify(result.values), revision, schema.version, actor.userId, update.baseRevision]
      )
    : await db.query(
        `insert into school_settings (school_id, module_id, schema_version, setting_values, revision, updated_by)
         values ($1, $2, $3, $4, $5, $6) on conflict (school_id, module_id) do nothing`,
        [actor.schoolId, schema.moduleId, schema.version, JSON.stringify(result.values), revision, actor.userId]
      );
  if (written.rowCount !== 1) return { ok: false, reason: 'stale_revision' };

  for (const c of result.changes) {
    await db.query(
      `insert into school_setting_changes (school_id, module_id, setting_key, from_value, to_value, revision, changed_by)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [actor.schoolId, schema.moduleId, c.key, c.from === null ? null : JSON.stringify(c.from), c.to === null ? null : JSON.stringify(c.to), revision, actor.userId]
    );
  }
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'settings.changed',
    targetType: 'school_settings',
    targetId: schema.moduleId,
    afterState: { keys: result.changes.map((c) => c.key), revision },
  });
  return { ok: true, settings: (await readSettings(db, actor.schoolId, schema)).settings };
}

export async function settingsHistory(db: Sql, schoolId: string, moduleId: ModuleId, limit = 50): Promise<SettingChange[]> {
  const { rows } = await db.query(
    `select c.setting_key, c.from_value, c.to_value, c.changed_by, c.changed_at, c.revision, u.display_name as changed_by_name
     from school_setting_changes c left join users u on u.user_id = c.changed_by
     where c.school_id = $1 and c.module_id = $2
     order by c.change_id desc limit $3`,
    [schoolId, moduleId, Math.min(Math.max(limit, 1), 200)]
  );
  return rows.map((r) => ({
    key: r.setting_key,
    from: r.from_value,
    to: r.to_value,
    changedBy: r.changed_by,
    changedByName: r.changed_by_name ?? null,
    changedAt: new Date(r.changed_at).toISOString(),
    revision: r.revision,
  }));
}
