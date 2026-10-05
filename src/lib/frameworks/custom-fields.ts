import { writeAuditLog } from '@/lib/audit/log';
import {
  CUSTOM_FIELD_ENTITIES,
  CUSTOM_FIELD_TYPES,
  MAX_CUSTOM_FIELDS_PER_ENTITY,
  type CustomFieldCreate,
  type CustomFieldDefinition,
  type CustomFieldEntity,
  type CustomFieldPatch,
  type CustomFieldType,
  type CustomFieldValue,
} from '@/lib/contracts/custom-fields';
import type { ModuleId, SchoolRole } from '@/lib/contracts/modules';
import type { Sql } from '@/lib/jobs/types';

// Custom fields (C112). Definitions and values live in their own tables
// (custom_field_definitions / custom_field_values), office-only by RLS.
// Every change is audited with ids and keys, never the values (C41).

export const ENTITY_MODULE: Record<CustomFieldEntity, ModuleId> = {
  student: 'students',
  guardian: 'parents',
  staff: 'staff',
  admission_lead: 'admissions',
};

// Where a record of each entity lives, to check it belongs to the school.
// Admission leads arrive with the Admissions module (P7): until then a
// field can be defined for them, but no value can be stored.
const ENTITY_RECORD_SQL: Record<CustomFieldEntity, string | null> = {
  student: `select 1 from students where school_id = $1 and student_id = $2`,
  guardian: `select 1 from parents where school_id = $1 and parent_id = $2`,
  staff: `select 1 from memberships where school_id = $1 and user_id = $2`,
  admission_lead: null,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

export function isEntity(v: unknown): v is CustomFieldEntity {
  return typeof v === 'string' && (CUSTOM_FIELD_ENTITIES as readonly string[]).includes(v);
}

function validOptions(options: unknown): options is string[] {
  return (
    Array.isArray(options) &&
    options.length >= 1 &&
    options.length <= 50 &&
    options.every((o) => typeof o === 'string' && o.trim().length >= 1 && o.length <= 80) &&
    new Set(options.map((o: string) => o.trim().toLowerCase())).size === options.length
  );
}

export function validateCreate(input: unknown): { ok: true; value: CustomFieldCreate } | { ok: false; error: string } {
  const b = (input ?? {}) as Record<string, unknown>;
  if (!isEntity(b.entity)) return { ok: false, error: `entity must be one of ${CUSTOM_FIELD_ENTITIES.join(', ')}` };
  if (typeof b.key !== 'string' || !/^[a-z][a-z0-9_]{0,39}$/.test(b.key)) return { ok: false, error: 'key must be snake_case, up to 40 characters' };
  if (typeof b.label !== 'string' || !b.label.trim() || b.label.trim().length > 80) return { ok: false, error: 'label of 1 to 80 characters is required' };
  if (!(CUSTOM_FIELD_TYPES as readonly unknown[]).includes(b.type)) return { ok: false, error: `type must be one of ${CUSTOM_FIELD_TYPES.join(', ')}` };
  const type = b.type as CustomFieldType;
  if (type === 'list' && !validOptions(b.options)) return { ok: false, error: 'a list field needs 1 to 50 distinct options' };
  if (type !== 'list' && b.options !== undefined) return { ok: false, error: 'only a list field has options' };
  return {
    ok: true,
    value: {
      entity: b.entity,
      key: b.key,
      label: b.label.trim(),
      type,
      required: b.required === true,
      ...(type === 'list' ? { options: (b.options as string[]).map((o) => o.trim()) } : {}),
    },
  };
}

export function validateFieldValue(def: Pick<CustomFieldDefinition, 'type' | 'options'>, value: unknown): string | null {
  switch (def.type) {
    case 'text':
      return typeof value === 'string' && value.length <= 500 ? null : 'must be text of at most 500 characters';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : 'must be a number';
    case 'boolean':
      return typeof value === 'boolean' ? null : 'must be yes or no';
    case 'date': {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'must be a date as YYYY-MM-DD';
      const d = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value ? null : 'must be a real date';
    }
    case 'list':
      return typeof value === 'string' && (def.options ?? []).includes(value) ? null : 'is not one of the options';
  }
}

function toDefinition(r: Record<string, any>): CustomFieldDefinition {
  return {
    fieldId: r.field_id,
    entity: r.entity,
    key: r.field_key,
    label: r.label,
    type: r.field_type,
    ...(r.options ? { options: r.options } : {}),
    required: r.required,
    archived: r.archived_at !== null,
  };
}

export async function listDefinitions(db: Sql, schoolId: string, entity: CustomFieldEntity, includeArchived = false): Promise<CustomFieldDefinition[]> {
  const { rows } = await db.query(
    `select field_id, entity, field_key, label, field_type, options, required, archived_at
     from custom_field_definitions
     where school_id = $1 and entity = $2 and ($3 or archived_at is null)
     order by created_at, field_key`,
    [schoolId, entity, includeArchived]
  );
  return rows.map(toDefinition);
}

type Actor = { schoolId: string; userId: string; role: SchoolRole };

export async function createDefinition(db: Sql, actor: Actor, input: CustomFieldCreate): Promise<{ ok: true; field: CustomFieldDefinition } | { ok: false; status: 409 | 400; error: string }> {
  const { rows: count } = await db.query(
    `select count(*)::int as n from custom_field_definitions where school_id = $1 and entity = $2 and archived_at is null`,
    [actor.schoolId, input.entity]
  );
  if (count[0].n >= MAX_CUSTOM_FIELDS_PER_ENTITY) return { ok: false, status: 400, error: `at most ${MAX_CUSTOM_FIELDS_PER_ENTITY} fields per record type` };
  const { rows } = await db.query(
    `insert into custom_field_definitions (school_id, entity, field_key, label, field_type, options, required, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (school_id, entity, field_key) do nothing
     returning field_id, entity, field_key, label, field_type, options, required, archived_at`,
    [actor.schoolId, input.entity, input.key, input.label, input.type, input.options ? JSON.stringify(input.options) : null, input.required, actor.userId]
  );
  if (!rows[0]) return { ok: false, status: 409, error: 'a field with this key already exists' };
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'custom_field.created',
    targetType: 'custom_field_definitions',
    targetId: rows[0].field_id,
    afterState: { entity: input.entity, key: input.key, type: input.type },
  });
  return { ok: true, field: toDefinition(rows[0]) };
}

