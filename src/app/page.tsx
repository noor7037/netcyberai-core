import { Hero } from '@/components/home/Hero';
import { LiveEcosystem } from '@/components/home/LiveEcosystem';
import { ManualToConnected } from '@/components/home/ManualToConnected';
import { RoleExplorer } from '@/components/home/RoleExplorer';
import { DayInside } from '@/components/home/DayInside';
import { ProductShowcase } from '@/components/home/ProductShowcase';
import { OperationsFlows } from '@/components/home/OperationsFlows';
import { GapDetection } from '@/components/home/GapDetection';
import { WhatsAppShowcase } from '@/components/home/WhatsAppShowcase';
import { PersonalBestJourney } from '@/components/home/PersonalBestJourney';
import { OutcomeDashboard } from '@/components/home/OutcomeDashboard';
import { TrustSecurity } from '@/components/home/TrustSecurity';
import { CTASection } from '@/components/home/CTASection';
import { Container } from '@/components/ui/Container';
import { FaqBlock } from '@/components/content/FaqBlock';
import { SectionHeading } from '@/components/visual/Primitives';
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
      'Pricing is not fixed yet. There are three tiers, Starter, Growth and Campus, scoped to a school’s size and needs; request pricing and we will quote for your school specifically.',
  },
];

export default function HomePage() {
  return (
    <>
      <Hero />
      <WhatsAppShowcase />
      <LiveEcosystem />
      <ManualToConnected />
      <RoleExplorer />
      <DayInside />
      <ProductShowcase />
      <OperationsFlows />
      <GapDetection />
      <PersonalBestJourney />
      <OutcomeDashboard />
      <TrustSecurity />

      <section aria-labelledby="faq-title" className="bg-off-white">
        <Container className="flex flex-col gap-8 py-20">
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
