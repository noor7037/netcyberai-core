// The trail of a nested page (W14-E): where you are, and the way up. Pure: no React, no words of its own. The words
// (module names, "Back") come from the caller, in the person's language.

export type Crumb = { label: string; href?: string };
export type Trail = { items: Crumb[]; parent: string | null };

export type TrailScope = 'app' | 'control';

// The scope a path belongs to, and the segments below it: '/app/exams/papers/x' -> ['exams', 'papers', 'x'].
export function scopeOf(pathname: string | null | undefined): { scope: TrailScope; segs: string[] } | null {
  const parts = (pathname ?? '').split('?')[0].split('/').filter(Boolean);
  if (parts[0] !== 'app' && parts[0] !== 'control') return null;
  return { scope: parts[0], segs: parts.slice(1) };
}

// "report-cards" -> "Report cards": the last resort for a segment nobody named.
export function prettify(seg: string): string {
  let s = seg;
  try {
    s = decodeURIComponent(seg);
  } catch {
    // a segment that is not valid percent-encoding is shown as it is
  }
  s = s.replace(/[-_]+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : seg;
}

// Levels below the module, then the page itself. `crumbs` are the named levels a page knows (exam, class, paper); when
// its last crumb has no link it IS the page and `current` is not added. A top-level module page has no trail.
// The way up is the nearest crumb with a link, else the module.
export function buildTrail(input: { pathname: string | null | undefined; rootLabel: (slug: string) => string; current: string; crumbs?: readonly Crumb[] }): Trail | null {
  const at = scopeOf(input.pathname);
  if (!at || at.segs.length < 2) return null;
  const rootHref = `/${at.scope}/${at.segs[0]}`;
  const items: Crumb[] = [{ label: input.rootLabel(at.segs[0]), href: rootHref }, ...(input.crumbs ?? [])];
  if (items[items.length - 1].href !== undefined) items.push({ label: input.current });
  const ups = items.slice(0, -1).filter((c) => c.href);
  return { items, parent: ups.length ? (ups[ups.length - 1].href as string) : rootHref };
}

// The sections of the public site that have a page of their own: a trail links only these. /security has none (its one
// page is /security/data-ownership), so its crumb is a word, not a link to a page that answers 404 (C471).
export const SITE_SECTIONS: Readonly<Record<string, string>> = {
  '/products': 'Products',
  '/solutions': 'Solutions',
  '/features': 'Features',
  '/free-tools': 'Free tools',
  '/resources': 'Resources',
  '/blog': 'Blog',
  '/pricing': 'Pricing',
  '/about': 'About',
  '/contact': 'Contact',
  '/support': 'Support',
  '/privacy': 'Privacy',
  '/terms': 'Terms',
};

// A section that sits under another in the reader's mind: a blog post is a resource.
const SITE_PARENT: Readonly<Record<string, string>> = { '/blog': '/resources' };

// The public site: Products › Attendance, Resources › Blog › a post. The home page has none. `nameOf` names a page
// below a section (a product, a solution) from the site's own catalog; the slug, made readable, stands in.
export function siteTrail(pathname: string | null | undefined, nameOf: (path: string) => string | undefined = () => undefined): Trail | null {
  const parts = (pathname ?? '').split('?')[0].split('/').filter(Boolean);
  if (!parts.length) return null;
  const items: Crumb[] = [];
  const first = `/${parts[0]}`;
  if (SITE_PARENT[first]) items.push({ label: SITE_SECTIONS[SITE_PARENT[first]], href: SITE_PARENT[first] });
  let path = '';
  parts.forEach((seg, i) => {
    path += `/${seg}`;
    const last = i === parts.length - 1;
    const label = SITE_SECTIONS[path] ?? nameOf(path) ?? prettify(seg);
    items.push(!last && SITE_SECTIONS[path] ? { label, href: path } : { label });
  });
  const ups = items.slice(0, -1).filter((c) => c.href);
  return { items, parent: ups.length ? (ups[ups.length - 1].href as string) : '/' };
}

// ---- Back: history when the page before this one is in the app, else the parent ----

// How many in-app pages this tab has shown, kept in sessionStorage by NavDepthTracker. A pop (Back or Forward) takes
// one off; a new page puts one on. Forward counts as a pop, which only errs towards going to the parent.
export function nextDepth(depth: number, popped: boolean): number {
  return popped ? Math.max(1, depth - 1) : depth + 1;
}

// The page before this one is in the app when this tab has shown more than one and the browser has an entry to go to
// (a link opened in a new tab copies sessionStorage but has no history).
export function canGoBack(depth: number, historyLength: number): boolean {
  return depth >= 2 && historyLength > 1;
}

// The current filters stay on a link up: only the named parameters, and never on a link that has its own query.
export function keepQuery(href: string, search: string, keep: readonly string[] = KEEP_PARAMS): string {
  if (href.includes('?') || !search) return href;
  const from = new URLSearchParams(search);
  const to = new URLSearchParams();
  for (const k of keep) {
    const v = from.get(k);
    if (v !== null) to.set(k, v);
  }
  const q = to.toString();
  return q ? `${href}?${q}` : href;
}

export const KEEP_PARAMS: readonly string[] = ['session', 'term', 'class', 'status', 'q', 'show', 'from', 'to', 'tab'];
