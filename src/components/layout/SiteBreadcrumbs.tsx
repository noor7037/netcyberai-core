'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

// The root layout's one navigation piece (W14-E). It decides by the path what to load, so the Family app, the school
// app and Control never download the public site's catalog (SiteTrail reads it for section names): the trail is a
// separate chunk fetched only on a public page, and the history-depth tracker a separate chunk everywhere but the
// Family app, which has its own Back chips. First Load JS of a Family page stays under its budget (check_family_budget).
const SiteTrail = dynamic(() => import('./SiteTrail').then((m) => m.SiteTrail), { ssr: true });
const NavDepthTracker = dynamic(() => import('@/components/app-ui/NavDepthTracker').then((m) => m.NavDepthTracker), { ssr: false });

const isUnder = (pathname: string, root: string) => pathname === root || pathname.startsWith(`${root}/`);

export function SiteBreadcrumbs() {
  const pathname = usePathname() ?? '';
  const family = isUnder(pathname, '/family');
  const app = family || isUnder(pathname, '/app') || isUnder(pathname, '/control') || isUnder(pathname, '/parent') || isUnder(pathname, '/results') || pathname.startsWith('/design-system/shell') || pathname.startsWith('/free-tools/');
  return (
    <>
      {!family && <NavDepthTracker />}
      {!app && <SiteTrail />}
    </>
  );
}
