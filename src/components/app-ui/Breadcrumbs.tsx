'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useWords } from '@/components/app-shell/Words';
import { MODULE_REGISTRY } from '@/lib/contracts/modules';
import { buildTrail, canGoBack, keepQuery, prettify, type Crumb, type Trail } from '@/lib/nav/breadcrumbs';
import { controlNav } from '@/lib/nav/nav-items';
import { readNavDepth } from './nav-depth';

// Where you are and the way up (W14-E): "Exams › AI Marking Retest › 6-A English › Marking", every level but the last a
// link, and a Back control. Back goes to the page before this one when that page is in the app (the browser then puts
// the scroll back where it was), and to the parent level when this page was opened cold (a link, a reload, a new tab).

const LINK = 'inline-flex min-h-[44px] items-center rounded-sm px-1 text-sm text-slate underline decoration-slate/40 underline-offset-4 hover:decoration-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal';
const BACK = 'inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-md border border-slate/20 bg-white pl-2 pr-3 text-sm font-semibold text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal';

export type TrailLabels = { nav: string; back: string; backTo: string };

// The trail as drawn, for any shell: the school app and Control (below) and the public site draw it the same way.
export function TrailView({ trail, labels, className = '' }: { trail: Trail; labels: TrailLabels; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState('');
  useEffect(() => {
    setSearch(window.location.search);
  }, [pathname]);
  const up = (href: string) => keepQuery(href, search);
  const parentLabel = trail.items.find((c) => c.href === trail.parent)?.label ?? '';
  const goBack = () => {
    let depth = 1;
    let length = 1;
    try {
      depth = readNavDepth();
      length = window.history.length;
    } catch {
      // sessionStorage can be blocked: the parent is always a safe way up
    }
    if (canGoBack(depth, length)) router.back();
    else if (trail.parent) router.push(up(trail.parent));
  };
  const last = trail.items.length - 1;
  return (
    <nav aria-label={labels.nav} data-breadcrumbs className={`flex flex-wrap items-center gap-x-2 gap-y-1 print:hidden ${className}`}>
      <button type="button" onClick={goBack} data-breadcrumb-back aria-label={labels.backTo.replace('{name}', parentLabel)} className={BACK}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        {labels.back}
      </button>
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1 text-sm text-slate">
        {trail.items.map((c: Crumb, i) => (
          <li key={`${i}:${c.label}`} className="flex min-w-0 max-w-full items-center gap-1">
            {i > 0 && (
              <span aria-hidden="true" className="text-slate">
                ›
              </span>
            )}
            {i === last ? (
              <span aria-current="page" className="min-w-0 truncate px-1 font-semibold">
                {c.label}
              </span>
            ) : c.href ? (
              <Link href={up(c.href)} className={LINK}>
                {c.label}
              </Link>
            ) : (
              <span className="px-1">{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

// The module's name where the trail starts: the registry for the school app, the Control menu for Control, in the
// person's language when the shell picked it; the segment made readable when nothing names it.
function useRootLabel() {
  const words: Record<string, string | undefined> = useWords().words;
  return (slug: string): string => {
    const mod = MODULE_REGISTRY.find((m) => m.href === `/app/${slug}`);
    if (mod) return words[`module.${mod.id}`] ?? mod.label;
    const ctl = controlNav.find((n) => n.href === `/control/${slug}`);
    if (ctl) return words[`control.nav.${slug}`] ?? ctl.label;
    return prettify(slug);
  };
}

// ModulePage draws this above the title. A top-level module page (one segment under /app or /control) has no trail.
// `crumbs`: the named levels between the module and the page (an exam, a class, a paper); the page itself is `current`.
export function Breadcrumbs({ current, crumbs }: { current: string; crumbs?: readonly Crumb[] }) {
  const pathname = usePathname();
  const { words } = useWords();
  const rootLabel = useRootLabel();
  const trail = buildTrail({ pathname, rootLabel, current, crumbs });
  if (!trail) return null;
  const labels: TrailLabels = { nav: words['crumbs.nav'] ?? '', back: words['crumbs.back'] ?? '', backTo: words['crumbs.backTo'] ?? '{name}' };
  return <TrailView trail={trail} labels={labels} />;
}
