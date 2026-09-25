import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { FaqBlock } from '@/components/content/FaqBlock';
import { CTASection } from '@/components/home/CTASection';
import { DemoLabel, EyebrowOnDark, SectionHeading } from '@/components/visual/Primitives';
import { FlowStepper } from '@/components/visual/FlowStepper';
import { SpotlightCard } from '@/components/visual/SpotlightCard';
import { Icon, type IconName } from '@/components/visual/Icons';
import { ChartByKey, CHART_TITLES, ScreenByKey } from '@/components/visual/ByKey';
import type { CatalogPage } from '@/content/catalog';
import { tones, type Tone } from '@/lib/semantic';

const STEP_TONES: Tone[] = ['trust', 'product', 'communication', 'intelligence', 'success'];
const STEP_ICONS: IconName[] = ['school', 'check', 'chat', 'sparkle', 'trophy'];
const ROLE_TONES: Tone[] = ['trust', 'product', 'communication'];

// The visual detail-page template shared by every product and solution
// page: hero -> problem -> solution -> workflow -> product UI -> chart ->
// roles -> automation -> outcome -> related -> FAQ -> CTA.
export function CatalogPageView({ page, kind, related }: { page: CatalogPage; kind: 'Product' | 'Solution'; related: { page: CatalogPage; href: string }[] }) {
  const t = tones[page.tone];
  return (
    <>
      <section aria-labelledby="page-title" className="relative overflow-hidden bg-midnight text-white">
        <div aria-hidden="true" className="nca-mesh-dark absolute inset-0" />
        <div aria-hidden="true" className="nca-spectrum-bar absolute inset-x-0 top-0 h-1" />
        <Container wide className="relative grid grid-cols-1 items-center gap-10 py-16 lg:grid-cols-2 lg:py-20">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <EyebrowOnDark tone={page.tone}>{`${kind} · ${page.name}`}</EyebrowOnDark>
            </div>
            <h1 id="page-title" className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              {page.heroTitle}
            </h1>
            <p className="text-lg opacity-90">{page.heroLead}</p>
            <div className="flex flex-wrap gap-3">
              <Button href="/book-demo" variant="secondary">
                Book a demo
              </Button>
              <Button href="/get-started" variant="outlineLight">
                Get started
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <ScreenByKey k={page.screen} />
            <div className="flex justify-end">
              <DemoLabel onDark />
            </div>
          </div>
        </Container>
      </section>

      <section aria-labelledby="ps-title" className="bg-white">
        <Container wide className="flex flex-col gap-8 py-16">
          <SectionHeading id="ps-title" eyebrow="The problem, and the change" tone="alert" title="What changes for your school" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-coral/30 bg-coral/10 p-6">
              <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-coral-deep">
                <Icon name="alert" className="h-4 w-4" /> Today
              </p>
              <ul className="mt-4 flex flex-col gap-3">
                {page.problem.map((pr) => (
                  <li key={pr} className="flex gap-3 text-slate">
                    <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-coral" />
                    {pr}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl border border-turquoise/40 bg-turquoise/10 p-6">
              <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-emerald">
                <Icon name="check" className="h-4 w-4" /> With NetCyberAI
              </p>
              <ul className="mt-4 flex flex-col gap-3">
                {page.solution.map((so) => (
                  <li key={so} className="flex gap-3 text-slate">
                    <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-turquoise" />
                    {so}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Container>
      </section>

      <section aria-labelledby="wf-title" className="nca-mesh-light bg-off-white">
        <Container wide className="flex flex-col gap-8 py-16">
          <SectionHeading id="wf-title" eyebrow="Workflow" tone={page.tone} title="How it works, step by step" />
          <FlowStepper steps={page.workflow} tones={STEP_TONES} icons={STEP_ICONS} />
        </Container>
      </section>

      <section aria-labelledby="ui-title" className="bg-white">
        <Container wide className="flex flex-col gap-8 py-16">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <SectionHeading id="ui-title" eyebrow="The product" tone="product" title="What it looks like in NetCyberAI" />
            <DemoLabel />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-3">
              <ScreenByKey k={page.secondaryScreen ?? page.screen} />
            </div>
            <div className="flex flex-col gap-3 rounded-3xl border border-slate/10 bg-white p-5 shadow-xl shadow-sapphire/5">
              <p className="text-sm font-bold text-slate">{CHART_TITLES[page.chart]}</p>
              <ChartByKey k={page.chart} />
            </div>
          </div>
        </Container>
      </section>

      <section aria-labelledby="roles-title" className="relative overflow-hidden bg-sapphire text-white">
        <div aria-hidden="true" className="nca-mesh-dark absolute inset-0" />
        <Container wide className="relative flex flex-col gap-8 py-16">
          <SectionHeading dark id="roles-title" eyebrow="Who uses it" tone="communication" title="Built around real roles" />
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {page.users.map((u, i) => (
              <li key={u.role} className="nca-glass flex flex-col gap-3 rounded-2xl p-5">
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[ROLE_TONES[i % 3]].solid}`}>
                  <Icon name="users" className="h-5 w-5" />
                </span>
                <p className="text-lg font-bold">{u.role}</p>
                <p className="opacity-80">{u.value}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section aria-labelledby="auto-title" className="bg-white">
        <Container wide className="grid grid-cols-1 gap-10 py-16 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <SectionHeading id="auto-title" eyebrow="Automation" tone="intelligence" title="What happens automatically" />
            <ul className="flex flex-col gap-3">
              {page.automation.map((a) => (
                <li key={a} className="flex items-start gap-3 rounded-2xl bg-grape/10 p-4 text-grape-deep">
                  <Icon name="sparkle" className="mt-0.5 h-5 w-5 shrink-0" />
                  <span className="font-semibold">{a}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-slate/70">Automation proposes and routes. People with the right permissions decide, and every step is audited.</p>
          </div>
          <div className="flex flex-col gap-6">
            <SectionHeading id="out-title" eyebrow="Outcome" tone="success" title="What your school gets" />
            <ul className="flex flex-col gap-3">
              {page.outcomes.map((o) => (
                <li key={o} className="flex items-start gap-3 rounded-2xl bg-turquoise/15 p-4 text-emerald">
                  <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0" />
                  <span className="font-semibold">{o}</span>
                </li>
              ))}
            </ul>
            <ul className="flex flex-wrap gap-2" aria-label="Benefits">
              {page.benefits.map((b) => (
                <li key={b} className={`rounded-full px-3 py-1 text-sm font-semibold ${t.soft}`}>
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      <section aria-labelledby="rel-title" className="bg-off-white">
        <Container wide className="flex flex-col gap-8 py-16">
          <SectionHeading id="rel-title" eyebrow="Related" tone="product" title={`Related ${kind === 'Product' ? 'capabilities' : 'solutions'}`} />
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {related.map(({ page: r, href }) => (
              <li key={r.slug}>
                <Link href={href} className="block h-full rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal">
                  <SpotlightCard className="flex h-full flex-col gap-3 rounded-2xl border border-slate/10 bg-white p-5">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[r.tone].solid}`}>
                      <Icon name={r.icon} className="h-5 w-5" />
                    </span>
                    <p className="text-lg font-bold text-slate">{r.name}</p>
                    <p className="text-sm text-slate/70">{r.menuBlurb}</p>
                    <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-bold text-royal">
                      Explore <Icon name="arrow" className="h-4 w-4" />
                    </span>
                  </SpotlightCard>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section aria-labelledby="faq-title" className="bg-white">
        <Container wide className="flex flex-col gap-8 py-16">
          <SectionHeading id="faq-title" eyebrow="Questions" tone="product" title={`${page.name}: common questions`} />
          <FaqBlock items={page.faqs} />
        </Container>
      </section>

      <CTASection />
    </>
  );
}
