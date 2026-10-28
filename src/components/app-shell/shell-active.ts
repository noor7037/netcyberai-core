import type { IconName } from '@/components/visual/Icons';
import type { ColorToken, Phase } from '@/lib/contracts/modules';
import type { NavBadge } from '@/lib/contracts/navigation';

// What the shell draws, and the link that is the page (C121), with nothing of the message table (C401): the shell is
// a client component, and shell-nav.ts (which names the links on the server) reads the whole table.

// `tone` colours this item's icon tile; without it the group's tone is used.
export type ShellItem = { href: string; label: string; icon?: IconName; tone?: ColorToken; badge?: NavBadge; comingIn?: Phase };
export type ShellGroup = { id: string; label: string; tone: readonly [ColorToken, ColorToken]; items: ShellItem[] };

// The link that matches the page: exact, or the closest parent route. A link
// with a query (a task of Frequent work) is never the page itself.
export function activeHref(groups: readonly Pick<ShellGroup, 'items'>[], pathname: string): string | null {
  const hrefs = groups.flatMap((g) => g.items.map((i) => i.href)).filter((h) => pathname === h || pathname.startsWith(`${h}/`));
  return hrefs.sort((a, b) => b.length - a.length)[0] ?? null;
}
