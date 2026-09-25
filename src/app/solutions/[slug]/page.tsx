import { notFound } from 'next/navigation';
import { CatalogPageView } from '@/components/catalog/CatalogPageView';
import { findSolution, solutions } from '@/content/catalog';
import { breadcrumbListJsonLd, buildMetadata, serializeJsonLd } from '@/lib/seo';

export function generateStaticParams() {
  return solutions.map((s) => ({ slug: s.slug }));
}

export const dynamicParams = false;

export function generateMetadata({ params }: { params: { slug: string } }) {
  const s = findSolution(params.slug);
  if (!s) return {};
  return buildMetadata({ path: `/solutions/${s.slug}`, title: s.title, description: s.description });
}

export default function SolutionPage({ params }: { params: { slug: string } }) {
  const page = findSolution(params.slug);
  if (!page) notFound();
  const related = page.related.map((slug) => ({ page: findSolution(slug)!, href: `/solutions/${slug}` }));
  return (
    <>
      <CatalogPageView page={page} kind="Solution" related={related} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd({ path: `/solutions/${page.slug}`, title: page.name })) }}
      />
    </>
  );
}
