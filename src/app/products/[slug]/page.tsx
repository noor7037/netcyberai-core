import { notFound } from 'next/navigation';
import { CatalogPageView } from '@/components/catalog/CatalogPageView';
import { findProduct, products } from '@/content/catalog';
import { breadcrumbListJsonLd, buildMetadata, serializeJsonLd } from '@/lib/seo';

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }));
}

export const dynamicParams = false;

export function generateMetadata({ params }: { params: { slug: string } }) {
  const p = findProduct(params.slug);
  if (!p) return {};
  return buildMetadata({ path: `/products/${p.slug}`, title: p.title, description: p.description });
}

export default function ProductPage({ params }: { params: { slug: string } }) {
  const page = findProduct(params.slug);
  if (!page) notFound();
  const related = page.related.map((slug) => ({ page: findProduct(slug)!, href: `/products/${slug}` }));
  return (
    <>
      <CatalogPageView page={page} kind="Product" related={related} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd({ path: `/products/${page.slug}`, title: page.name })) }}
      />
    </>
  );
}
