import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { EyebrowOnDark, SectionHeading } from '@/components/visual/Primitives';
import { Icon } from '@/components/visual/Icons';
import { DashboardExplorer } from '@/components/explore/DashboardExplorer';
import { WhatsAppShowcase } from '@/components/home/WhatsAppShowcase';
import { CTASection } from '@/components/home/CTASection';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';

export const metadata = buildMetadata(pageMeta.productTour);

// The founder's two product references, made explorable: the school's
// dashboards (DashboardExplorer) and the parent's WhatsApp (the same
// WhatsAppShowcase as the homepage). Demo fixtures only, never the API.
export default function ProductTourPage() {
  return (
    <>
      <section aria-labelledby="tour-title" className="relative overflow-hidden bg-midnight text-white">
        <div aria-hidden="true" className="nca-mesh-dark absolute inset-0" />
        <div aria-hidden="true" className="nca-spectrum-bar absolute inset-x-0 top-0 h-1" />
        <Container wide className="relative flex flex-col gap-5 py-14">
          <EyebrowOnDark tone="intelligence">Product tour</EyebrowOnDark>
          <h1 id="tour-title" className="max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
            Explore NetCyberAI yourself
          </h1>
          <p className="max-w-3xl text-lg opacity-90">
            This is a hands-on tour of NetCyberAI in a fictional demo school. Switch between the principal, teacher and
            finance views, open any module from the sidebar, then scroll a parent’s WhatsApp to see the same school day
            from home. Nothing here is connected to a real school, so click anything.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button href="#school-side" variant="secondary">
              Start with the dashboard
            </Button>
            <Button href="#parent-side" variant="outlineLight">
              See the parent’s WhatsApp
            </Button>
          </div>
        </Container>
      </section>

      <section id="school-side" aria-labelledby="school-side-title" className="scroll-mt-20 bg-off-white">
        <Container wide className="flex flex-col gap-6 py-14">
          <SectionHeading
            id="school-side-title"
            eyebrow="The school’s side"
            tone="trust"
            title="One school record, a screen for every role"
            lead="Pick a role, then open any module. Quick actions on the principal’s dashboard jump straight to the module they belong to."
          />
          <DashboardExplorer />
          <p className="flex items-start gap-2 text-sm text-slate/70">
            <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-emerald" />
            <span>
              This tour shows the complete product. Some modules are available today and others are in development;{' '}
              <Link href="/pricing#compare" className="font-semibold text-royal underline">
                see which is which
              </Link>
              .
            </span>
          </p>
        </Container>
      </section>

      <div id="parent-side" className="scroll-mt-20">
        <WhatsAppShowcase />
      </div>

      <CTASection />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.productTour)) }} />
    </>
  );
}
