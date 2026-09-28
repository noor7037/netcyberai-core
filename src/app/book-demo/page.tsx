import { FaqSection } from '@/components/content/FaqSection';
import { DEMO_FAQS } from '@/content/faqs';
import { HowItWorks } from '@/components/home/HowItWorks';
import { Container } from '@/components/ui/Container';
import { LeadForm } from '@/components/marketing/LeadForm';
import { PageHero } from '@/components/marketing/PageHero';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';
import { companyName } from '@/lib/site-config';

export const metadata = buildMetadata(pageMeta.bookDemo);

export default function BookDemoPage() {
  return (
    <>
      <PageHero
        id="bookdemo-title"
        eyebrow="Book a demo"
        tone="action"
        title={<>Book a demo of {companyName}</>}
        lead={
          <>
            Pick a preferred date and time, tell us what to cover, and we will confirm a real walkthrough with a member of our team — Principal, Teacher, and Parent views, walked through on a data model close to your own school, not a generic canned recording.
          </>
        }
      />
      <section className="bg-off-white">
        <Container className="py-12">
          <div className="mx-auto max-w-2xl">
            <LeadForm source="book_demo" />
          </div>
        </Container>
      </section>

      <HowItWorks id="book-demo-faq-steps" tint="white" ctas={false} />
      <FaqSection id="book-demo-faq" items={DEMO_FAQS} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.bookDemo)) }}
      />
    </>
  );
}
