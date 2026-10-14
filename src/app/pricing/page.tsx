import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { FaqBlock } from '@/components/content/FaqBlock';
import { EyebrowOnDark, SectionHeading } from '@/components/visual/Primitives';
import { SpotlightCard } from '@/components/visual/SpotlightCard';
import { Icon } from '@/components/visual/Icons';
import { QuoteForm } from '@/components/marketing/QuoteForm';
import { HowItWorks } from '@/components/home/HowItWorks';
import { PRICING_SETUP_FAQ } from '@/content/faqs';
import { AVAILABILITY_LABEL, moduleRows, plans, publishedClaims, type ModuleAvailability } from '@/content/pricing';
import { PlanCards } from '@/components/marketing/PlanCards';
import { tones } from '@/lib/semantic';
import { whatsappLink } from '@/lib/site-config';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd, softwareApplicationJsonLd } from '@/lib/seo';

export const metadata = buildMetadata(pageMeta.pricing);

// Commercial claims come only from src/content/pricing.ts, where each one
// carries a CONFIRMED / PROPOSED / GAP status; this page renders the
// confirmed ones only. Do not hardcode offers or prices here.

const faqs = [
  PRICING_SETUP_FAQ,
  {
    question: 'How is NetCyberAI pricing structured?',
    answer:
      'There are four plans. Free is a set of browser tools any school can use today without an account. Starter, Growth and Compass are priced per enrolled student, monthly or yearly, and each adds more of the product on top of the last. Yearly billing charges ten months for twelve.',
  },
  {
    question: 'Is there a free plan?',
    answer:
      'Yes. Every free tool is unlimited with no login: fee, attendance, capacity, timetable, marks, payroll and budget planners, and transfer, bonafide and character certificates, report cards and fee receipts. For the full platform, you get a complete SOP and free staff training, and your first month is free with full capabilities.',
  },
  {
    question: 'What drives WhatsApp messaging cost?',
    answer:
      'WhatsApp Business messaging is billed by Meta per message, separately from NetCyberAI’s own pricing. The rate depends on the message category and changes on Meta’s schedule, so we show you the current rate card when we quote rather than a fixed figure that could already be out of date.',
  },
  {
    question: 'Can the price be adjusted for our school?',
    answer:
      'Yes. Larger schools and school groups can agree a per-student price with us, add a module at no charge, or receive a discount. Whatever is agreed is recorded and written into your school’s agreement, so it never depends on anyone remembering a conversation.',
  },
  {
    question: 'Do fees paid by parents go through NetCyberAI?',
    answer:
      'No. Parents pay by UPI straight into your school’s own bank account, and the school confirms each payment against its bank before a receipt is issued. NetCyberAI never holds your fee money and takes no cut of it.',
  },
  {
    question: 'Is there a pilot for new schools?',
    answer:
      'Yes. Every new school starts in pilot mode with outbound WhatsApp messaging switched off, so nothing reaches a real parent until the school explicitly turns it on. That lets you, your staff and us confirm the data and messages look right first.',
  },
  {
    question: 'Which modules can we use today?',
    answer:
      'The table marks every module as available now, ready to start once your school’s WhatsApp is switched on, or in development. Available now: student records, imports, consent, attendance, homework, fees with UPI collection and receipts, staff leave with automatic cover, the principal dashboard and reports, complaints, Early Warning and the School Health Auditor. Ready with WhatsApp: parent messages, notices, the Daily Learning Pulse, meetings and events. In development: exams and report cards, Parent AI and the learning insights.',
  },
];

const BADGE: Record<ModuleAvailability, string> = {
  now: tones.success.soft,
  whatsapp: tones.communication.soft,
  building: tones.achievement.soft,
};

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
            Free tools any school can use today, and Starter, Growth and Compass for the full platform, priced per
            enrolled student, monthly or yearly with two months free. Your first month is free, and every school starts
            in pilot mode, so nothing reaches a parent before you are ready.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button href="#plans-title" variant="secondary">
              See the plans
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
            lead="Prices are per enrolled student. Each plan includes everything in the one before it, and the table below shows which modules you can use today."
          />
          <PlanCards plans={plans} />
          <p className="text-sm text-slate/70">
            Running several schools or campuses?{' '}
            <Link href="/solutions/multi-school" className="font-semibold text-royal underline">
              See multi-school groups
            </Link>{' '}
            for a plan scoped to your group. Larger schools and groups can agree a price, complimentary modules or a
            discount;{' '}
            <a href="#quote" className="font-semibold text-royal underline">
              ask for a quote
            </a>
            . WhatsApp messages are billed by Meta at its own rate, shown openly when we set you up.
          </p>
        </Container>
      </section>

      <HowItWorks id="pricing-steps" tint="off-white" />

      <section id="compare" aria-labelledby="compare-title" className="scroll-mt-24 bg-white">
        <Container wide className="flex flex-col gap-6 py-16">
          <SectionHeading id="compare-title" eyebrow="Compare" tone="intelligence" title="Module by module" />
          <div className="relative min-w-0 max-w-full overflow-x-auto rounded-3xl border border-slate/10 bg-white" tabIndex={0} role="region" aria-labelledby="compare-title">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">Which modules each plan includes, and whether each module is available now, ready to start with WhatsApp, or in development</caption>
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
                      <span className={`ml-2 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${BADGE[r.status]}`}>
                        {AVAILABILITY_LABEL[r.status]}
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

      <section id="quote" aria-labelledby="quote-title" className="scroll-mt-24 bg-off-white">
        <Container wide className="grid grid-cols-1 gap-10 py-16 lg:grid-cols-5">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <SectionHeading
              id="quote-title"
              eyebrow="Larger schools and groups"
              tone="action"
              title="Talk to us about your price"
              lead="Tell us your size and the modules you want. A real person replies with a price for your school and contacts you the way you choose."
            />
            <ul className="flex flex-col gap-2 text-sm text-slate">
              {['Priced for your number of students', 'Complimentary modules and discounts can be agreed', 'WhatsApp costs shown at Meta’s current rate'].map((t) => (
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

      <section aria-labelledby="pricing-faq-title" className="bg-white">
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
