import type { IconName } from '@/components/visual/Icons';
import { isModuleEnabled, type SchoolEntitlements } from './entitlements';
import { MODULE_GROUPS, MODULE_REGISTRY, type ColorToken, type ModuleGroupId, type ModuleId, type ModuleStatus, type Phase, type SchoolRole } from './modules';

// Navigation (Decision Log C110): the school app's sidebar is computed from
// the registry, the signed-in role and the school's entitlements. The
// app shell renders it (8 collapsible groups, 17 §2) and never keeps
// its own list. Badges carry numbers computed by the server only; the
// demo's badge strings ("124 new", "90 sec") never reach the product.

export type NavBadge =
  | { kind: 'count'; value: number; tone: 'neutral' | 'alert' | 'action' }
  | { kind: 'percent'; value: number; tone: 'neutral' | 'success' | 'alert' }
  | { kind: 'new' };

export type NavItem = {
  moduleId: ModuleId;
  label: string;
  href: string;
  icon: IconName;
  status: ModuleStatus;
  // For a module not built yet: when it arrives (the page at `href` says so).
  phase: Phase;
  badge?: NavBadge;
  mobilePriority?: number;
};

export type NavGroup = {
  id: ModuleGroupId;
  label: string;
  tone: readonly [ColorToken, ColorToken];
  items: NavItem[];
};

export type Navigation = { groups: NavGroup[] };

// Groups keep the 17 §2 order; empty groups are left out.
export function buildNavigation(
  role: SchoolRole,
  entitlements: SchoolEntitlements,
  badges: Partial<Record<ModuleId, NavBadge>> = {}
): Navigation {
  const groups = [...MODULE_GROUPS]
    .sort((a, b) => a.order - b.order)
    .map((g) => ({
      id: g.id,
      label: g.label,
      tone: g.tone,
      items: MODULE_REGISTRY.filter((m) => m.group === g.id && m.roles.includes(role) && isModuleEnabled(entitlements, m.id)).map((m) => ({
        moduleId: m.id,
        label: m.label,
        href: m.href,
        icon: m.icon,
        status: m.status,
        phase: m.phase,
        ...(m.mobilePriority ? { mobilePriority: m.mobilePriority } : {}),
        ...(badges[m.id] ? { badge: badges[m.id] } : {}),
      })),
    }))
    .filter((g) => g.items.length > 0);
  return { groups };
}

// The phone bottom bar (C121): the navigation's items that carry a mobile
// priority, lowest first, at most `max`; everything else stays in the menu.
export function bottomNavItems(nav: Navigation, max = 4): NavItem[] {
  return nav.groups
    .flatMap((g) => g.items)
    .filter((i) => i.mobilePriority !== undefined)
    .sort((a, b) => a.mobilePriority! - b.mobilePriority!)
    .slice(0, max);
}
