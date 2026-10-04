import { isModuleEnabled, type SchoolEntitlements } from '@/lib/contracts/entitlements';
import { moduleById, MODULE_REGISTRY, type ModuleDefinition, type ModuleId, type SchoolRole } from '@/lib/contracts/modules';

// What an unbuilt module's route shows (C121): its Coming page, or why
// this person cannot use it (the same reasons the API gives).
export type ComingState = 'coming' | 'role' | 'module';

export function comingState(role: SchoolRole, entitlements: SchoolEntitlements, moduleId: ModuleId): ComingState {
  if (!moduleById(moduleId).roles.includes(role)) return 'role';
  if (!isModuleEnabled(entitlements, moduleId)) return 'module';
  return 'coming';
}

// The module whose reserved route is /app/<segment>, if any.
export function moduleForSegment(segment: string): ModuleDefinition | null {
  return MODULE_REGISTRY.find((m) => m.href === `/app/${segment}`) ?? null;
}
