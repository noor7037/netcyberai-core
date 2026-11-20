'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TrailView } from '@/components/app-ui/Breadcrumbs';
import { Container } from '@/components/ui/Container';
import { featurePages, findProduct, findSolution } from '@/content/catalog';
// Only public pages load this file (SiteBreadcrumbs imports it on demand), so the Family app never downloads these names.
import { featureNames } from '@/content/features/menu';

const FEATURE_NAMES = featureNames();
import { siteTrail } from '@/lib/nav/breadcrumbs';

// The public site's trail (W14-E): Products › Attendance, Resources › Blog › a post, under the header in the content
// column. The home page has none, and neither has anything the site header is not drawn on (the app, Control, the
// Family app) or a free tool's page, which draws its own. The site speaks English, as its header does.
const LABELS = { nav: 'Where you are', back: 'Back', backTo: 'Back to {name}' };

// A page below a section, by its name in the site's own catalog.
function nameOf(path: string): string | undefined {
  const [, section, slug] = path.split('/');
  if (section === 'products') return findProduct(slug)?.name;
  if (section === 'solutions') return findSolution(slug)?.name;
  if (section === 'features') return featurePages.find((f) => f.href === path)?.name ?? FEATURE_NAMES.find(([p]) => p === path)?.[1];
  return undefined;
}

export function SiteTrail() {
  const pathname = usePathname();
  // A blog post's title is long and lives with the post: the page's own heading names the last level once it is shown.
  const [heading, setHeading] = useState<{ path: string; text: string } | null>(null);
  useEffect(() => {
    if (!pathname?.startsWith('/blog/')) return;
    const h1 = document.querySelector('main h1')?.textContent?.trim();
    if (h1) setHeading({ path: pathname, text: h1 });
  }, [pathname]);
  // The same places the site header and footer are not drawn (components/layout/Header.tsx).
  if (!pathname || pathname.startsWith('/control') || pathname.startsWith('/app') || pathname === '/family' || pathname.startsWith('/family/') || pathname === '/parent' || pathname.startsWith('/parent/') || pathname.startsWith('/design-system/shell') || pathname.startsWith('/results/') || pathname.startsWith('/enquire/')) return null;
  if (pathname.startsWith('/free-tools/')) return null;
  const trail = siteTrail(pathname, (p) => nameOf(p) ?? (p === pathname && heading?.path === pathname ? heading.text : undefined));
  if (!trail) return null;
  return (
    <Container className="py-2">
      <TrailView trail={trail} labels={LABELS} />
    </Container>
  );
}
