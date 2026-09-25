import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { FaqBlock } from '@/components/content/FaqBlock';
import { EyebrowOnDark } from '@/components/visual/Primitives';
import { SpotlightCard } from '@/components/visual/SpotlightCard';
import { Icon } from '@/components/visual/Icons';
import { findResource, resourceSections } from '@/content/resources';
import { tones } from '@/lib/semantic';
import { breadcrumbListJsonLd, buildMetadata, serializeJsonLd } from '@/lib/seo';

export function generateStaticParams() {
  return resourceSections.map((r) => ({ slug: r.slug }));
}

export const dynamicParams = false;

export function generateMetadata({ params }: { params: { slug: string } }) {
  const r = findResource(params.slug);
  if (!r) return {};
  return buildMetadata({ path: `/resources/${r.slug}`, title: r.title, description: r.description });
}

export default function ResourcePage({ params }: { params: { slug: string } }) {
  const r = findResource(params.slug);
  if (!r) notFound();
  const t = tones[r.tone];
  return (
    <>
      <section aria-labelledby="res-title" className="relative overflow-hidden bg-midnight text-white">
        <div aria-hidden="true" className="nca-mesh-dark absolute inset-0" />
        <Container wide className="relative flex flex-col gap-5 py-16">
          <div className="flex flex-wrap items-center gap-2">
            <EyebrowOnDark tone={r.tone}>{`Resources · ${r.name}`}</EyebrowOnDark>
            {r.status === 'available' ? (
              <span className="rounded-full bg-turquoise px-3 py-1 text-xs font-bold text-slate">Available</span>
            ) : (
              <span className="rounded-full bg-gold px-3 py-1 text-xs font-bold text-slate">Not published yet</span>
            )}
          </div>
          <h1 id="res-title" className="max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
            {r.heroTitle}
          </h1>
          <p className="max-w-3xl text-lg opacity-90">{r.heroLead}</p>
        </Container>
      </section>

      {r.items.length > 0 && (
        <section className="bg-off-white">
          <Container wide className="py-16">
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {r.items.map((it) => {
                const body = (
                  <SpotlightCard className="flex h-full flex-col gap-3 rounded-2xl border border-slate/10 bg-white p-5">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${t.solid}`}>
                      <Icon name={r.icon} className="h-5 w-5" />
                    </span>
                    <p className="text-lg font-bold text-slate">{it.title}</p>
                    <p className="text-sm text-slate/70">{it.body}</p>
                    {it.href && (
                      <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-bold text-royal">
                        Open <Icon name="arrow" className="h-4 w-4" />
                      </span>
                    )}
                  </SpotlightCard>
                );
                return (
                  <li key={it.title}>
                    {it.href ? (
                      <Link href={it.href} className="block h-full rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal">
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ul>
          </Container>
        </section>
      )}

      {r.faqs && (
        <section className="bg-white">
          <Container wide className="py-16">
            <FaqBlock items={r.faqs} />
          </Container>
        </section>
      )}

      <section className="bg-white">
        <Container wide className="flex flex-col items-start gap-4 border-t border-slate/10 py-12 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-lg font-bold text-slate">Have a question this page doesn’t answer?</p>
          <div className="flex flex-wrap gap-3">
            <Button href="/contact" variant="outline">
              Ask us
            </Button>
            <Button href="/book-demo" variant="secondary">
              Book a demo
            </Button>
          </div>
        </Container>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd({ path: `/resources/${r.slug}`, title: r.name })) }}
      />
    </>
  );
}
