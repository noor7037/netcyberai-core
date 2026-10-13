import type { IconName } from '@/components/visual/Icons';
import type { ColorToken, ModuleStatus, Phase } from '@/lib/contracts/modules';
import type { NavBadge, Navigation, NavItem } from '@/lib/contracts/navigation';
import { tOr, type Lang } from '@/lib/i18n';

// What the shell draws (C121): groups of links. The school app's groups
// come from buildNavigation (registry × role × entitlements, 17 §2); the
// Control plane passes its own. A module not built yet carries its phase,
// so the menu can say "Soon" without a date.

// `tone` colours this item's icon tile; without it the group's tone is used.
export type ShellItem = { href: string; label: string; icon?: IconName; tone?: ColorToken; badge?: NavBadge; comingIn?: Phase };
export type ShellGroup = { id: string; label: string; tone: readonly [ColorToken, ColorToken]; items: ShellItem[] };

const NOT_BUILT: readonly ModuleStatus[] = ['planned', 'foundation', 'spec-v0'];

// Labels are looked up in the message files (`module.<id>`, `group.<id>`,
// `control.nav.<page>`); the registry's English label is the fallback.
export function toShellItem(i: NavItem, lang: Lang = 'en'): ShellItem {
  return {
    href: i.href,
    label: tOr(lang, `module.${i.moduleId}`, i.label),
    icon: i.icon,
    ...(i.badge ? { badge: i.badge } : {}),
    ...(NOT_BUILT.includes(i.status) ? { comingIn: i.phase } : {}),
  };
}

export function toShellGroups(nav: Navigation, lang: Lang = 'en'): ShellGroup[] {
  return nav.groups.map((g) => ({ id: g.id, label: tOr(lang, `group.${g.id}`, g.label), tone: g.tone, items: g.items.map((i) => toShellItem(i, lang)) }));
}

// The link that matches the page: exact, or the closest parent route.
export function activeHref(groups: readonly ShellGroup[], pathname: string): string | null {
  const hrefs = groups.flatMap((g) => g.items.map((i) => i.href)).filter((h) => pathname === h || pathname.startsWith(`${h}/`));
  return hrefs.sort((a, b) => b.length - a.length)[0] ?? null;
}

// The Control plane's menu (docs/19 §3.2): one icon and one colour per item,
// so the founder's sidebar is as easy to scan as a school's. `rewrite`
// lets a development preview point an item at itself.
const CONTROL_LOOK: Record<string, [IconName, ColorToken]> = {
  '/control': ['dashboard', 'royal'],
  '/control/schools': ['school', 'sapphire'],
  '/control/users': ['users', 'azure'],
  '/control/onboarding': ['admissions', 'turquoise'],
  '/control/messaging-cost': ['chat', 'cyan'],
  '/control/templates': ['chat', 'azure'],
  '/control/whatsapp': ['chat', 'emerald'],
  '/control/monitoring': ['pulse', 'emerald'],
  '/control/analytics': ['chart', 'grape'],
  '/control/billing-plans': ['fees', 'tangerine'],
  '/control/compliance': ['shield', 'emerald'],
  '/control/integrations': ['link', 'violet'],
  '/control/support': ['ticket', 'gold'],
  '/control/audit-logs': ['reports', 'amber'],
  '/control/system-settings': ['operations', 'slate'],
};

export function controlShellGroups(nav: readonly { href: string; label: string }[], rewrite: (href: string) => string = (h) => h, lang: Lang = 'en'): ShellGroup[] {
  const key = (href: string) => `control.nav.${href === '/control' ? 'dashboard' : href.replace('/control/', '')}`;
  return [
    {
      id: 'control',
      label: tOr(lang, 'group.control', 'Control'),
      tone: ['sapphire', 'royal'],
      items: nav.map((n) => ({ href: rewrite(n.href), label: tOr(lang, key(n.href), n.label), ...(CONTROL_LOOK[n.href] ? { icon: CONTROL_LOOK[n.href][0], tone: CONTROL_LOOK[n.href][1] } : {}) })),
    },
  ];
}
