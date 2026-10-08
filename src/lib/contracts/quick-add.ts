import type { IconName } from '@/components/visual/Icons';
import { canWrite, isModuleEnabled, type SchoolEntitlements } from './entitlements';
import { moduleById, type ColorToken, type ModuleId, type SchoolRole } from './modules';

// The "+ New" button (docs/19 rule 4, C135): the few things people add
// every day, one tap from anywhere. Each action belongs to a module, and
// the menu is computed, never kept as its own list: an action is offered
// only when the person's role may use that module, the school has it
// switched on, and (for an action that changes records) the school is not
// in read-only mode. Switch a module off and its action disappears here,
// as it does from the menu and from search (rule 7). Words come from the
// message files (`new.<id>`).
//
// A module adds its own action by adding a row; nothing else changes.
// Collect fee and Send notice (rule 4) arrive with their modules (P3, P4).

export type QuickAddAction = {
  id: 'add-student' | 'mark-attendance' | 'raise-ticket';
  moduleId: ModuleId;
  href: string;
  icon: IconName;
  // Narrower than the module's own roles, when only some may add.
  roles?: readonly SchoolRole[];
  // Raising a ticket stays possible when the school is read-only.
  writes: boolean;
};

export const QUICK_ADD_ACTIONS: readonly QuickAddAction[] = [
  { id: 'add-student', moduleId: 'students', href: '/app/students?new=1', icon: 'student', writes: true },
  { id: 'mark-attendance', moduleId: 'attendance', href: '/app/attendance', icon: 'attendance', writes: true },
  { id: 'raise-ticket', moduleId: 'raise-ticket', href: '/app/help/ticket/new', icon: 'ticket', writes: false },
];

export type QuickAddItem = { id: QuickAddAction['id']; href: string; icon: IconName; tone: ColorToken };

export function buildQuickAdd(role: SchoolRole, entitlements: SchoolEntitlements): QuickAddItem[] {
  return QUICK_ADD_ACTIONS.filter((a) => {
    const mod = moduleById(a.moduleId);
    if (!(a.roles ?? mod.roles).includes(role)) return false;
    if (!isModuleEnabled(entitlements, a.moduleId)) return false;
    return !a.writes || canWrite(entitlements);
  }).map((a) => ({ id: a.id, href: a.href, icon: a.icon, tone: moduleById(a.moduleId).tone[0] }));
}
