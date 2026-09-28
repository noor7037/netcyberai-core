import { Hero } from '@/components/home/Hero';
import { PrincipalSection, AppsSection } from '@/components/showcase/Sections';
import { WhyChoose } from '@/components/home/WhyChoose';
import { TrustSecurity } from '@/components/home/TrustSecurity';
import { CTASection } from '@/components/home/CTASection';
import { Container } from '@/components/ui/Container';
import { FaqBlock } from '@/components/content/FaqBlock';
import { SectionHeading } from '@/components/visual/Primitives';
import { HowItWorks } from '@/components/home/HowItWorks';
import { HOME_GO_LIVE_FAQ } from '@/content/faqs';
import { buildMetadata, pageMeta, serializeJsonLd, softwareApplicationJsonLd } from '@/lib/seo';
import { companyName } from '@/lib/site-config';

export const metadata = buildMetadata(pageMeta.home);

const faqs = [
  {
    question: `What is ${companyName}?`,
    answer: `${companyName} is a connected school platform for Indian schools. Principals, office staff, teachers, students and parents work from one validated school record, parents get honest daily updates on WhatsApp, and the principal sees school health and open exceptions in one dashboard.`,
  },
  {
    question: 'Do parents need to install an app?',
    answer:
      'No. NetCyberAI is built so every parent-facing update, from attendance alerts to the Daily Learning Pulse, fee reminders and recognition, arrives on WhatsApp, which parents already use. Parents never need an app or a login.',
  },
  {
    question: 'Which modules are live today?',
    answer:
      'Live today: student records and CSV import, guardians and consent, attendance with absence alerts on WhatsApp, document scanning, QR ID cards, and staff sign-in for one or several schools. In development: the Daily Learning Pulse, fees and receipts, exams and Personal Best, and certificates. The screens on this site use a fictional demo school, and nothing is sold to a school as live until it is.',
  },
  {
    question: 'Does it rank teachers or students publicly?',
    answer:
      'No. Teachers get a private Impact Card visible only to them and their principal. Students are recognised mainly for Personal Bests against their own past; class top-3 lists are optional and off by default.',
  },
  {
    question: `What does ${companyName} cost?`,
    answer:
      'There are four plans: Free tools any school can use today, and Starter, Growth and Compass for the full platform. Each school gets a custom quote based on its size and the modules it needs, confirmed by a real person.',
  },
  HOME_GO_LIVE_FAQ,
];

export default function HomePage() {
  return (
    <>
      <Hero />
      <WhyChoose />
      <PrincipalSection />
      <AppsSection withParent={false} />
      <TrustSecurity />
      <HowItWorks />

      <section aria-labelledby="faq-title" className="bg-off-white">
        <Container className="flex flex-col gap-6 py-12">
          <SectionHeading id="faq-title" eyebrow="Questions" tone="product" title="Frequently asked questions" />
          <FaqBlock items={faqs} />
        </Container>
      </section>

      <CTASection />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(softwareApplicationJsonLd()) }}
      />
    </>
  );
}
