import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/visual/Primitives';
import { AppsSection, ModuleIndex, PrincipalSection } from '@/components/showcase/Sections';
import { CTASection } from '@/components/home/CTASection';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';

export const metadata = buildMetadata(pageMeta.productTour);

// The same demo system as the homepage (principal dashboard, teacher
// app, parent WhatsApp) plus the honest status of every module. Demo
// fixtures only, never the API.
export default function ProductTourPage() {
  return (
    <>
      <section aria-labelledby="tour-title" className="bg-off-white">
        <Container wide className="flex flex-col gap-4 py-10">
          <Eyebrow tone="trust">Product tour</Eyebrow>
          <h1 id="tour-title" className="max-w-3xl text-4xl font-extrabold tracking-tight text-slate sm:text-5xl">
            Explore NetCyberAI yourself
          </h1>
          <p className="max-w-3xl text-lg text-slate">
            This is a hands-on tour of NetCyberAI in a fictional demo school. Open any of the principal’s modules, try the
            teacher’s staff app and the parent’s WhatsApp menu, then check the list below to see which modules a school can
            use today and which are still being built.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button href="#principal-dashboard" variant="secondary">
              Start with the dashboard
            </Button>
            <Button href="#modules" variant="outline">
              See every module’s status
            </Button>
          </div>
        </Container>
      </section>
      <PrincipalSection />
      <AppsSection />
      <ModuleIndex />
      <CTASection />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.productTour)) }} />
    </>
  );
}
