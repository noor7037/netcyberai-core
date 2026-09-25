import { Container } from '@/components/ui/Container';
import { LeadForm } from '@/components/marketing/LeadForm';
import { PageHero } from '@/components/marketing/PageHero';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';
import { companyName } from '@/lib/site-config';

export const metadata = buildMetadata(pageMeta.getStarted);

export default function GetStartedPage() {
  return (
    <>
      <PageHero
        id="getstarted-title"
        eyebrow="Get started"
        tone="product"
        title={<>Get started with {companyName}</>}
        lead={
          <>
            Tell us about your school. Our team will reach out to walk through pricing, timelines, and what a real rollout looks like for your students, parents, and staff — no invented numbers, no automated sign-up, and no obligation to commit until every question is answered.
          </>
        }
      />
      <section className="bg-off-white">
        <Container className="py-12">
          <div className="mx-auto max-w-2xl">
            <LeadForm source="get_started" />
          </div>
        </Container>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.getStarted)) }}
      />
    </>
  );
}