export async function patchDefinition(
  db: Sql,
  actor: Actor,
  fieldId: string,
  patch: unknown
): Promise<{ ok: true; field: CustomFieldDefinition } | { ok: false; status: 400 | 404; error: string }> {
  const p = (patch ?? {}) as CustomFieldPatch & Record<string, unknown>;
  const allowed = new Set(['label', 'required', 'archived', 'options']);
  if (Object.keys(p).some((k) => !allowed.has(k))) return { ok: false, status: 400, error: 'only label, required, archived and options can change' };
  if (p.label !== undefined && (typeof p.label !== 'string' || !p.label.trim() || p.label.trim().length > 80)) return { ok: false, status: 400, error: 'label of 1 to 80 characters' };
  if (p.required !== undefined && typeof p.required !== 'boolean') return { ok: false, status: 400, error: 'required must be true or false' };
  if (p.archived !== undefined && typeof p.archived !== 'boolean') return { ok: false, status: 400, error: 'archived must be true or false' };

  const { rows: cur } = await db.query(`select field_type, options from custom_field_definitions where school_id = $1 and field_id = $2 for update`, [actor.schoolId, fieldId]);
  if (!cur[0]) return { ok: false, status: 404, error: 'field not found' };
  if (p.options !== undefined) {
    if (cur[0].field_type !== 'list') return { ok: false, status: 400, error: 'only a list field has options' };
    if (!validOptions(p.options)) return { ok: false, status: 400, error: 'a list field needs 1 to 50 distinct options' };
    // An option in use cannot be removed (its values would stop being valid).
    const removed = (cur[0].options as string[]).filter((o) => !(p.options as string[]).includes(o));
    if (removed.length) {
      const { rows: used } = await db.query(
        `select 1 from custom_field_values where school_id = $1 and field_id = $2 and value #>> '{}' = any($3::text[]) limit 1`,
        [actor.schoolId, fieldId, removed]
      );
      if (used[0]) return { ok: false, status: 400, error: 'an option still used by a record cannot be removed' };
    }
  }
  const { rows } = await db.query(
    `update custom_field_definitions
       set label = coalesce($3, label), required = coalesce($4, required),
           options = coalesce($5::jsonb, options),
           archived_at = case when $6::boolean is null then archived_at when $6 then coalesce(archived_at, now()) else null end,
           updated_at = now()
     where school_id = $1 and field_id = $2
     returning field_id, entity, field_key, label, field_type, options, required, archived_at`,
    [actor.schoolId, fieldId, p.label?.trim() ?? null, p.required ?? null, p.options ? JSON.stringify(p.options) : null, p.archived ?? null]
  );
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'custom_field.changed',
    targetType: 'custom_field_definitions',
    targetId: fieldId,
    afterState: { changed: Object.keys(p) },
  });
  return { ok: true, field: toDefinition(rows[0]) };
}

