import Link from 'next/link';
import { FaqSection } from '@/components/content/FaqSection';
import { GET_STARTED_FAQS } from '@/content/faqs';
import { HowItWorks } from '@/components/home/HowItWorks';
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
            <p className="mb-6 rounded-lg border border-sapphire/20 bg-white p-4 text-slate">
              Ready to set up your school’s account?{' '}
              <Link href="/register-school" className="font-semibold text-royal underline">
                Register your school
              </Link>
              . Our team reviews every application and emails the principal an invitation.
            </p>
            <LeadForm source="get_started" />
          </div>
        </Container>
      </section>

      <HowItWorks id="get-started-faq-steps" tint="white" ctas={false} />
      <FaqSection id="get-started-faq" items={GET_STARTED_FAQS} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.getStarted)) }}
      />
    </>
  );
}
