import { Hero } from '@/components/home/Hero';
import { PrincipalSection, AppsSection } from '@/components/showcase/Sections';
import { WhyChoose } from '@/components/home/WhyChoose';
import { BeyondErp } from '@/components/home/BeyondErp';
import { TrustSecurity } from '@/components/home/TrustSecurity';
import { CTASection } from '@/components/home/CTASection';
import { Container } from '@/components/ui/Container';
import { FaqBlock } from '@/components/content/FaqBlock';
import { SectionHeading } from '@/components/visual/Primitives';
import { FamilySection } from '@/components/home/FamilySection';
import { HowItWorks } from '@/components/home/HowItWorks';
import { HOME_GO_LIVE_FAQ } from '@/content/faqs';
import { buildMetadata, pageMeta, serializeJsonLd, softwareApplicationJsonLd } from '@/lib/seo';
import { companyName } from '@/lib/site-config';

export const metadata = buildMetadata(pageMeta.home);

const faqs = [
  {
    question: `What is ${companyName}?`,
    answer: `${companyName} is one connected ecosystem for Indian schools and families. The School app serves principals, office staff and teachers on one validated school record, with honest daily updates for parents on WhatsApp. The ${companyName} Family app gives children an AI tutor, interactive study, spoken English, drawing and a look at their future, with a parent area. School Link joins the two when a family’s school uses ${companyName}.`,
  },
  {
    question: 'Do parents need to install an app?',
    answer:
      'Parents need no app for school updates: they arrive on WhatsApp. Families who want more for their child at home use the NetCyberAI Family app.',
  },
  {
    question: 'What is the NetCyberAI Family app?',
    answer:
      'The Family app is for a child and their parent: an AI tutor that explains in the child’s own language, interactive study chapters, a spoken-English course, a drawing studio, careers, entrance exams and scholarships, and a parent area for progress, consent switches and the child’s data. It runs on the web and as an Android app, and works for any family. If the child’s school uses NetCyberAI, School Link connects them with a one-time code from the school, so the family also sees that child’s attendance, homework, notices, marks and timetable. Ask us about Family plans.',
  },
  {
    question: 'Which modules are live today?',
    answer:
      'The status of every module is kept in one place and shown on the products and pricing pages, so it never drifts from the real product. WhatsApp messages to parents start once a school’s own WhatsApp number is switched on. The screens on this site show example data, and nothing is sold to a school as live until it is.',
  },
  {
    question: `What does ${companyName} cost?`,
    answer:
      'Free tools any school can use today, and Starter, Growth and Compass for the full platform, priced per enrolled student, monthly or yearly with two months free. Your first month is free, and larger schools and groups can agree their own price. See the pricing page for the numbers.',
  },
  HOME_GO_LIVE_FAQ,
];

export default function HomePage() {
  return (
    <>
      <Hero />
      <WhyChoose />
      <BeyondErp />
      <PrincipalSection />
      <FamilySection />
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
