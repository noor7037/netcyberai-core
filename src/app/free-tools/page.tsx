import { FaqSection } from '@/components/content/FaqSection';
import { FREE_TOOLS_FAQS } from '@/content/faqs';
import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { EyebrowOnDark } from '@/components/visual/Primitives';
import { SpotlightCard } from '@/components/visual/SpotlightCard';
import { Icon } from '@/components/visual/Icons';
import { TrialCta } from '@/components/free-tools/TrialCta';
import { FREE_TOOLS_UPDATED, KIND_LABELS, toolsOfKind, type FreeToolKind } from '@/content/free-tools';
import { tones } from '@/lib/semantic';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';

export const metadata = buildMetadata(pageMeta.freeTools);

const ORDER: FreeToolKind[] = ['decision', 'certificate', 'data'];

export default function FreeToolsPage() {
  return (
    <>
      <section aria-labelledby="free-tools-title" className="relative overflow-hidden bg-midnight text-white">
        <div aria-hidden="true" className="nca-mesh-dark absolute inset-0" />
        <div aria-hidden="true" className="nca-spectrum-bar absolute inset-x-0 top-0 h-1" />
        <Container wide className="relative flex flex-col gap-5 py-16">
          <EyebrowOnDark tone="success">Free tools</EyebrowOnDark>
          <h1 id="free-tools-title" className="max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
            Free tools for the decisions schools make every term
          </h1>
          <p className="max-w-3xl text-lg opacity-90">
            Plan fees and collections, rescue attendance before exams, size classrooms and sections, check timetables, analyse marks, budget payroll and
            running costs, and print transfer, bonafide and character certificates, report cards and fee receipts. Every tool runs in your browser, needs
            no login and ends in a printable PDF.
          </p>
          <ul className="flex flex-wrap gap-2 text-sm font-semibold">
            <li className="inline-flex items-center gap-2 rounded-full border border-white/25 px-3 py-1">
              <Icon name="lock" className="h-4 w-4" /> Nothing you type is sent to us
            </li>
            <li className="inline-flex items-center gap-2 rounded-full border border-white/25 px-3 py-1">
              <Icon name="chat" className="h-4 w-4" /> English and Hinglish
            </li>
            <li className="inline-flex items-center gap-2 rounded-full border border-white/25 px-3 py-1">Last updated {FREE_TOOLS_UPDATED}</li>
          </ul>
        </Container>
      </section>

      {ORDER.map((kind, i) => (
        <section key={kind} aria-labelledby={`kind-${kind}`} className={i % 2 ? 'bg-white' : 'bg-off-white'}>
          <Container wide className="flex flex-col gap-6 py-14">
            <div className="flex flex-col gap-1">
              <h2 id={`kind-${kind}`} className="text-2xl font-extrabold text-slate sm:text-3xl">
                {KIND_LABELS[kind].title}
              </h2>
              <p className="text-slate/70">{KIND_LABELS[kind].blurb}</p>
            </div>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {toolsOfKind(kind).map((t) => (
                <li key={t.slug}>
                  <Link
                    href={`/free-tools/${t.slug}`}
                    className="block h-full rounded-3xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
                  >
                    <SpotlightCard className="flex h-full flex-col gap-3 rounded-3xl border border-slate/10 bg-white p-6">
                      <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tones[t.tone].solid}`}>
                        <Icon name={t.icon} className="h-6 w-6" />
                      </span>
                      <span className="text-xl font-extrabold text-slate">{t.name}</span>
                      <span className="text-slate/70">{t.menuBlurb}</span>
                      <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-bold text-royal">
                        Open the tool <Icon name="arrow" className="h-4 w-4" />
                      </span>
                    </SpotlightCard>
                  </Link>
                </li>
              ))}
            </ul>
          </Container>
        </section>
      ))}

      <section className="bg-white">
        <Container wide className="py-14">
          <TrialCta />
        </Container>
      </section>
      <FaqSection id="free-tools-faq" items={FREE_TOOLS_FAQS} />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.freeTools)) }} />
    </>
  );
}
