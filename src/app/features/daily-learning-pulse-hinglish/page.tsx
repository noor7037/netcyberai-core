import { Container } from '@/components/ui/Container';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AnswerFirst } from '@/components/content/AnswerFirst';
import { StepDiagram } from '@/components/content/StepDiagram';
import { FaqBlock } from '@/components/content/FaqBlock';
import { whatsappLink } from '@/lib/site-config';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';

export const metadata = buildMetadata(pageMeta.dailyPulse);

const steps = [
  {
    title: 'Teacher flags the day’s topic',
    body: 'One tap after class: topic taught, or delayed / partial / not taught if the lesson did not go as planned.',
  },
  {
    title: 'A Hinglish message is composed',
    body: 'A deterministic template fills in the class, subject, topic, and one home question — the same wording every time, correctly.',
  },
  {
    title: 'Parents get it the same evening',
    body: 'One WhatsApp message, no app, no login — readable by a parent who is more comfortable in Hindi than English.',
  },
];

const exceptionStates = [
  {
    label: 'Taught',
    example:
      '"Aaj Class 8-A mein Science ka topic tha ‘Photosynthesis’. Ghar par poochiye: paudhe khana kaise banate hain?"',
  },
  {
    label: 'Delayed',
    example:
      '"Aaj Class 8-A mein Science ka period nahi ho paaya (teacher training). Kal cover hoga."',
  },
  {
    label: 'Partial',
    example:
      '"Aaj Class 8-A mein Science ka topic ‘Photosynthesis’ shuru hua, poora nahi hua. Kal continue hoga."',
  },
  {
    label: 'Not taught',
    example: '"Aaj Class 8-A mein Science ka period cancel raha (school event). Koi topic nahi padhaya gaya."',
  },
];

const faqs = [
  {
    question: 'What language is the message sent in?',
    answer:
      'Hinglish — Hindi written in Roman script, which reads naturally to most parents across Indian schools, in mixed English/Hindi households, without needing a Devanagari keyboard or font.',
  },
  {
    question: 'Is the message written by an AI, and can it be wrong?',
    answer:
      'The default Pulse message is a deterministic template, not an AI-generated sentence — it fills in real data (class, subject, topic, exception state) the same correct way every time, at no risk of an AI inventing wording.',
  },
  {
    question: 'What if the teacher does not mark anything for the day?',
    answer:
      'No Pulse is sent for that class that day rather than sending a guessed or default message. Silence is preferred over a wrong claim.',
  },
  {
    question: 'Can the Pulse ever say a topic was taught when it was not?',
    answer:
      'No. If a teacher flags a topic as delayed, partial, or not taught, the message reflects that exact state. The system never sends a comprehension question about a lesson that did not happen.',
  },
  {
    question: 'Do parents have to reply?',
    answer:
      'No reply is required to receive the daily Pulse. An optional three-tap comprehension check exists as a separate, later capability and never affects anything the child receives.',
  },
];

export default function DailyLearningPulsePage() {
  return (
    <Container className="flex flex-col gap-12 py-12">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-sapphire sm:text-3xl">
          Daily Learning Pulse: A Hinglish WhatsApp Update, Every School Day
        </h1>
        <AnswerFirst>
          The Daily Learning Pulse sends parents a short Hinglish WhatsApp message about what
          their child&rsquo;s class covered that day, with one home question to ask at dinner.
          If a lesson was delayed, partial, or not taught, the message says so honestly instead
          of claiming a topic was covered when it was not.
        </AnswerFirst>
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate">How it works</h2>
        <div className="mt-6">
          <StepDiagram steps={steps} />
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate">The four exception states</h2>
        <p className="mt-2 text-sm text-slate">
          Every Pulse reflects what actually happened in class that day. Here is the same class
          and topic, worded honestly under each state:
        </p>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {exceptionStates.map((state) => (
            <Card key={state.label}>
              <span className="inline-block rounded bg-emerald/15 px-2 py-0.5 text-slate text-sm font-semibold">{state.label}</span>
              <p className="mt-2 text-sm italic text-slate">{state.example}</p>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate">What it does not do</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate">
          <li>It does not claim a topic was taught when a teacher marked it delayed, partial, or not taught.</li>
          <li>It does not send a comprehension question about a lesson that did not happen.</li>
          <li>It does not require a parent to install an app or create a login.</li>
          <li>It does not use an AI to write the daily message by default — the wording is a fixed, checked template.</li>
        </ul>
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate">Frequently asked questions</h2>
        <div className="mt-6">
          <FaqBlock items={faqs} />
        </div>
      </div>

      <div className="rounded-lg bg-sapphire p-8 text-off-white">
        <h2 className="text-xl font-bold">See a real Pulse message on your own phone</h2>
        <p className="mt-2 text-off-white/90">
          Message us on WhatsApp for a walkthrough of the Daily Learning Pulse.
        </p>
        <div className="mt-4">
          <Button
            href={whatsappLink('Hi, I would like to see the Daily Learning Pulse for my school.')}
            variant="secondary"
          >
            Book a demo
          </Button>
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.dailyPulse)) }}
      />
    </Container>
  );
}
