import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { EyebrowOnDark } from '@/components/visual/Primitives';
import { Icon } from '@/components/visual/Icons';
import { AttendanceCalculatorTool } from '@/components/free-tools/AttendanceCalculatorTool';
import { DailyPulseTool } from '@/components/free-tools/DailyPulseTool';
import { FeeReminderTool } from '@/components/free-tools/FeeReminderTool';
import { ImportCheckerTool } from '@/components/free-tools/ImportCheckerTool';
import { findFreeTool, freeTools, type FreeToolSlug } from '@/content/free-tools';
import { breadcrumbListJsonLd, buildMetadata, serializeJsonLd } from '@/lib/seo';

export function generateStaticParams() {
  return freeTools.map((t) => ({ slug: t.slug }));
}

export const dynamicParams = false;

export function generateMetadata({ params }: { params: { slug: string } }) {
  const t = findFreeTool(params.slug);
  if (!t) return {};
  return buildMetadata({ path: `/free-tools/${t.slug}`, title: t.title, description: t.description });
}

const TOOL: Record<FreeToolSlug, () => JSX.Element> = {
  'student-import-checker': () => <ImportCheckerTool />,
  'attendance-calculator': () => <AttendanceCalculatorTool />,
  'fee-reminder-message': () => <FeeReminderTool />,
  'daily-pulse-message': () => <DailyPulseTool />,
};

// How NetCyberAI does the same job inside the product, and where to read more.
const IN_PRODUCT: Record<FreeToolSlug, { text: string; href: string; cta: string }> = {
  'student-import-checker': {
    text: 'In NetCyberAI, the same checks run when a school imports its list: every valid row is saved in one step, and every problem row is reported back instead of silently dropped.',
    href: '/products/school-management',
    cta: 'See School Management',
  },
  'attendance-calculator': {
    text: 'In NetCyberAI, attendance is marked once by the class teacher, and students drifting towards the target line show up for the principal early, with an owner assigned.',
    href: '/products/attendance-safety',
    cta: 'See Attendance & Safety',
  },
  'fee-reminder-message': {
    text: 'NetCyberAI is built so reminders go to one family at a time on WhatsApp, and the receipt and fee record follow from the payment itself. Ask us which parts are live for your school today.',
    href: '/products/fees-billing',
    cta: 'See Fees & Billing',
  },
  'daily-pulse-message': {
    text: 'NetCyberAI is built so this update comes from what teachers mark as taught, goes only to parents who agreed, and every reply is counted for the class teacher. Ask us which parts are live for your school today.',
    href: '/products/parent-engagement',
    cta: 'See Parent Engagement',
  },
};

export default function FreeToolPage({ params }: { params: { slug: string } }) {
  const t = findFreeTool(params.slug);
  if (!t) notFound();
  const more = IN_PRODUCT[t.slug];
  return (
    <>
      <section aria-labelledby="tool-title" className="relative overflow-hidden bg-midnight text-white">
        <div aria-hidden="true" className="nca-mesh-dark absolute inset-0" />
        <div aria-hidden="true" className="nca-spectrum-bar absolute inset-x-0 top-0 h-1" />
        <Container wide className="relative flex flex-col gap-5 py-14">
          <EyebrowOnDark tone={t.tone}>Free tool</EyebrowOnDark>
          <h1 id="tool-title" className="max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
            {t.name}
          </h1>
          <p className="max-w-3xl text-lg opacity-90">{t.heroLead}</p>
          <p className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 px-3 py-1 text-sm font-semibold opacity-90">
            <Icon name="lock" className="h-4 w-4" /> Free, no sign-up, runs in your browser
          </p>
        </Container>
      </section>

      <section aria-label={t.name} className="bg-off-white">
        <Container wide className="py-12">{TOOL[t.slug]()}</Container>
      </section>

      <section aria-labelledby="tool-more-title" className="bg-white">
        <Container wide className="flex flex-col gap-6 py-14 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex max-w-2xl flex-col gap-2">
            <h2 id="tool-more-title" className="text-2xl font-extrabold text-slate">
              How NetCyberAI does this for you
            </h2>
            <p className="text-slate/70">{more.text}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button href={more.href} variant="outline">
              {more.cta}
            </Button>
            <Button href="/book-demo" variant="secondary">
              Book a demo
            </Button>
          </div>
        </Container>
      </section>

      <section aria-labelledby="other-tools-title" className="bg-off-white">
        <Container wide className="flex flex-col gap-4 py-12">
          <h2 id="other-tools-title" className="text-lg font-extrabold text-slate">
            Other free tools
          </h2>
          <ul className="flex flex-wrap gap-2">
            {freeTools
              .filter((o) => o.slug !== t.slug)
              .map((o) => (
                <li key={o.slug}>
                  <Link
                    href={`/free-tools/${o.slug}`}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-slate shadow-sm hover:text-royal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
                  >
                    <Icon name={o.icon} className="h-4 w-4" /> {o.name}
                  </Link>
                </li>
              ))}
          </ul>
        </Container>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd({ path: `/free-tools/${t.slug}`, title: t.name })) }}
      />
    </>
  );
}
