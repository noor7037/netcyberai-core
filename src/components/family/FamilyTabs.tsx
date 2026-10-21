'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { FamilyTab } from '@/lib/family/modules';

// The five tabs (docs/family-app/11: Home, Study, English, Future, Family), each shown only when its first module is
// live (M1-6, C252). Hidden during the parent's first steps. Fixed at the bottom, 44 px and more, above the phone's
// home bar.
const HREF: Record<FamilyTab, string> = { home: '/family', study: '/family/study', english: '/family/english', future: '/family/future', family: '/family/parent' };
const ICON: Record<FamilyTab, string> = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  study: 'M4 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H4zM20 5h-6a3 3 0 0 0-3 3',
  english: 'M4 5h16v11H8l-4 4z',
  future: 'M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z',
  family: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20a6 6 0 0 1 12 0M12 20a6 6 0 0 1 10 0',
};

export function FamilyTabs({ tabs, labels, navLabel }: { tabs: FamilyTab[]; labels: Record<FamilyTab, string>; navLabel: string }) {
  const path = usePathname() ?? '';
  if (path.startsWith('/family/welcome')) return null;
  const active = (t: FamilyTab) => (t === 'home' ? path === '/family' : t === 'study' ? path.startsWith('/family/study') || path.startsWith('/family/understand') : path.startsWith(HREF[t]));
  return (
    <nav aria-label={navLabel} className="fixed inset-x-0 bottom-0 z-30 border-t border-slate/10 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(15,23,42,0.06)]">
      <ul className="mx-auto flex max-w-xl">
        {tabs.map((t) => (
          <li key={t} className="flex-1">
            <Link href={HREF[t]} aria-current={active(t) ? 'page' : undefined} className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs font-bold ${active(t) ? 'text-royal-deep' : 'text-slate/80'}`}>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
                <path d={ICON[t]} />
              </svg>
              {labels[t]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
