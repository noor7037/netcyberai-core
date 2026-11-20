import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { FaqBlock } from '@/components/content/FaqBlock';
import { CTASection } from '@/components/home/CTASection';
import { EyebrowOnDark, SectionHeading } from '@/components/visual/Primitives';
import { SpotlightCard } from '@/components/visual/SpotlightCard';
import { Icon } from '@/components/visual/Icons';
import type { FeatureDetail } from '@/content/features/types';
import { STATUS_LABEL, moduleStatus } from '@/content/module-status';
import { tones } from '@/lib/semantic';

// One template for every data-driven feature page, /features/<slug> (C533).
export function FeatureDetailView({ feature, related }: { feature: FeatureDetail; related: FeatureDetail[] }) {
  const isFamily = feature.audience === 'family';
  const status = !isFamily && feature.module ? moduleStatus[feature.module as keyof typeof moduleStatus] : undefined;
  return (
    <>
      <section aria-labelledby="feature-title" className="relative overflow-hidden bg-midnight text-white">
        <div aria-hidden="true" className="nca-mesh-dark absolute inset-0" />
        <div aria-hidden="true" className="nca-spectrum-bar absolute inset-x-0 top-0 h-1" />
        <Container wide className="relative flex flex-col gap-5 py-16">
          <div className="flex flex-wrap items-center gap-2">
            <EyebrowOnDark tone={feature.tone}>{isFamily ? 'For families' : 'For schools'}</EyebrowOnDark>
            {status ? (
              <span className="inline-flex min-h-[28px] items-center rounded-full bg-white px-3 text-xs font-bold text-slate">
                {STATUS_LABEL[status.status]}
              </span>
            ) : null}
          </div>
          <h1 id="feature-title" className="max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            {feature.title}
          </h1>
          <p className="max-w-3xl text-lg opacity-90">{feature.lead}</p>
          <div className="flex flex-wrap gap-3">
            {isFamily ? (
              <>
                <Button href="/contact" variant="secondary">
                  Ask us about Family plans
                </Button>
                <Button href="/products/family-app" variant="outlineLight">
                  See the Family app
                </Button>
              </>
            ) : (
              <>
                <Button href="/book-demo" variant="secondary">
                  Book a demo
                </Button>
                <Button href="/get-started" variant="outlineLight">
                  Get started
                </Button>
              </>
            )}
          </div>
        </Container>
      </section>

      <section aria-labelledby="how-title" className="bg-white">
        <Container wide className="flex flex-col gap-8 py-16">
          <SectionHeading id="how-title" eyebrow="Step by step" tone="product" title="How it works" />
          <ol className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {feature.howItWorks.map((s, i) => (
              <li key={s.title} className="flex gap-4 rounded-3xl border border-slate/10 bg-off-white p-5">
                <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-extrabold ${tones[feature.tone].solid}`}>
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="text-lg font-extrabold text-slate">{s.title}</h3>
                  <p className="mt-1 text-sm text-slate/80">{s.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section aria-labelledby="get-title" className="bg-off-white">
        <Container wide className="grid grid-cols-1 gap-10 py-16 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <SectionHeading id="get-title" eyebrow="Outcome" tone="success" title="What you get" />
            <ul className="flex flex-col gap-3">
              {feature.whatYouGet.map((g) => (
                <li key={g} className="flex gap-3 text-base text-slate">
                  <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-royal" />
                  <span>{g}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-6">
            <SectionHeading id="who-title" eyebrow="Roles" tone="communication" title="Who uses it" />
            <ul className="flex flex-col gap-3">
              {feature.whoUsesIt.map((w) => (
                <li key={w.role} className="rounded-2xl border border-slate/10 bg-white p-4">
                  <p className="text-base font-extrabold text-slate">{w.role}</p>
                  <p className="mt-1 text-sm text-slate/80">{w.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      <section aria-labelledby="faq-title" className="bg-white">
        <Container wide className="flex flex-col gap-8 py-16">
          <SectionHeading id="faq-title" eyebrow="Questions" tone="trust" title="Frequently asked questions" />
          <FaqBlock items={feature.faqs} />
        </Container>
      </section>

      {related.length > 0 ? (
        <section aria-labelledby="related-title" className="bg-off-white">
          <Container wide className="flex flex-col gap-8 py-16">
            <SectionHeading id="related-title" eyebrow="Keep reading" tone="intelligence" title="Related features" />
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link href={`/features/${r.slug}`} className="block h-full rounded-3xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal">
                    <SpotlightCard className="flex h-full flex-col gap-3 rounded-3xl border border-slate/10 bg-white p-5">
                      <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tones[r.tone].solid}`}>
                        <Icon name={r.icon} className="h-6 w-6" />
                      </span>
                      <p className="text-lg font-extrabold text-slate">{r.name}</p>
                      <p className="text-sm text-slate/70">{r.blurb}</p>
                      <span className="mt-auto inline-flex min-h-[44px] items-center gap-1.5 text-sm font-bold text-royal">
                        Read more <Icon name="arrow" className="h-4 w-4" />
                      </span>
                    </SpotlightCard>
                  </Link>
                </li>
              ))}
            </ul>
          </Container>
        </section>
      ) : null}

      {isFamily ? (
        <section aria-labelledby="cta-title" className="relative overflow-hidden bg-gradient-to-br from-sapphire via-violet to-grape text-white">
          <Container wide className="relative flex flex-col gap-5 py-14">
            <h2 id="cta-title" className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              Bring it home
            </h2>
            <p className="max-w-2xl text-lg opacity-90">The Family app works for any family, with or without a NetCyberAI school.</p>
            <div className="flex flex-wrap gap-3">
              <Button href="/contact" variant="secondary">
                Ask us about Family plans
              </Button>
              <Button href="/products/family-app" variant="outlineLight">
                See the Family app
              </Button>
            </div>
          </Container>
        </section>
      ) : (
        <CTASection />
      )}
    </>
  );
}
