import { colors } from '@/lib/design-tokens';
import type { SchoolRole } from '@/lib/contracts/modules';
import type {
  ModuleSettingsSchema,
  SettingDefinition,
  SettingValue,
  SettingsUpdate,
  SettingsValidationError,
} from '@/lib/contracts/settings';

// The settings engine (17 §1a, C112): validates a SettingsUpdate against a
// module's schema and computes the stored values. Pure: storage, revisions
// and audit are settings-store.ts. Values arrive from JSON bodies, so every
// key is checked against the schema before anything is read or written:
// `__proto__`, `constructor` and `prototype` are refused by name (the C110
// security-review carry-over), and any key the schema does not declare is
// refused too. Values are built on null-prototype objects and Maps, never
// by assigning into `{}`.

export const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

const MAX_TEXT = 500;
const MAX_LIST_ROWS = 100;
const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Literal characters allowed in a numbering pattern, plus the tokens.
const NUMBERING_RE = /^(?:[A-Z0-9/_-]|\{YYYY\}|\{YY\}|\{SEQ:[1-8]\})+$/;

export type StoredValues = Readonly<Record<string, SettingValue>>;

export type ValidatedUpdate =
  | { ok: true; values: StoredValues; changes: { key: string; from: SettingValue | null; to: SettingValue | null }[] }
  | { ok: false; reason: 'forbidden' | 'invalid'; errors: SettingsValidationError[] };

function own(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function validDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Returns an error message, or null when `value` is valid for `def`.
export function validateValue(def: SettingDefinition, value: unknown): string | null {
  switch (def.type) {
    case 'text': {
      if (typeof value !== 'string') return 'must be text';
      if (value.length > MAX_TEXT) return `must be at most ${MAX_TEXT} characters`;
      if (def.required && !value.trim()) return 'is required';
      if (def.pattern && !new RegExp(def.pattern).test(value)) return 'has the wrong format';
      return null;
    }
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return 'must be a number';
      if (def.min !== undefined && value < def.min) return `must be at least ${def.min}`;
      if (def.max !== undefined && value > def.max) return `must be at most ${def.max}`;
      return null;
    }
    case 'boolean':
      return typeof value === 'boolean' ? null : 'must be yes or no';
    case 'select':
      return typeof value === 'string' && (def.options ?? []).some((o) => o.value === value) ? null : 'is not one of the choices';
    case 'multiselect': {
      if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) return 'must be a list of choices';
      if (new Set(value).size !== value.length) return 'has a choice twice';
      if (!value.every((v) => (def.options ?? []).some((o) => o.value === v))) return 'has a value that is not one of the choices';
      if (def.required && value.length === 0) return 'needs at least one choice';
      return null;
    }
    case 'time':
      return typeof value === 'string' && TIME_RE.test(value) ? null : 'must be a time as HH:MM';
    case 'date':
      return typeof value === 'string' && validDate(value) ? null : 'must be a date as YYYY-MM-DD';
    case 'weekdays': {
      if (!Array.isArray(value) || !value.every((v) => typeof v === 'string' && (WEEKDAYS as readonly string[]).includes(v))) {
        return 'must be days from MON to SUN';
      }
      if (new Set(value).size !== value.length) return 'has a day twice';
      if (def.required && value.length === 0) return 'needs at least one day';
      return null;
    }
    case 'numbering': {
      if (typeof value !== 'string' || value.length > 40 || !NUMBERING_RE.test(value)) {
        return 'must use capital letters, digits, / - _ and the tokens {YYYY}, {YY}, {SEQ:n}';
      }
      if ((value.match(/\{SEQ:[1-8]\}/g) ?? []).length !== 1) return 'must contain exactly one {SEQ:n}';
      return null;
    }
    case 'color_token':
      return typeof value === 'string' && own(colors, value) ? null : 'must be a colour of the logo palette';
    case 'list': {
      if (!Array.isArray(value)) return 'must be a list of rows';
      const columns = def.columns ?? [];
      const minRows = def.min ?? 0;
      const maxRows = Math.min(def.max ?? MAX_LIST_ROWS, MAX_LIST_ROWS);
      if (value.length < minRows) return `needs at least ${minRows} rows`;
      if (value.length > maxRows) return `can have at most ${maxRows} rows`;
      for (const [i, row] of value.entries()) {
        if (!isPlainObject(row)) return `row ${i + 1} is not a row`;
        for (const k of Object.keys(row)) {
          if (FORBIDDEN_KEYS.has(k) || !columns.some((c) => c.key === k)) return `row ${i + 1} has an unknown column`;
        }
        for (const c of columns) {
          if (!own(row, c.key)) return `row ${i + 1} is missing ${c.label}`;
          const cell = row[c.key];
          const bad =
            (c.type === 'text' && (typeof cell !== 'string' || cell.length > 200)) ||
            (c.type === 'number' && (typeof cell !== 'number' || !Number.isFinite(cell))) ||
            (c.type === 'time' && (typeof cell !== 'string' || !TIME_RE.test(cell))) ||
            (c.type === 'boolean' && typeof cell !== 'boolean');
          if (bad) return `row ${i + 1}: ${c.label} is not valid`;
        }
      }
      return null;
    }
  }
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Reads the stored values of a school, keeping only keys the schema knows
// (a field removed from the schema is ignored, not served).
export function effectiveValues(schema: ModuleSettingsSchema, stored: unknown): Record<string, SettingValue> {
  const out: Record<string, SettingValue> = Object.create(null);
  const src = isPlainObject(stored) ? stored : {};
  for (const def of schema.fields) {
    const v = own(src, def.key) ? src[def.key] : undefined;
    out[def.key] = v !== undefined && validateValue(def, v) === null ? (v as SettingValue) : def.default;
  }
  return out;
}

