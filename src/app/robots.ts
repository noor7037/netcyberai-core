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
// what makes that data safe to show a human in context. Today that
// route is /demo alone.
const aiCrawlers = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'PerplexityBot',
  'Google-Extended',
  'CCBot',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/' },
      ...searchCrawlers.map((userAgent) => ({ userAgent, allow: '/' })),
      ...aiCrawlers.map((userAgent) => ({ userAgent, allow: '/', disallow: '/demo' })),
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
