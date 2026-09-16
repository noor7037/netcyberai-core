import fs from 'node:fs';
import path from 'node:path';
import type { MetadataRoute } from 'next';
import { blogPosts } from '@/content/blog';
import { absoluteUrl } from '@/lib/seo';

export const dynamic = 'force-static';

// Walks src/app for page.tsx files at build time, so the sitemap always
// matches the routes that actually exist. Dynamic segments ([slug]) are
// skipped here and listed from their own data source below.
function staticRoutes(dir: string, route: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const found = entries.some((e) => e.isFile() && e.name === 'page.tsx') ? [route || '/'] : [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('[') || entry.name.startsWith('_')) continue;
    const isRouteGroup = entry.name.startsWith('(') && entry.name.endsWith(')');
    found.push(...staticRoutes(path.join(dir, entry.name), isRouteGroup ? route : `${route}/${entry.name}`));
  }
  return found;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = staticRoutes(path.join(process.cwd(), 'src/app'), '')
    .sort()
    .map((route) => ({ url: absoluteUrl(route) }));

  const posts = blogPosts.map((post) => ({
    url: absoluteUrl(`/blog/${post.slug}`),
    lastModified: post.publishedOn,
  }));

  return [...pages, ...posts];
}
