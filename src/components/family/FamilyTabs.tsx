'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { DockTab } from '@/lib/family/modules';
import { NAV_PENDING_MAX_MS } from '@/lib/family/nav-pending';

// The tabs (Home, Study, English, Draw, Future; C391 removed Family, C513 added Draw), each shown only when
// its first module is live (M1-6, C252). Hidden during the parent's first steps. Fixed at the bottom, 44 px and more,
// above the phone's home bar.
// W19-C: the ink dock of the founder's reference. 17 Nov 2026 (founder): on a phone it runs edge to edge (still above the
// home bar), every tab shows its full name under its icon, and each tab has its own logo colour: its icon in that colour,
// the open tab's icon on a disc of it with its name in it too. On a wide screen the dock is a pill in the same wide
// column as the Study composer (68rem). 18 Nov 2026: it tells the page its own height (--fam-dock-h) so the Ask pill sits right on it,
// and Focus Reading tucks it away while the child reads (family.css, html[data-fam-chrome]).
// C539: a tapped tab lights up at once (data-pending), before the server has answered for its screen; aria-current stays
// on the open screen until the new one is there.
const HREF: Record<DockTab, string> = { home: '/family', study: '/family/study', english: '/family/english', draw: '/family/draw', future: '/family/future' };
// Each tab's own colour (logo tokens, design-tokens.ts): bright hues, each at least 4.5:1 on the ink dock.
export const TAB_TONE: Record<DockTab, { text: string; disc: string }> = {
  home: { text: 'text-tangerine', disc: 'bg-tangerine' },
  study: { text: 'text-sunshine', disc: 'bg-sunshine' },
  english: { text: 'text-cyan', disc: 'bg-cyan' },
  draw: { text: 'text-coral', disc: 'bg-coral' },
  future: { text: 'text-leaf', disc: 'bg-leaf' },
};
const ICON: Record<DockTab, string> = {
  home: 'M4 10l8-6 8 6v10H4zM9 15q3 3 6 0',
  study: 'M6 4h12v16H7a1 1 0 0 1-1-1zM6 17h12M10 8h5',
  english: 'M4 5h16v11h-8l-5 4v-4H4zM9 13l3-6 3 6',
  // C513: a brush over a dab of paint.
  draw: 'M4 20l1-4L16 5l3 3L8 19zM14 7l3 3',
  future: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z',
};

export function FamilyTabs({ tabs, labels, navLabel }: { tabs: DockTab[]; labels: Record<DockTab, string>; navLabel: string }) {
  const path = usePathname() ?? '';
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = nav.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const set = () => root.style.setProperty('--fam-dock-h', `${Math.round(el.getBoundingClientRect().height)}px`);
    const ro = new ResizeObserver(set);
    ro.observe(el);
    set();
    return () => {
      ro.disconnect();
      root.style.removeProperty('--fam-dock-h');
    };
  });
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
  // The tab tapped while its screen is on the way (C539): it ends when the screen is there, or after a while.
  const [pending, setPending] = useState<DockTab | null>(null);
  useEffect(() => setPending(null), [path]);
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(null), NAV_PENDING_MAX_MS);
    return () => clearTimeout(t);
  }, [pending]);
  // Hidden during the first steps, and inside an English lesson or check (C230-Y): a lesson is one task with its own
  // close button and its Next button where the tabs would be.
  // The call (W16-A4) is a full-screen task too.
  // The parent area has its own bottom bar (C506): exactly one bar shows, so the child's dock is not shown on its page.
  if (path.replace(/\/$/, '') === '/family/parent') return null;
  if (path.startsWith('/family/welcome') || path.startsWith('/family/english/lesson') || path.startsWith('/family/english/check') || path.startsWith('/family/call') || path.startsWith('/family/study/book/')) return null;
  const active = (t: DockTab) => (t === 'home' ? path === '/family' || path.startsWith('/family/progress') : t === 'study' ? path.startsWith('/family/study') || path.startsWith('/family/understand') || path.startsWith('/family/tutors') : path.startsWith(HREF[t]));
  return (
    <nav ref={nav} aria-label={navLabel} data-fam-dock className="fixed inset-x-0 bottom-0 z-30 lg:px-4 lg:pb-3">
      <ul data-count={tabs.length} className="fam-dock mx-auto flex w-full items-stretch rounded-t-3xl bg-ink px-1 pb-[calc(var(--fam-bottom,0px)+0.375rem)] pt-1.5 lg:max-w-[68rem] lg:rounded-full lg:p-1.5">
        {tabs.map((t) => {
          const open = active(t);
          const on = pending ? pending === t : open;
          const tone = TAB_TONE[t];
          return (
            <li key={t} data-tab={t} className="min-w-0 flex-1">
              <Link href={HREF[t]} aria-current={open ? 'page' : undefined} data-pending={pending === t ? '' : undefined} onClick={() => !open && setPending(t)} className="fam-press fam-tab">
                <span className={`fam-tab-ico ${on ? `${tone.disc} text-ink` : tone.text}`}>
                  <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round">
                    <path d={ICON[t]} />
                  </svg>
                </span>
                <span data-tab-label className={`fam-tab-label ${on ? tone.text : 'text-white'}`}>{labels[t]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