// Validates an update from `role` against `schema` and the currently stored
// (non-default) values. The result's `values` is what to store next.
export function applySettingsUpdate(
  schema: ModuleSettingsSchema,
  stored: unknown,
  update: Pick<SettingsUpdate, 'set' | 'resetToDefault'>,
  role: SchoolRole
): ValidatedUpdate {
  const errors: SettingsValidationError[] = [];
  const defs = new Map(schema.fields.map((f) => [f.key, f]));

  const set = update.set ?? {};
  if (!isPlainObject(set)) return { ok: false, reason: 'invalid', errors: [{ key: '', message: 'set must be an object' }] };
  const resets = update.resetToDefault ?? [];
  if (!Array.isArray(resets) || !resets.every((k) => typeof k === 'string')) {
    return { ok: false, reason: 'invalid', errors: [{ key: '', message: 'resetToDefault must be a list of keys' }] };
  }

  const touched = [...Object.keys(set), ...resets];
  if (touched.length === 0) return { ok: false, reason: 'invalid', errors: [{ key: '', message: 'nothing to change' }] };
  for (const key of touched) {
    if (FORBIDDEN_KEYS.has(key)) errors.push({ key, message: 'is not a setting' });
    else if (!defs.has(key)) errors.push({ key, message: 'is not a setting of this module' });
  }
  for (const key of resets) if (own(set, key)) errors.push({ key, message: 'cannot be set and reset together' });
  if (errors.length) return { ok: false, reason: 'invalid', errors };

  // Who may change it (the whole update is refused if any field is not theirs).
  const notEditable = touched.filter((k) => !defs.get(k)!.editableBy.includes(role));
  if (notEditable.length) return { ok: false, reason: 'forbidden', errors: notEditable.map((key) => ({ key, message: 'you cannot change this setting' })) };

  for (const [key, value] of Object.entries(set)) {
    const message = validateValue(defs.get(key)!, value);
    if (message) errors.push({ key, message });
  }
  if (errors.length) return { ok: false, reason: 'invalid', errors };

  // Current stored values, known keys only, in a Map (no prototype to reach).
  const src = isPlainObject(stored) ? stored : {};
  const next = new Map<string, SettingValue>();
  for (const def of schema.fields) {
    if (own(src, def.key) && validateValue(def, src[def.key]) === null) next.set(def.key, src[def.key] as SettingValue);
  }

  const changes: { key: string; from: SettingValue | null; to: SettingValue | null }[] = [];
  for (const [key, value] of Object.entries(set)) {
    const def = defs.get(key)!;
    const from = next.get(key) ?? null;
    const to = sameValue(value, def.default) ? null : (value as SettingValue);
    if (sameValue(from, to)) continue;
    if (to === null) next.delete(key);
    else next.set(key, to);
    changes.push({ key, from, to });
  }
  for (const key of resets) {
    const from = next.get(key) ?? null;
    if (from === null) continue;
    next.delete(key);
    changes.push({ key, from, to: null });
  }

  // A rule between fields (C209), on the values that would now be in force: what is stored, the defaults for the rest.
  if (schema.check && changes.length > 0) {
    const inForce: Record<string, SettingValue> = Object.create(null);
    for (const def of schema.fields) inForce[def.key] = next.get(def.key) ?? def.default;
    const together = schema.check(inForce);
    if (together.length) return { ok: false, reason: 'invalid', errors: [...together] };
  }

  return { ok: true, values: Object.fromEntries(next), changes };
}

// Checks a schema itself (run by the tests over every registered schema).
export function schemaProblems(schema: ModuleSettingsSchema): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const f of schema.fields) {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(f.key) || FORBIDDEN_KEYS.has(f.key)) problems.push(`${f.key}: bad key`);
    if (seen.has(f.key)) problems.push(`${f.key}: duplicate`);
    seen.add(f.key);
    if (validateValue(f, f.default) !== null) problems.push(`${f.key}: default is not valid (${validateValue(f, f.default)})`);
    if (f.editableBy.length === 0) problems.push(`${f.key}: nobody can edit it`);
  }
  // The defaults themselves must pass the module's own rule between fields.
  for (const e of schema.check?.(Object.fromEntries(schema.fields.map((f) => [f.key, f.default]))) ?? []) problems.push(`${e.key}: the defaults cannot stand together (${e.message})`);
  return problems;
}
