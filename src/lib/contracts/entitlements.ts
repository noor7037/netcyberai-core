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

// Help Center and Raise Ticket are always on, in every access mode and
// whatever the entitlements say (founder rule, C112): a school must always
// be able to get help, above all a suspended one. The database refuses to
// store them switched off (school_module_entitlements.help_modules_always_on).
export const ALWAYS_ON_MODULES: readonly ModuleId[] = ['help-center', 'raise-ticket'];

export function isAlwaysOn(moduleId: ModuleId): boolean {
  return ALWAYS_ON_MODULES.includes(moduleId);
}

// Any other module missing from the map is off: entitlements are opt-in, so
// a new module never appears for a school until a plan or the founder turns
// it on. A suspended school keeps only the always-on modules.
export function isModuleEnabled(entitlements: SchoolEntitlements, moduleId: ModuleId): boolean {
  if (isAlwaysOn(moduleId)) return true;
  if (entitlements.accessMode === 'suspended') return false;
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

// One entry of a school's entitlement history, read from the audit log for
// the founder (Control, C123): who changed what, when, and why.
export type EntitlementHistoryEntry = {
  id: string;
  at: string; // ISO timestamp
  actorName: string | null; // null: done by the platform itself (provisioning, backfill)
  kind: 'module_changed' | 'access_changed' | 'plan_applied';
  moduleId?: string;
  enabled?: { from: boolean | null; to: boolean };
  accessMode?: { from: AccessMode | null; to: AccessMode };
  graceEndsAt?: string | null;
  plan?: string;
  moduleCount?: number;
  reason: string | null;
};

// A plan the founder can apply to a school (names are technical until P4).
export type PlanSummary = { planId: string; label: string; moduleIds: readonly ModuleId[] };

const ACCESS_WORDS: Record<AccessMode, string> = { full: 'Full access', grace: 'Grace period', read_only: 'Read only', suspended: 'Suspended' };
export const accessModeLabel = (m: AccessMode): string => ACCESS_WORDS[m];

// The change in one sentence, for the history list.
export function describeEntitlementChange(e: EntitlementHistoryEntry, moduleLabel: (id: string) => string): string {
  if (e.kind === 'module_changed' && e.enabled) return `${moduleLabel(e.moduleId ?? '')} switched ${e.enabled.to ? 'on' : 'off'}`;
  if (e.kind === 'access_changed' && e.accessMode) {
    const from = e.accessMode.from ? ` (was ${accessModeLabel(e.accessMode.from).toLowerCase()})` : '';
    return `Access set to ${accessModeLabel(e.accessMode.to).toLowerCase()}${from}`;
  }
  if (e.kind === 'plan_applied') return `Plan “${e.plan}” applied${e.moduleCount !== undefined ? `: ${e.moduleCount} ${e.moduleCount === 1 ? 'module' : 'modules'} switched on` : ''}`;
  return 'Entitlements changed';
}

