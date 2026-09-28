import { FaqSection } from '@/components/content/FaqSection';
import { PILOT_FAQS } from '@/content/faqs';
import { Container } from '@/components/ui/Container';
import { PageHero } from '@/components/marketing/PageHero';
import { LeadForm } from '@/components/marketing/LeadForm';
import { SectionHeading } from '@/components/visual/Primitives';
import { FlowStepper, type Step } from '@/components/visual/FlowStepper';
import { Icon, type IconName } from '@/components/visual/Icons';
import { tones, type Tone } from '@/lib/semantic';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';

export const metadata = buildMetadata(pageMeta.startPilot);

// Each step maps to a mechanism that exists in the product today:
// leads intake, the validate-then-commit CSV import (src/lib/import/run-import.ts), the pending_consent default,
// and the WhatsApp send-gate's pilot_allow_outbound (false for every
// new school, see src/lib/whatsapp/gate.ts).
const PILOT_STEPS: Step[] = [
  { title: 'Agree the scope', detail: 'Which classes, which modules, and what the pilot should prove.' },
  { title: 'Import and check', detail: 'Every row is validated first; invalid rows are reported, never saved.' },
  { title: 'Record consent', detail: 'Students stay in pending consent until a guardian’s consent is recorded.' },
  { title: 'Switch on WhatsApp', detail: 'Outbound messages start off for every school and are enabled deliberately.' },
  { title: 'Review together', detail: 'Look at what changed, then decide whether to roll out further.' },
];
const STEP_TONES: Tone[] = ['trust', 'product', 'success', 'communication', 'achievement'];
const STEP_ICONS: IconName[] = ['users', 'check', 'shield', 'chat', 'chart'];

const GUARDRAILS: { title: string; body: string; icon: IconName; tone: Tone }[] = [
  {
    title: 'Nothing sends by surprise',
    body: 'Every new school starts with outbound WhatsApp blocked at a single send-gate. It is switched on only when you are ready.',
    icon: 'lock',
    tone: 'trust',
  },
  {
    title: 'No app for parents to install',
    body: 'Parents receive updates on WhatsApp, which they already use. There is nothing to download.',
    icon: 'parent',
    tone: 'communication',
  },
  {
    title: 'Your school stays separate',
    body: 'Each school’s records are isolated by row-level security in the database, from the first import.',
    icon: 'shield',
    tone: 'success',
  },
  {
    title: 'You decide what comes next',
    body: 'A pilot is not a contract to roll out everywhere. You see the results before anything widens.',
    icon: 'check',
    tone: 'action',
  },
];

export default function StartPilotPage() {
  return (
    <>
      <PageHero
        id="pilot-title"
        eyebrow="Start a pilot"
        tone="success"
        title="Try NetCyberAI with a few classes first"
        lead={
          <>
            A NetCyberAI pilot lets your school try the platform with a small group of classes before any wider
            rollout. Your records are imported and checked first, consent is recorded before anything reaches a
            parent, and outbound WhatsApp stays switched off until you decide it is ready. A real person guides
            every step.
          </>
        }
      />

      <section aria-labelledby="pilot-steps-title" className="bg-off-white">
        <Container wide className="flex flex-col gap-8 py-16">
          <SectionHeading id="pilot-steps-title" eyebrow="How a pilot runs" tone="product" title="Five steps, in this order" />
          <FlowStepper steps={PILOT_STEPS} tones={STEP_TONES} icons={STEP_ICONS} />
        </Container>
      </section>

      <section aria-labelledby="pilot-guardrails-title" className="bg-white">
        <Container wide className="flex flex-col gap-8 py-16">
          <SectionHeading id="pilot-guardrails-title" eyebrow="Guardrails" tone="trust" title="What stays safe during a pilot" />
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {GUARDRAILS.map((g) => (
              <li key={g.title} className="flex gap-4 rounded-3xl border border-slate/10 bg-off-white p-5">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tones[g.tone].solid}`}>
                  <Icon name={g.icon} className="h-5 w-5" />
                </span>
                <span className="flex flex-col gap-1">
                  <span className="font-extrabold text-slate">{g.title}</span>
                  <span className="text-sm text-slate/70">{g.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section aria-labelledby="pilot-form-title" className="bg-off-white">
        <Container wide className="grid grid-cols-1 gap-10 py-16 lg:grid-cols-5">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <SectionHeading
              id="pilot-form-title"
              eyebrow="Request a pilot"
              tone="action"
              title="Tell us about your school"
              lead="We reply to agree the scope with you. Submitting this form does not start anything automatically."
            />
          </div>
          <div className="lg:col-span-3">
            <LeadForm source="start_pilot" />
          </div>
        </Container>
      </section>

      <FaqSection id="pilot-faq" items={PILOT_FAQS} />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.startPilot)) }} />
    </>
  );
}
