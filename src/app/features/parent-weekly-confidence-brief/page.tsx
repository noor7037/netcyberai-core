import { Container } from '@/components/ui/Container';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AnswerFirst } from '@/components/content/AnswerFirst';
import { StepDiagram } from '@/components/content/StepDiagram';
import { FaqBlock } from '@/components/content/FaqBlock';
import { whatsappLink } from '@/lib/site-config';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';

export const metadata = buildMetadata(pageMeta.weeklyBrief);

const steps = [
  {
    title: 'The week’s topics are gathered',
    body: 'Every subject’s syllabus progress for the week rolls up automatically from daily teacher entries.',
  },
  {
    title: 'Three questions are chosen',
    body: 'One per major subject area, phrased as something a parent could actually ask over dinner.',
  },
  {
    title: 'One message, once a week',
    body: 'Sent as a single WhatsApp message so a parent gets a real weekly picture, not a daily flood.',
  },
];

const faqs = [
  {
    question: 'How is this different from the Daily Learning Pulse?',
    answer:
      'The Daily Pulse is a same-day, single-topic update. The Weekly Confidence Brief looks back across the whole week and turns it into a small set of conversation starters, so a busy parent gets one useful message instead of reconstructing five days of updates themselves.',
  },
  {
    question: 'Is the example message on this page from a real school?',
    answer:
      'No — it is clearly labelled as an illustrative example. We do not publish outcome claims or data from any real school until a real, consented pilot exists.',
  },
  {
    question: 'What if a parent cannot read English well?',
    answer:
      'The brief is written in Hinglish by default — Hindi in Roman script — which is how the intended audience already reads WhatsApp messages day to day.',
  },
  {
    question: 'Does a parent have to respond every week?',
    answer:
      'No. The brief is informational. It does not track or score whether a parent replies, and no consequence for the child depends on a reply.',
  },
];

export default function WeeklyConfidenceBriefPage() {
  return (
    <Container className="flex flex-col gap-12 py-12">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-sapphire sm:text-3xl">
          The Weekly Confidence Brief: Three Dinner-Table Questions a Week
        </h1>
        <AnswerFirst>
          Once a week, parents get a single WhatsApp message with three simple questions to ask
          their child at home, based on what was actually covered in class that week. It turns
          five days of lessons into a real dinner-table conversation, without requiring a parent
          to read a report card or log into anything.
        </AnswerFirst>
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate">Illustrative example</h2>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate/70">
          Illustrative example — not a real school or a real student
        </p>
        <Card className="mt-4 border-amber/40 bg-amber/5">
          <p className="text-sm italic text-slate">
            &ldquo;Is hafte Class 6-B mein yeh hua: Science mein paudhon ka photosynthesis, Maths
            mein fractions, aur Hindi mein ek kahani padhi gayi. Ghar par poochiye: (1) Paudhe
            khana kaise banate hain? (2) Aadha aur chauthai mein kya farak hai? (3) Kahani ka sabse
            pasandida hissa kaun sa tha?&rdquo;
          </p>
        </Card>
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate">How it works</h2>
        <div className="mt-6">
          <StepDiagram steps={steps} />
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate">What it does not do</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate">
          <li>It does not publish or imply any real school’s or student’s data — the example above is illustrative only.</li>
          <li>It does not score or penalise a parent for not replying to the brief.</li>
          <li>It does not replace a report card or a parent-teacher meeting — it is a conversation prompt, not an assessment.</li>
        </ul>
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate">Frequently asked questions</h2>
        <div className="mt-6">
          <FaqBlock items={faqs} />
        </div>
      </div>

      <div className="rounded-lg bg-sapphire p-8 text-off-white">
        <h2 className="text-xl font-bold">See an example brief on your own phone</h2>
        <p className="mt-2 text-off-white/90">
          Message us on WhatsApp for a walkthrough of the Weekly Confidence Brief.
        </p>
        <div className="mt-4">
          <Button
            href={whatsappLink('Hi, I would like to see the Weekly Confidence Brief for my school.')}
            variant="secondary"
          >
            Book a demo
          </Button>
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.weeklyBrief)) }}
      />
    </Container>
  );
}
