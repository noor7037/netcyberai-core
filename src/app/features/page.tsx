import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { EyebrowOnDark, SectionHeading } from '@/components/visual/Primitives';
import { SpotlightCard } from '@/components/visual/SpotlightCard';
import { Icon } from '@/components/visual/Icons';
import { GapDetection } from '@/components/home/GapDetection';
import { PersonalBestJourney } from '@/components/home/PersonalBestJourney';
import { CTASection } from '@/components/home/CTASection';
import { featurePages, products } from '@/content/catalog';
import { tones } from '@/lib/semantic';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';

export const metadata = buildMetadata(pageMeta.features);

export default function FeaturesPage() {
  return (
    <>
      <section aria-labelledby="features-title" className="relative overflow-hidden bg-midnight text-white">
        <div aria-hidden="true" className="nca-mesh-dark absolute inset-0" />
        <div aria-hidden="true" className="nca-spectrum-bar absolute inset-x-0 top-0 h-1" />
        <Container wide className="relative flex flex-col gap-5 py-16">
          <EyebrowOnDark tone="intelligence">Features</EyebrowOnDark>
          <h1 id="features-title" className="max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
            The features that make a school feel connected
          </h1>
          <p className="max-w-3xl text-lg opacity-90">
            These are the NetCyberAI features schools ask about most: a Daily Learning Pulse parents actually read,
            WhatsApp fee reminders with a UPI link, Personal Best recognition every student can earn, a private Teacher
            Impact Card, and certificates issued only after clearance. Each one runs on the same validated school record.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button href="/book-demo" variant="secondary">
              Book a demo
            </Button>
            <Button href="/product-tour" variant="outlineLight">
              Watch the product tour
            </Button>
          </div>
        </Container>
      </section>

      <section className="bg-off-white">
        <Container wide className="flex flex-col gap-8 py-16">
          <SectionHeading eyebrow="Feature guides" tone="product" title="Explore each feature in depth" />
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featurePages.map((f) => (
              <li key={f.href}>
                <Link href={f.href} className="block h-full rounded-3xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal">
                  <SpotlightCard className="flex h-full flex-col gap-3 rounded-3xl border border-slate/10 bg-white p-5">
                    <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tones[f.tone].solid}`}>
                      <Icon name={f.icon} className="h-6 w-6" />
                    </span>
                    <p className="text-lg font-extrabold text-slate">{f.name}</p>
                    <p className="text-sm text-slate/70">{f.blurb}</p>
                    <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-bold text-royal">
                      Read more <Icon name="arrow" className="h-4 w-4" />
                    </span>
                  </SpotlightCard>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <PersonalBestJourney />
      <GapDetection />

      <section className="bg-white">
        <Container wide className="flex flex-col gap-8 py-16">
          <SectionHeading eyebrow="Also in the platform" tone="trust" title="Every feature lives inside a product" />
          <ul className="flex flex-wrap gap-2">
            {products.map((p) => (
              <li key={p.slug}>
                <Link href={`/products/${p.slug}`} className={`inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-sm font-bold ${tones[p.tone].soft}`}>
                  <Icon name={p.icon} className="h-4 w-4" /> {p.name}
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <CTASection />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.features)) }} />
    </>
  );
}
