import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { AnswerFirst } from '@/components/content/AnswerFirst';
import { StepDiagram } from '@/components/content/StepDiagram';
import { FaqBlock } from '@/components/content/FaqBlock';
import { whatsappLink } from '@/lib/site-config';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';

export const metadata = buildMetadata(pageMeta.teacherImpact);

const steps = [
  {
    title: 'Real signals, not gut feel',
    body: 'Class attendance trend, syllabus completion, and parent feedback roll up into one card per teacher, per month.',
  },
  {
    title: 'Visible to exactly two people',
    body: 'The teacher sees their own card. Their principal sees it too. No other teacher, ever — enforced at the database level, not just hidden in the interface.',
  },
  {
    title: 'A conversation starter, not a verdict',
    body: 'The card is meant to open an honest one-to-one conversation between a principal and a teacher, not to rank staff against each other.',
  },
];

const faqs = [
  {
    question: 'Can other teachers see anyone else’s Impact Card?',
    answer:
      'No. Access is restricted to the teacher themselves and their principal or school admin, enforced by the database’s own row-level security — not only hidden in the app screen, which could be worked around.',
  },
  {
    question: 'Is this used to rank teachers against each other?',
    answer:
      'No public ranking exists, by design. There is no leaderboard, no percentile shown to staff, and no comparison surfaced to anyone outside the teacher and their principal.',
  },
  {
    question: 'What goes into the card?',
    answer:
      'Class-level signals a principal can already see in fragments elsewhere — attendance trend, syllabus completion percentage, and parent feedback — brought into one private view instead of scattered across registers.',
  },
  {
    question: 'Does salary or payroll data appear anywhere near this?',
    answer:
      'No. This schema carries no salary column at all — it is a structural decision, not a setting someone could accidentally turn on.',
  },
];

export default function TeacherImpactCardPage() {
  return (
    <Container className="flex flex-col gap-12 py-12">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-sapphire sm:text-3xl">
          Why Public Teacher Leaderboards Backfire — and What We Built Instead
        </h1>
        <AnswerFirst>
          A public teacher leaderboard turns colleagues into competitors and punishes teachers
          working with harder classes. The Teacher Impact Card gives a principal a real,
          private signal on teaching quality — visible only to that teacher and their principal,
          never published, never compared across staff.
        </AnswerFirst>
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate">Why we refuse to build a public leaderboard</h2>
        <p className="mt-4 text-sm text-slate">
          Ranking teachers publicly rewards the teacher who happens to have the strongest class,
          not the one doing the hardest work with a struggling one. It also invites gaming —
          inflating attendance, avoiding difficult students — instead of genuine improvement. A
          principal who wants an honest read on teaching quality needs a private conversation,
          not a scoreboard the staff room can see.
        </p>
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
          <li>It does not publish a leaderboard, ranking, or percentile visible to other staff.</li>
          <li>It does not include salary, payroll, or any compensation data.</li>
          <li>It does not let a teacher see any other teacher&rsquo;s card, under any role or query path.</li>
        </ul>
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate">Frequently asked questions</h2>
        <div className="mt-6">
          <FaqBlock items={faqs} />
        </div>
      </div>

      <div className="rounded-lg bg-sapphire p-8 text-off-white">
        <h2 className="text-xl font-bold">See the Teacher Impact Card on your own phone</h2>
        <p className="mt-2 text-off-white/90">
          Message us on WhatsApp for a walkthrough of how the card looks to a principal.
        </p>
        <div className="mt-4">
          <Button
            href={whatsappLink('Hi, I would like to see the Teacher Impact Card for my school.')}
            variant="secondary"
          >
            Book a demo
          </Button>
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.teacherImpact)) }}
      />
    </Container>
  );
}
