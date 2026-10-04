import type { IconName } from '@/components/visual/Icons';
import type { ColorToken, ModuleStatus, Phase } from '@/lib/contracts/modules';
import type { NavBadge, Navigation, NavItem } from '@/lib/contracts/navigation';

// What the shell draws (C121): groups of links. The school app's groups
// come from buildNavigation (registry × role × entitlements, 17 §2); the
// Control plane passes its own. A module not built yet carries its phase,
// so the menu can say "Soon" without a date.

export type ShellItem = { href: string; label: string; icon?: IconName; badge?: NavBadge; comingIn?: Phase };
export type ShellGroup = { id: string; label: string; tone: readonly [ColorToken, ColorToken]; items: ShellItem[] };

const NOT_BUILT: readonly ModuleStatus[] = ['planned', 'foundation', 'spec-v0'];

export function toShellItem(i: NavItem): ShellItem {
  return {
    href: i.href,
    label: i.label,
    icon: i.icon,
    ...(i.badge ? { badge: i.badge } : {}),
    ...(NOT_BUILT.includes(i.status) ? { comingIn: i.phase } : {}),
  };
}

export function toShellGroups(nav: Navigation): ShellGroup[] {
  return nav.groups.map((g) => ({ id: g.id, label: g.label, tone: g.tone, items: g.items.map(toShellItem) }));
}

// The link that matches the page: exact, or the closest parent route.
export function activeHref(groups: readonly ShellGroup[], pathname: string): string | null {
  const hrefs = groups.flatMap((g) => g.items.map((i) => i.href)).filter((h) => pathname === h || pathname.startsWith(`${h}/`));
  return hrefs.sort((a, b) => b.length - a.length)[0] ?? null;
}
