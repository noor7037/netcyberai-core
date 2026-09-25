import { Container } from '@/components/ui/Container';
import { LeadForm } from '@/components/marketing/LeadForm';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';
import { companyName } from '@/lib/site-config';

export const metadata = buildMetadata(pageMeta.getStarted);

export default function GetStartedPage() {
  return (
    <>
      <section className="bg-gradient-to-br from-sapphire via-sapphire to-azure">
        <Container className="flex flex-col gap-4 py-16 text-off-white">
          <h1 className="max-w-2xl text-3xl font-bold sm:text-4xl">Get started with {companyName}</h1>
          <p className="max-w-2xl text-lg text-off-white/90">
            Tell us about your school. Our team will reach out to walk through pricing, timelines, and what
            a real rollout looks like for your students, parents, and staff — no invented numbers, no
            automated sign-up, and no obligation to commit until every question is answered.
          </p>
        </Container>
      </section>
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
