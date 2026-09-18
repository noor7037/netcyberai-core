'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavItem } from './TopNav';
import { ScanStubButton } from './ScanStubButton';

type Props = {
  items: NavItem[];
  ariaLabel: string;
};

// Teacher shell only: phone, assume no desktop ever (PRD §7.3). A
// fixed bottom bar keeps all 6 items reachable one-handed, thumb-zone,
// without scrolling past content to find navigation -- the opposite
// of TopNav's pattern, deliberately, because this is the one role
// where that device assumption is absolute, not just "primary."
export function BottomNav({ items, ariaLabel }: Props) {
  const pathname = usePathname();

  return (
    <>
      {/* Persistent scan action in the app bar, available from
          anywhere in the Teacher shell, per PRD §7.3. */}
      <header className="sticky top-0 z-10 flex min-h-[44px] items-center justify-between border-b border-slate/10 bg-white px-3">
        <span className="text-sm font-semibold text-slate">NetCyberAI</span>
        <ScanStubButton />
      </header>

      <nav
        aria-label={ariaLabel}
        className="fixed bottom-0 left-0 right-0 z-10 border-t border-slate/10 bg-white"
      >
        <ul className="flex">
          {items.map((item) => {
            const active = pathname === item.href;
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 py-1.5 text-center text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sapphire ${
                    active ? 'text-sapphire' : 'text-slate/70'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
