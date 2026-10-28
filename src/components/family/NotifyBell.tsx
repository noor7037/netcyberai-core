'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

// The notifications bell in the child-mode header (H1). The dot shows while the school has something new that the
// family has not opened the centre for: the count seen at the last opening is kept on this phone only (localStorage,
// nothing sent anywhere); without storage the dot simply shows while there is something new.
export const NOTIFY_SEEN_KEY = 'ncf.notifySeen';

export function NotifyBell({ label, total }: { label: string; total: number }) {
  const [seen, setSeen] = useState<string | null>(null);
  useEffect(() => {
    try {
      setSeen(window.localStorage.getItem(NOTIFY_SEEN_KEY));
    } catch {
      setSeen(null);
    }
  }, []);
  const dot = total > 0 && seen !== String(total);
  return (
    <Link
      href="/family/notifications"
      aria-label={label}
      data-notify-bell
      className="fam-press relative flex h-11 min-h-[44px] w-11 min-w-[44px] shrink-0 items-center justify-center rounded-full bg-royal-deep text-white shadow-lg ring-1 ring-white/40 hover:bg-midnight"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7" />
        <path d="M10 20a2 2 0 0 0 4 0" />
      </svg>
      {dot && <span data-notify-dot aria-hidden="true" className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-amber ring-2 ring-royal-deep" />}
    </Link>
  );
}

// On the centre's page: remember how much was there when it was opened.
export function NotifySeen({ total }: { total: number }) {
  useEffect(() => {
    try {
      window.localStorage.setItem(NOTIFY_SEEN_KEY, String(total));
    } catch {
      /* no storage: the dot just stays while there is news */
    }
  }, [total]);
  return null;
}
