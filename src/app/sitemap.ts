import fs from 'node:fs';
import path from 'node:path';
import type { MetadataRoute } from 'next';
import { blogPosts } from '@/content/blog';
import { products, solutions } from '@/content/catalog';
import { resourceSections } from '@/content/resources';
import { featureDetails } from '@/content/features';
import { freeTools } from '@/content/free-tools';
import { absoluteUrl } from '@/lib/seo';
import pageDates from '@/content/page-dates.json';

export const dynamic = 'force-static';

// Walks src/app for page.tsx files at build time, so the sitemap always
// matches the routes that actually exist. Dynamic segments ([slug]) are
// skipped here and listed from their own data source below.
//
// (admin)/control, (school)/app, and login are excluded entirely: they're
// authenticated-only internal shells (Prompt D's admin panel/tenant app,
// B2's login page), not public marketing content. Listing them in a
// public sitemap would also hand an anonymous crawler the full route
// shape of the internal admin panel.
// (family) is the parent's app (C230-D), signed-in only like the other two.
// (dev) holds development-only pages such as the /design-system gallery
// (PR-3a), which answer 404 in production and are never public.
const INTERNAL_ROOTS = new Set(['(admin)', '(school)', '(family)', '(parent)', '(dev)', 'login']);

function staticRoutes(dir: string, route: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const found = entries.some((e) => e.isFile() && e.name === 'page.tsx') ? [route || '/'] : [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('[') || entry.name.startsWith('_')) continue;
    if (INTERNAL_ROOTS.has(entry.name)) continue;
    const isRouteGroup = entry.name.startsWith('(') && entry.name.endsWith(')');
    found.push(...staticRoutes(path.join(dir, entry.name), isRouteGroup ? route : `${route}/${entry.name}`));
  }
  return found;
}

// The day each page last changed (C471): from git, by scripts/page_dates.py, which CI holds current. A page with no
// recorded day is listed without one rather than with a made-up date.
const DATES: Readonly<Record<string, string>> = pageDates;
const entry = (route: string): MetadataRoute.Sitemap[number] => (DATES[route] ? { url: absoluteUrl(route), lastModified: DATES[route] } : { url: absoluteUrl(route) });

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = staticRoutes(path.join(process.cwd(), 'src/app'), '')
    .sort()
    .map(entry);

  const posts = blogPosts.map((post) => entry(`/blog/${post.slug}`));

  const catalog = [
    ...products.map((p) => `/products/${p.slug}`),
    ...solutions.map((s) => `/solutions/${s.slug}`),
    ...resourceSections.filter((r) => r.status !== 'coming').map((r) => `/resources/${r.slug}`),
    ...freeTools.map((t) => `/free-tools/${t.slug}`),
    ...featureDetails.map((f) => `/features/${f.slug}`),
  ].map(entry);

  return [...pages, ...catalog, ...posts];
}
