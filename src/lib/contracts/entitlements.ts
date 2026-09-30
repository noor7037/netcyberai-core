import type { ModuleId } from './modules';

// Per-school entitlements (Decision Log C110; built in P1-b). A school's
// plan switches modules on, the founder can override any module in Control,
// and a module can carry numeric limits (storage, messages, staff seats).
// Plan names and prices are the founder's decision (16 §4, P4), so a plan
// is just an id here.

export type PlanId = string;

export type EntitlementSource = 'plan' | 'founder_override' | 'trial';

export type ModuleEntitlement = {
  enabled: boolean;
  source: EntitlementSource;
  // Named numeric limits, for example { students: 1500 } or { whatsapp_messages_month: 20000 }.
  limits?: Readonly<Record<string, number>>;
  // Set when the founder switched it off or on by hand, for the audit trail.
  overriddenBy?: string;
  overriddenAt?: string; // ISO timestamp
};

// A school in grace (payment failed) keeps working; read_only lets people
// read and export but not change anything (17 §3a).
export type AccessMode = 'full' | 'grace' | 'read_only' | 'suspended';

export type SchoolEntitlements = {
  schoolId: string;
  plan: PlanId;
  accessMode: AccessMode;
  graceEndsAt?: string; // ISO timestamp, when accessMode is 'grace'
  modules: Readonly<Partial<Record<ModuleId, ModuleEntitlement>>>;
};

// A module missing from the map is off: entitlements are opt-in, so a new
// module never appears for a school until a plan or the founder turns it on.
export function isModuleEnabled(entitlements: SchoolEntitlements, moduleId: ModuleId): boolean {
  if (entitlements.accessMode === 'suspended') return moduleId === 'help-center' || moduleId === 'raise-ticket';
  return entitlements.modules[moduleId]?.enabled === true;
}

export function canWrite(entitlements: SchoolEntitlements): boolean {
  return entitlements.accessMode === 'full' || entitlements.accessMode === 'grace';
}

// The founder's Control toggle: one change, audited server-side.
export type EntitlementChange = {
  schoolId: string;
  moduleId: ModuleId;
  enabled: boolean;
  limits?: Readonly<Record<string, number>>;
  reason: string;
};
