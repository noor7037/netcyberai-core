import { Container } from '@/components/ui/Container';
import { DemoShell } from '@/components/demo/DemoShell';
import { FaqBlock } from '@/components/content/FaqBlock';
import { AnswerFirst } from '@/components/content/AnswerFirst';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';
import { companyName } from '@/lib/site-config';

export const metadata = buildMetadata(pageMeta.demo);

const faqs = [
  {
    question: 'Is this real school data?',
    answer:
      'No. Every name, student, fee figure, and message shown here is fictional, and the school itself — "Sunrise Public School" — does not exist. A persistent banner on every screen says so.',
  },
  {
    question: 'Can we get a live demo using our own school’s context?',
    answer:
      `Yes — message us on WhatsApp and we will walk through ${companyName} using your school’s actual size and needs, rather than only this fictional walkthrough.`,
  },
  {
    question: 'What can I actually try here?',
    answer:
      'You can switch between the Principal, Teacher, and Parent views and interact with them — mark attendance, flag a syllabus exception, and look through fee and recognition history — all using the same fictional Sunrise Public School data.',
  },
  {
    question: 'Does anything I do here get saved or sent?',
    answer:
      'No. This is a read-only concept walkthrough. No interaction here saves data anywhere, sends a real WhatsApp message, or processes a real payment — by construction, because this walkthrough is not connected to any messaging or payment system.',
  },
  {
    question: 'How is this different from a real school’s deployment?',
    answer:
      'A real deployment uses a school’s own students, staff, and fee data behind a login, with role-based access enforced at the database level. This demo uses fixed fictional data, has no login, and has no backend at all.',
  },
];

export default function DemoPage() {
  return (
    <Container className="flex flex-col gap-12 py-8">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-sapphire sm:text-3xl">Concept Demo</h1>
        <AnswerFirst>
          This is a clickable concept demo of {companyName}, built around a fictional school
          called Sunrise Public School so you can try the Principal, Teacher, and Parent views
          without a real login. Switch roles below to see attendance marking, fee status, and
          Hinglish WhatsApp updates as they would actually appear — nothing here is saved,
          sent, or real.
        </AnswerFirst>
      </div>

      <DemoShell />

      <div>
        <h2 className="text-lg font-bold text-slate">Frequently asked questions</h2>
        <div className="mt-6">
          <FaqBlock items={faqs} />
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.demo)) }}
      />
    </Container>
  );
}
