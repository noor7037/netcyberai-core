import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { EyebrowOnDark, SectionHeading } from '@/components/visual/Primitives';
import { CatalogGrid } from '@/components/catalog/CatalogGrid';
import { RoleExplorer } from '@/components/home/RoleExplorer';
import { CTASection } from '@/components/home/CTASection';
import { solutions } from '@/content/catalog';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';

export const metadata = buildMetadata(pageMeta.solutions);

const ROLE_SLUGS = ['principal', 'school-admin', 'teacher', 'finance', 'admissions'];

export default function SolutionsPage() {
  return (
    <>
      <section aria-labelledby="solutions-title" className="relative overflow-hidden bg-midnight text-white">
        <div aria-hidden="true" className="nca-mesh-dark absolute inset-0" />
        <div aria-hidden="true" className="nca-spectrum-bar absolute inset-x-0 top-0 h-1" />
        <Container wide className="relative flex flex-col gap-5 py-16">
          <EyebrowOnDark tone="action">Solutions</EyebrowOnDark>
          <h1 id="solutions-title" className="max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
            Built around who actually uses it
          </h1>
          <p className="max-w-3xl text-lg opacity-90">
            The same platform, shaped around each real role&apos;s own daily reality — not one generic dashboard for
            everyone. A principal, a school admin, a teacher, and a finance lead each open NetCyberAI to a different
            first screen, built around what that person actually needs to do that day.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button href="/book-demo" variant="secondary">
              Book a demo
            </Button>
            <Button href="/start-pilot" variant="outlineLight">
              Start a pilot
            </Button>
          </div>
        </Container>
      </section>
      <section className="bg-off-white">
        <Container wide className="flex flex-col gap-12 py-16">
          <div className="flex flex-col gap-6">
            <SectionHeading eyebrow="By role" tone="product" title="For each person in the school" />
            <CatalogGrid pages={solutions.filter((s) => ROLE_SLUGS.includes(s.slug))} base="/solutions" />
          </div>
          <div className="flex flex-col gap-6">
            <SectionHeading eyebrow="By school type" tone="achievement" title="For the kind of school you run" />
            <CatalogGrid pages={solutions.filter((s) => !ROLE_SLUGS.includes(s.slug))} base="/solutions" />
          </div>
        </Container>
      </section>
      <RoleExplorer />
      <CTASection />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.solutions)) }} />
    </>
  );
}