export async function readValues(db: Sql, schoolId: string, recordId: string): Promise<Record<string, CustomFieldValue>> {
  const { rows } = await db.query(`select field_id, value from custom_field_values where school_id = $1 and record_id = $2`, [schoolId, recordId]);
  return Object.fromEntries(rows.map((r) => [r.field_id, r.value]));
}

export async function writeValues(
  db: Sql,
  actor: Actor,
  entity: CustomFieldEntity,
  recordId: string,
  values: unknown
): Promise<{ ok: true; values: Record<string, CustomFieldValue> } | { ok: false; status: 400 | 404; error: string; errors?: { fieldId: string; message: string }[] }> {
  if (typeof values !== 'object' || values === null || Array.isArray(values)) return { ok: false, status: 400, error: 'values must be an object keyed by field id' };
  const recordSql = ENTITY_RECORD_SQL[entity];
  if (!recordSql) return { ok: false, status: 400, error: 'values for this record type arrive with its module' };
  const { rows: rec } = await db.query(recordSql, [actor.schoolId, recordId]);
  if (!rec[0]) return { ok: false, status: 404, error: 'record not found' };

  const defs = new Map((await listDefinitions(db, actor.schoolId, entity)).map((d) => [d.fieldId, d]));
  const errors: { fieldId: string; message: string }[] = [];
  const entries = Object.entries(values as Record<string, unknown>);
  for (const [fieldId, v] of entries) {
    const def = defs.get(fieldId);
    if (!def) errors.push({ fieldId, message: 'is not a field of this record type' });
    else if (v === null && def.required) errors.push({ fieldId, message: 'is required' });
    else if (v !== null) {
      const m = validateFieldValue(def, v);
      if (m) errors.push({ fieldId, message: m });
    }
  }
  if (errors.length) return { ok: false, status: 400, error: 'invalid values', errors };

  for (const [fieldId, v] of entries) {
    if (v === null) {
      await db.query(`delete from custom_field_values where school_id = $1 and field_id = $2 and record_id = $3`, [actor.schoolId, fieldId, recordId]);
    } else {
      await db.query(
        `insert into custom_field_values (school_id, field_id, record_id, value, updated_by) values ($1, $2, $3, $4, $5)
         on conflict (school_id, field_id, record_id) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
        [actor.schoolId, fieldId, recordId, JSON.stringify(v), actor.userId]
      );
    }
  }
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'custom_field.values_changed',
    targetType: entity,
    targetId: recordId,
    afterState: { fields: entries.map(([id]) => id) },
  });
  return { ok: true, values: await readValues(db, actor.schoolId, recordId) };
}
