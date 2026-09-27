import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { EyebrowOnDark } from '@/components/visual/Primitives';
import { SpotlightCard } from '@/components/visual/SpotlightCard';
import { Icon } from '@/components/visual/Icons';
import { CTASection } from '@/components/home/CTASection';
import { freeTools } from '@/content/free-tools';
import { tones } from '@/lib/semantic';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';

export const metadata = buildMetadata(pageMeta.freeTools);

export default function FreeToolsPage() {
  return (
    <>
      <section aria-labelledby="free-tools-title" className="relative overflow-hidden bg-midnight text-white">
        <div aria-hidden="true" className="nca-mesh-dark absolute inset-0" />
        <div aria-hidden="true" className="nca-spectrum-bar absolute inset-x-0 top-0 h-1" />
        <Container wide className="relative flex flex-col gap-5 py-16">
          <EyebrowOnDark tone="success">Free tools</EyebrowOnDark>
          <h1 id="free-tools-title" className="max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
            Free tools for everyday school work
          </h1>
          <p className="max-w-3xl text-lg opacity-90">
            These free tools help with jobs every school office already does: checking a student list before moving it,
            working out attendance targets, and writing polite fee reminders and parent updates in English and Hinglish.
            They run in your browser, need no sign-up, and nothing you type is sent to us.
          </p>
        </Container>
      </section>
      <section className="bg-off-white">
        <Container wide className="py-16">
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {freeTools.map((t) => (
              <li key={t.slug}>
                <Link
                  href={`/free-tools/${t.slug}`}
                  className="block h-full rounded-3xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
                >
                  <SpotlightCard className="flex h-full flex-col gap-3 rounded-3xl border border-slate/10 bg-white p-6">
                    <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tones[t.tone].solid}`}>
                      <Icon name={t.icon} className="h-6 w-6" />
                    </span>
                    <p className="text-xl font-extrabold text-slate">{t.name}</p>
                    <p className="text-slate/70">{t.menuBlurb}</p>
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
      <CTASection />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.freeTools)) }} />
    </>
  );
}
