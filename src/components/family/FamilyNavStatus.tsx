'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NAV_PENDING_MAX_MS, startsNavigation } from '@/lib/family/nav-pending';

// Every Family screen (C539): a tap on a link to another screen shows at once, as a thin bar along the top, until that
// screen is there (or a while has passed); and with no internet, a line saying what still opens. One listener on the
// document, so the links themselves need nothing.
export function FamilyNavStatus({ offlineText }: { offlineText: string }) {
  const path = usePathname();
  const query = useSearchParams()?.toString() ?? '';
  const [pending, setPending] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => setPending(false), [path, query]);
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(false), NAV_PENDING_MAX_MS);
    return () => clearTimeout(t);
  }, [pending]);

  useEffect(() => {
    const onTap = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (a && startsNavigation({ href: a.getAttribute('href'), target: a.getAttribute('target'), download: a.hasAttribute('download') }, e, location.href)) setPending(true);
    };
    const back = () => setPending(false);
    const net = () => setOffline(navigator.onLine === false);
    net();
    document.addEventListener('click', onTap, true);
    window.addEventListener('pageshow', back);
    window.addEventListener('online', net);
    window.addEventListener('offline', net);
    return () => {
      document.removeEventListener('click', onTap, true);
      window.removeEventListener('pageshow', back);
      window.removeEventListener('online', net);
      window.removeEventListener('offline', net);
    };
  }, []);

  return (
    <>
      {pending && <div aria-hidden="true" data-fam-nav-pending className="fam-nav-bar bg-saffron" />}
      {offline && (
        <p role="status" data-fam-offline className="bg-ink px-4 py-2 text-center text-sm font-semibold text-white">
          {offlineText}
        </p>
      )}
    </>
  );
}
