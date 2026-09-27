import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { FaqBlock } from '@/components/content/FaqBlock';
import { EyebrowOnDark, SectionHeading } from '@/components/visual/Primitives';
import { SpotlightCard } from '@/components/visual/SpotlightCard';
import { Icon } from '@/components/visual/Icons';
import { QuoteForm } from '@/components/marketing/QuoteForm';
import { moduleRows, plans, publishedClaims } from '@/content/pricing';
import { tones } from '@/lib/semantic';
import { whatsappLink } from '@/lib/site-config';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd, softwareApplicationJsonLd } from '@/lib/seo';

export const metadata = buildMetadata(pageMeta.pricing);

// Commercial claims come only from src/content/pricing.ts, where each one
// carries a CONFIRMED / PROPOSED / GAP status; this page renders the
// confirmed ones only. Do not hardcode offers or prices here.

const faqs = [
  {
    question: 'How is NetCyberAI pricing structured?',
    answer:
      'There are four plans. Free is a set of browser tools any school can use today without an account. Starter, Growth and Compass each add more of the product on top of the last, and each school receives a custom quote based on its size and the modules it needs, confirmed by a real person.',
  },
  {
    question: 'Is there a free plan?',
    answer:
      'Yes, in the form available today: the free tools for checking a student list, calculating attendance targets and writing fee reminders and parent updates. They need no account and run in your browser. Terms for a free school account are still being finalised and will be published here when they are.',
  },
  {
    question: 'What drives WhatsApp messaging cost?',
    answer:
      'WhatsApp Business messaging is billed by Meta per message, separately from NetCyberAI’s own pricing. The rate depends on the message category and changes on Meta’s schedule, so we show you the current rate card when we quote rather than a fixed figure that could already be out of date.',
  },
  {
    question: 'Is there a pilot for new schools?',
    answer:
      'Yes. Every new school starts in pilot mode with outbound WhatsApp messaging switched off, so nothing reaches a real parent until the school explicitly turns it on. That lets you, your staff and us confirm the data and messages look right first.',
  },
  {
    question: 'Which modules can we use today?',
    answer:
      'The comparison table marks each module as available now or in development. Student records, imports, consent, attendance with absence alerts, document scanning and QR ID cards are available now; the Daily Learning Pulse, fees and receipts, exams and recognition are in development.',
  },
];

function Mark({ on }: { on: boolean }) {
  return on ? (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-turquoise/15 text-emerald">
      <Icon name="check" className="h-4 w-4" />
      <span className="sr-only">Included</span>
    </span>
  ) : (
    <span className="text-slate/70">
      <span aria-hidden="true">–</span>
      <span className="sr-only">Not included</span>
    </span>
  );
}

