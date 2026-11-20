import { notFound } from 'next/navigation';
import { FeatureDetailView } from '@/components/features/FeatureDetailView';
import { featureDetail, featureDetails } from '@/content/features';
import { breadcrumbListJsonLd, buildMetadata, serializeJsonLd } from '@/lib/seo';

export const dynamicParams = false;

export function generateStaticParams() {
  return featureDetails.map((f) => ({ slug: f.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const f = featureDetail(params.slug);
  if (!f) return {};
  return buildMetadata({ path: `/features/${f.slug}`, title: f.title, description: f.metaDescription });
}

export default function FeatureDetailPage({ params }: { params: { slug: string } }) {
  const f = featureDetail(params.slug);
  if (!f) notFound();
  const related = f.related.map((s) => featureDetail(s)).filter((r): r is NonNullable<typeof r> => Boolean(r));
  return (
    <>
      <FeatureDetailView feature={f} related={related} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd({ path: `/features/${f.slug}`, title: f.title })) }}
      />
    </>
  );
}
