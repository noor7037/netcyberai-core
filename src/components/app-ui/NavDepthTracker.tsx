'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { nextDepth } from '@/lib/nav/breadcrumbs';
import { noteNavPage } from './nav-depth';

// Counts the pages this tab has shown, for the Back control of the trail (W14-E). Draws nothing. Mounted once, in the
// root layout, so the school app, Control and the public site all count.
export function NavDepthTracker() {
  const pathname = usePathname();
  const popped = useRef(false);
  useEffect(() => {
    const onPop = () => {
      popped.current = true;
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    if (!pathname) return;
    noteNavPage(pathname, popped.current, nextDepth);
    popped.current = false;
  }, [pathname]);
  return null;
}