export default function PricingPage() {
  return (
    <>
      <section aria-labelledby="pricing-title" className="relative overflow-hidden bg-midnight text-white">
        <div aria-hidden="true" className="nca-mesh-dark absolute inset-0" />
        <div aria-hidden="true" className="nca-spectrum-bar absolute inset-x-0 top-0 h-1" />
        <Container wide className="relative flex flex-col gap-5 py-16">
          <EyebrowOnDark tone="action">Pricing</EyebrowOnDark>
          <h1 id="pricing-title" className="max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
            Pricing that grows with your school
          </h1>
          <p className="max-w-3xl text-lg opacity-90">
            NetCyberAI has four plans: Free tools any school can use today, and Starter, Growth and Compass for schools
            that want the full platform. Each school gets a custom quote based on its size and the modules it needs, and
            every school starts in pilot mode, so nothing reaches a parent before you are ready.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button href="#quote" variant="secondary">
              Get a custom quote
            </Button>
            <Button href="/book-demo" variant="outlineLight">
              Book a demo
            </Button>
          </div>
        </Container>
      </section>

      <section aria-labelledby="value-title" className="bg-off-white">
        <Container wide className="flex flex-col gap-8 py-16">
          <SectionHeading id="value-title" eyebrow="What every plan includes" tone="trust" title="Clear terms, stated plainly" />
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {publishedClaims.map((c) => (
              <li key={c.id}>
                <SpotlightCard className="flex h-full flex-col gap-3 rounded-3xl border border-slate/10 bg-white p-5">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tones[c.tone].solid}`}>
                    <Icon name={c.icon} className="h-5 w-5" />
                  </span>
                  <p className="font-extrabold text-slate">{c.title}</p>
                  <p className="text-sm text-slate/70">{c.body}</p>
                </SpotlightCard>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section aria-labelledby="plans-title" className="bg-white">
        <Container wide className="flex flex-col gap-8 py-16">
          <SectionHeading
            id="plans-title"
            eyebrow="Plans"
            tone="product"
            title="Pick the plan that fits your school"
            lead="Each plan lists what it includes. The table below shows which modules are available now and which are in development."
          />
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((p) => (
              <li key={p.id} className="relative">
                {p.recommended && (
                  <span className="absolute -top-3 left-5 z-10 rounded-full bg-tangerine px-3 py-1 text-xs font-bold text-slate">Most schools start here</span>
                )}
                <div
                  className={`flex h-full flex-col gap-4 rounded-3xl border bg-white p-6 ${p.recommended ? 'border-2 border-royal shadow-xl shadow-royal/10' : 'border-slate/10'}`}
                >
                  <div>
                    <h3 className="text-2xl font-extrabold text-slate">{p.name}</h3>
                    <p className="mt-1 text-sm text-slate/70">{p.forWhom}</p>
                  </div>
                  <p className="text-lg font-extrabold text-slate">{p.id === 'free' ? 'Free, no account needed' : 'Custom quote'}</p>
                  <ul className="flex flex-col gap-2">
                    {p.highlights.map((h) => (
                      <li key={h} className="flex items-start gap-2 text-sm text-slate">
                        <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-emerald" />
                        {h}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-auto text-sm text-slate/70">{`Support: ${p.support}`}</p>
                  <Button href={p.cta.href} variant={p.recommended ? 'secondary' : 'outline'} className="w-full">
                    {p.cta.label}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-sm text-slate/70">
            Running several schools or campuses?{' '}
            <Link href="/solutions/multi-school" className="font-semibold text-royal underline">
              See multi-school groups
            </Link>{' '}
            for a plan scoped to your group.
          </p>
        </Container>
      </section>

      <section id="compare" aria-labelledby="compare-title" className="scroll-mt-24 bg-off-white">
        <Container wide className="flex flex-col gap-6 py-16">
          <SectionHeading id="compare-title" eyebrow="Compare" tone="intelligence" title="Module by module" />
          <div className="relative min-w-0 max-w-full overflow-x-auto rounded-3xl border border-slate/10 bg-white" tabIndex={0} role="region" aria-labelledby="compare-title">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">Which modules each plan includes, and whether each module is available now</caption>
              <thead>
                <tr className="border-b border-slate/10">
                  <th scope="col" className="sticky left-0 bg-white px-4 py-3 font-bold text-slate">
                    Module
                  </th>
                  {plans.map((p) => (
                    <th key={p.id} scope="col" className="px-4 py-3 text-center font-bold text-slate">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {moduleRows.map((r) => (
                  <tr key={r.module} className="border-b border-slate/10 last:border-0">
                    <th scope="row" className="sticky left-0 bg-white px-4 py-3 font-semibold text-slate">
                      {r.module}
                      <span className={`ml-2 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${r.live ? tones.success.soft : tones.achievement.soft}`}>
                        {r.live ? 'Available now' : 'In development'}
                      </span>
                    </th>
                    {plans.map((p) => (
                      <td key={p.id} className="px-4 py-3 text-center">
                        <Mark on={r.in[p.id]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Container>
      </section>

      <section id="quote" aria-labelledby="quote-title" className="scroll-mt-24 bg-white">
        <Container wide className="grid grid-cols-1 gap-10 py-16 lg:grid-cols-5">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <SectionHeading
              id="quote-title"
              eyebrow="Custom quote"
              tone="action"
              title="Get a quote for your school"
              lead="Tell us your size and the modules you want. A real person prepares the quote and contacts you the way you choose."
            />
            <ul className="flex flex-col gap-2 text-sm text-slate">
              {['Priced for your number of students', 'Only the modules you need', 'WhatsApp costs shown at Meta’s current rate'].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <Icon name="check" className="h-4 w-4 text-emerald" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:col-span-3">
            <QuoteForm />
          </div>
        </Container>
      </section>

      <section aria-labelledby="pricing-faq-title" className="bg-off-white">
        <Container wide className="flex flex-col gap-6 py-16">
          <h2 id="pricing-faq-title" className="text-2xl font-extrabold text-slate">
            Frequently asked questions
          </h2>
          <FaqBlock items={faqs} />
        </Container>
      </section>

      <section aria-labelledby="pricing-cta-title" className="bg-midnight text-white">
        <Container wide className="flex flex-col items-start gap-4 py-14 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="pricing-cta-title" className="text-2xl font-extrabold">
              Rather talk it through?
            </h2>
            <p className="opacity-90">Message us on WhatsApp or book a demo with your own school’s questions.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button href={whatsappLink('Hi, I would like to know more about NetCyberAI pricing.')} variant="secondary">
              Ask on WhatsApp
            </Button>
            <Button href="/book-demo" variant="outlineLight">
              Book a demo
            </Button>
          </div>
        </Container>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.pricing)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(softwareApplicationJsonLd()) }} />
    </>
  );
}
