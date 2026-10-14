import type { ModuleId, SchoolRole } from './modules';

// The settings framework's contract (17 §1a; engine built in P1-b,
// Decision Log C110). Every module declares a typed schema; each school's
// values are validated against it, audited, versioned and resettable; the
// app generates the settings screen from the schema and never
// hand-builds one.

export type SettingType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'time' // 'HH:MM'
  | 'date' // 'YYYY-MM-DD'
  | 'weekdays' // subset of MON..SUN
  | 'numbering' // a pattern such as 'ADM-{YYYY}-{SEQ:4}'
  | 'color_token' // one accent colour from the logo palette
  | 'list'; // an ordered list of labelled rows (periods, grade bands, attendance codes)

export type SettingValue = string | number | boolean | readonly string[] | readonly Readonly<Record<string, string | number | boolean>>[];

export type SettingOption = { value: string; label: string };

// A row of a 'list' setting: its columns.
export type ListColumn = { key: string; label: string; type: 'text' | 'number' | 'time' | 'boolean' };

export type SettingDefinition = {
  key: string; // unique within the module, 'snake_case'
  label: string;
  help?: string;
  section: string; // groups fields on the generated screen
  type: SettingType;
  default: SettingValue;
  required?: boolean;
  options?: readonly SettingOption[]; // select, multiselect
  min?: number; // number; minimum rows for 'list'
  max?: number;
  pattern?: string; // text: a regular expression the value must match
  columns?: readonly ListColumn[]; // list
  // Who may change it. Everyone who can open the module may read it.
  editableBy: readonly SchoolRole[];
  // Changing it affects records already created (shown as a warning).
  affectsExistingRecords?: boolean;
};

export type ModuleSettingsSchema = {
  moduleId: ModuleId;
  version: number; // bumped when fields are added or change meaning
  fields: readonly SettingDefinition[];
  // A rule that holds between fields (C209): given the values that would be in force after a change, the ones
  // that cannot stand together, or none. A change that leaves any is refused as invalid, whichever field it
  // touched (a reset to the default too). Each field's own sentence says the rule.
  check?: (effective: Readonly<Record<string, SettingValue>>) => readonly SettingsValidationError[];
};

// A school's current values: only what differs from the defaults is stored.
export type SchoolSettings = {
  schoolId: string;
  moduleId: ModuleId;
  schemaVersion: number;
  values: Readonly<Record<string, SettingValue>>;
  revision: number; // increases with every saved change (optimistic concurrency)
  updatedAt: string;
};

// Saving: the screen sends the revision it read; a stale revision is refused.
export type SettingsUpdate = {
  moduleId: ModuleId;
  baseRevision: number;
  set?: Readonly<Record<string, SettingValue>>;
  resetToDefault?: readonly string[];
};

export type SettingsValidationError = { key: string; message: string };

export type SettingsUpdateResult =
  | { ok: true; settings: SchoolSettings }
  | { ok: false; reason: 'stale_revision' | 'forbidden' | 'invalid'; errors?: readonly SettingsValidationError[] };

// One entry of a setting's history (the audit log holds the same event).
export type SettingChange = {
  key: string;
  from: SettingValue | null; // null = was the default
  to: SettingValue | null; // null = reset to the default
  changedBy: string; // user id
  changedByName?: string | null; // their name, for the school's own history list
  changedAt: string;
  revision: number;
};

// Onboarding templates (17 §1a): a starting point a new school is set up
// from in one click, maintained by the founder in Control.
export type OnboardingTemplate = {
  id: string;
  name: string;
  board: 'CBSE' | 'ICSE' | 'STATE' | 'IB' | 'OTHER';
  levels: readonly ('pre_primary' | 'primary' | 'middle' | 'secondary' | 'senior_secondary')[];
  classes: readonly { name: string; sections: readonly string[] }[];
  subjects: readonly { name: string; classes: readonly string[] }[];
  settings: Readonly<Partial<Record<ModuleId, Readonly<Record<string, SettingValue>>>>>;
  version: number;
};
