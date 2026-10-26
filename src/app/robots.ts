import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';

// Search crawlers: allowed everywhere, including /demo — it is a real,
// public marketing page the content plan intends to be found (see
// 11_BUSINESS_LOGIC_ADDENDUM.md §9).
const searchCrawlers = ['Googlebot', 'Bingbot'];

// AI training and live-fetch crawlers: allowed everywhere EXCEPT any
// route holding illustrative or fictional data. General rule, not a
// one-off — such a crawler flattens a page to plain text and loses the
// non-dismissible "Concept demo — a fictional school" banner that is
// what makes that data safe to show a human in context. /demo now
// redirects to /product-tour, whose demos carry an inline label beside
// every device; the rule stays so the old path is never indexed.
const aiCrawlers = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'PerplexityBot',
  'Google-Extended',
  'CCBot',
];

// A family's private result link (/results/<key>, C351) is never fetched by any crawler: one child's marks and checked
// pages live there. Its page and pictures also say noindex and no-store themselves (next.config.js headers), for a
// crawler that does not read this file.
const PRIVATE = ['/results/'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: PRIVATE },
      ...searchCrawlers.map((userAgent) => ({ userAgent, allow: '/', disallow: PRIVATE })),
      ...aiCrawlers.map((userAgent) => ({ userAgent, allow: '/', disallow: ['/demo', ...PRIVATE] })),
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
