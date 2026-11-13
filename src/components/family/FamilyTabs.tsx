'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import type { DockTab } from '@/lib/family/modules';

// The tabs (Home, Study, English, Draw, Future; C391 removed Family, C513 added Draw), each shown only when
// its first module is live (M1-6, C252). Hidden during the parent's first steps. Fixed at the bottom, 44 px and more,
// above the phone's home bar.
// W19-C: the dark pill of the founder's reference: an ink dock, each tab a 56 px round button, the open tab on a lilac
// circle with a saffron dot and its name beside it; the other names stay for screen readers (aria-current kept).
const HREF: Record<DockTab, string> = { home: '/family', study: '/family/study', english: '/family/english', draw: '/family/draw', future: '/family/future' };
const ICON: Record<DockTab, string> = {
  home: 'M4 10l8-6 8 6v10H4zM9 15q3 3 6 0',
  study: 'M6 4h12v16H7a1 1 0 0 1-1-1zM6 17h12M10 8h5',
  english: 'M4 5h16v11h-8l-5 4v-4H4zM9 13l3-6 3 6',
  // C513: a brush over a dab of paint.
  draw: 'M14.5 4.5l5 5-7.5 7.5-5-5zM7 12l-2.6 2.6a2.5 2.5 0 0 0 0 3.5l1 1a2.5 2.5 0 0 0 3.5 0L11.5 16.5M4 21h5',
  future: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z',
};

export function FamilyTabs({ tabs, labels, navLabel }: { tabs: DockTab[]; labels: Record<DockTab, string>; navLabel: string }) {
  const path = usePathname() ?? '';
  // C511: a tap on any Call link opens the microphone in that tap (callMic.ts), so the call is ready when its screen is.
  // The helper arrives as its own chunk after the page is up, so no page's first load carries it.
  useEffect(() => {
    let off: (() => void) | undefined;
    let gone = false;
    void import('./call/callMic').then((m) => {
      if (!gone) off = m.installCallPrime();
    });
    return () => {
      gone = true;
      off?.();
    };
  }, []);
  // Away from the call, a microphone primed and not taken is closed.
  useEffect(() => {
    if (!path.startsWith('/family/call')) void import('./call/callMic').then((m) => m.releasePrimedMic());
  }, [path]);
  // Hidden during the first steps, and inside an English lesson or check (C230-Y): a lesson is one task with its own
  // close button and its Next button where the tabs would be.
  // The call (W16-A4) is a full-screen task too.
  // The parent area has its own bottom bar (C506): exactly one bar shows, so the child's dock is not shown on its page.
  if (path.replace(/\/$/, '') === '/family/parent') return null;
  if (path.startsWith('/family/welcome') || path.startsWith('/family/english/lesson') || path.startsWith('/family/english/check') || path.startsWith('/family/call') || path.startsWith('/family/study/book/')) return null;
  const active = (t: DockTab) => (t === 'home' ? path === '/family' || path.startsWith('/family/progress') : t === 'study' ? path.startsWith('/family/study') || path.startsWith('/family/understand') || path.startsWith('/family/tutors') : path.startsWith(HREF[t]));
  return (
    <nav aria-label={navLabel} className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[calc(var(--fam-bottom,0px)+0.75rem)]">
      {/* C513: five tabs pack tighter on a narrow phone (data-count; family.css): still 48 px and more each. */}
      <ul data-count={tabs.length} className="fam-dock mx-auto flex w-fit max-w-full items-center gap-1 rounded-full bg-ink p-1.5">
        {tabs.map((t) => {
          const on = active(t);
          return (
            <li key={t}>
              <Link href={HREF[t]} aria-current={on ? 'page' : undefined} className="fam-press fam-tab">
                <span className="fam-tab-ico">
                  <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round">
                    <path d={ICON[t]} />
                  </svg>
                </span>
                <span className={on ? undefined : 'sr-only'}>{labels[t]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
