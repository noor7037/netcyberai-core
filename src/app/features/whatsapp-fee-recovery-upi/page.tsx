import { Container } from '@/components/ui/Container';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AnswerFirst } from '@/components/content/AnswerFirst';
import { StepDiagram } from '@/components/content/StepDiagram';
import { FaqBlock } from '@/components/content/FaqBlock';
import { companyName, whatsappLink } from '@/lib/site-config';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';

export const metadata = buildMetadata(pageMeta.feeRecovery);

const sequence = [
  {
    label: 'D-3',
    title: 'Advance reminder',
    body: 'A gentle WhatsApp message reminds the parent that a fee is due in three days, with the amount and a UPI link.',
  },
  {
    label: 'D-Day',
    title: 'Due date notice',
    body: 'On the due date, the parent gets the same link again, so paying takes one tap from inside WhatsApp.',
  },
  {
    label: 'D+2',
    title: 'Follow-up',
    body: 'If unpaid, a follow-up message goes out two days later. No penalty language — just a reminder and the link.',
  },
  {
    label: 'D+7',
    title: 'Escalation to staff',
    body: 'If still unpaid a week later, the accountant or principal sees it on their own dashboard for a human follow-up call.',
  },
];

const steps = [
  {
    title: 'The school sets the fee structure',
    body: 'Amounts, due dates, and any concessions are entered once per class per academic year.',
  },
  {
    title: 'Reminders go out automatically',
    body: 'The D-3 to D+7 sequence runs on its own, in the parent’s own language, with a UPI link attached.',
  },
  {
    title: 'Payments update the ledger instantly',
    body: 'A payment through the link — or one recorded in cash by the school — updates the fee status and sends a receipt.',
  },
];

const faqs = [
  {
    question: 'Does this replace our existing accounting software?',
    answer:
      'No. It sits alongside it, handling parent-facing reminders, UPI payment links, and receipts. Your existing books of account are unaffected.',
  },
  {
    question: 'What happens if a parent pays in cash at the school office?',
    answer:
      'The accountant records it against the same ledger line. The fee status updates from the actual payment record, never from a reminder being sent or a payment page being opened.',
  },
  {
    question: 'Can we set different fee amounts for siblings or scholarship students?',
    answer:
      'Yes. Concessions are recorded per student with a reason and an approving staff member, so every discount is explicit and auditable rather than a silent adjustment.',
  },
  {
    question: 'Is a message sent every single day until the fee is paid?',
    answer:
      'No. The sequence is four touchpoints — D-3, D-Day, D+2, D+7 — not a daily nag. After D+7 it becomes a human follow-up, not an automated message.',
  },
  {
    question: 'What does WhatsApp messaging cost per school?',
    answer:
      'WhatsApp charges Meta’s own per-message rate, which varies by message category and changes periodically — most recently with a new rate card effective 1 July 2026. We do not quote a fixed rupee figure here because doing so without checking Meta’s live rate card at the time you read this would risk being wrong. See "What it does not do" below.',
  },
];

export default function WhatsappFeeRecoveryPage() {
  return (
    <Container className="flex flex-col gap-12 py-12">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-sapphire sm:text-3xl">
          WhatsApp Fee Reminders with UPI, on a D-3 to D+7 Sequence
        </h1>
        <AnswerFirst>
          {companyName} sends fee reminders straight to a parent&rsquo;s WhatsApp with a
          one-tap UPI payment link, on a fixed D-3 / D-Day / D+2 / D+7 sequence. Paid amounts
          update the fee ledger automatically from real payment records, never from a reminder
          being sent, so the balance shown is always correct.
        </AnswerFirst>
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate">The reminder sequence</h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {sequence.map((stage) => (
            <Card key={stage.label}>
              <span className="inline-block rounded bg-emerald/15 px-2 py-0.5 text-slate text-sm font-semibold">{stage.label}</span>
              <h3 className="mt-1 text-base font-semibold text-slate">{stage.title}</h3>
              <p className="mt-2 text-sm text-slate">{stage.body}</p>
            </Card>
          ))}
        </div>
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
          <li>It does not replace your school&rsquo;s accounting system or statutory books.</li>
          <li>It does not auto-apply sibling or hardship discounts by guessing from a surname or address — every concession needs an approving staff member and a reason on record.</li>
          <li>
            It does not quote a fixed WhatsApp messaging cost on this page.{' '}
            <a
              href="https://developers.facebook.com/docs/whatsapp/pricing"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Meta&rsquo;s official pricing reference
            </a>{' '}
            shows a new rate card effective 1 July 2026, but the exact current INR per-message
            rate is published in Meta&rsquo;s downloadable rate card, not as plain page text — we
            checked on 16 September 2026 and confirm the exact figure with every school during
            onboarding rather than publish a number here that could already be stale by the time
            you read it.
          </li>
          <li>It does not chase payment daily — the sequence is four touchpoints, then a human follow-up.</li>
        </ul>
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate">Frequently asked questions</h2>
        <div className="mt-6">
          <FaqBlock items={faqs} />
        </div>
      </div>

      <div className="rounded-lg bg-sapphire p-8 text-off-white">
        <h2 className="text-xl font-bold">See the reminder sequence on your own phone</h2>
        <p className="mt-2 text-off-white/90">
          Message us on WhatsApp and we will walk through the fee recovery flow for your school.
        </p>
        <div className="mt-4">
          <Button
            href={whatsappLink(`Hi, I would like to see the WhatsApp fee recovery flow for my school.`)}
            variant="secondary"
          >
            Book a demo
          </Button>
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.feeRecovery)) }}
      />
    </Container>
  );
}
