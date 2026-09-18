'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavItem = { label: string; href: string };

type Props = {
  items: NavItem[];
  ariaLabel: string;
};

// Shared by Platform 2 (control) and the Office/Finance/Academic
// Platform 3 shells -- all desktop-or-tablet-primary per the device
// matrix, so a horizontal, wrapping top nav (not a bottom bar) is the
// right pattern for all three. Teacher gets its own BottomNav instead
// (phone-first, assume no desktop, per PRD §7.3).
export function TopNav({ items, ariaLabel }: Props) {
  const pathname = usePathname();

  return (
    <nav aria-label={ariaLabel} className="border-b border-slate/10 bg-white">
      <ul className="flex flex-wrap gap-1 px-2">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[44px] items-center border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire ${
                  active ? 'border-sapphire text-sapphire' : 'border-transparent text-slate/70 hover:text-slate'
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
