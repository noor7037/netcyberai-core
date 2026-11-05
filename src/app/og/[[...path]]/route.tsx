import { products, solutions } from '@/content/catalog';
import { freeTools } from '@/content/free-tools';
import { resourceSections } from '@/content/resources';
import { renderOgCard } from '@/lib/og-card';
import { ogCards, pageMeta } from '@/lib/seo';
import { companyName } from '@/lib/site-config';

// Each public page's own share card (C471), 1200×630: its section and its title, drawn at build. /og/pricing is the
// pricing page's card, /og the home page's. Only the pages the site has are drawn (dynamicParams is off), so nobody can
// make this domain show words of their choosing. A blog post keeps its own card (blog/[slug]/opengraph-image.tsx).
export const dynamic = 'force-static';
export const dynamicParams = false;

type Card = { eyebrow: string; title: string };

const SECTION: Readonly<Record<string, string>> = {
  features: 'Feature',
  products: 'Product',
  solutions: 'Solution',
  'free-tools': 'Free tool',
  resources: 'Resources',
  security: 'Trust',
};

function cards(): Map<string, Card> {
  const out = new Map<string, Card>();
  const eyebrow = (path: string) => SECTION[path.split('/')[1]] ?? companyName;
  for (const m of Object.values(pageMeta)) out.set(m.path, m.path === '/' ? ogCards.site : { eyebrow: eyebrow(m.path), title: m.title });
  for (const p of products) out.set(`/products/${p.slug}`, { eyebrow: 'Product', title: p.title });
  for (const s of solutions) out.set(`/solutions/${s.slug}`, { eyebrow: 'Solution', title: s.title });
  for (const t of freeTools) out.set(`/free-tools/${t.slug}`, { eyebrow: 'Free tool', title: t.title });
  for (const r of resourceSections) out.set(`/resources/${r.slug}`, { eyebrow: 'Resources', title: r.title });
  return out;
}

const toPath = (segments: string[] | undefined) => (segments?.length ? `/${segments.join('/')}` : '/');

export function generateStaticParams() {
  return [...cards().keys()].map((path) => ({ path: path === '/' ? [] : path.slice(1).split('/') }));
}

export function GET(_req: Request, { params }: { params: { path?: string[] } }) {
  const card = cards().get(toPath(params.path));
  if (!card) return new Response('Not found', { status: 404 });
  return renderOgCard(card);
}
