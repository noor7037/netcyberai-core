import { Container } from '@/components/ui/Container';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AnswerFirst } from '@/components/content/AnswerFirst';
import { StepDiagram } from '@/components/content/StepDiagram';
import { FaqBlock } from '@/components/content/FaqBlock';
import { whatsappLink } from '@/lib/site-config';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';

export const metadata = buildMetadata(pageMeta.certificates);

const pipeline = [
  { stage: 'Applied', body: 'A parent or student requests a Transfer, Character, or Bonafide certificate.' },
  { stage: 'Finance clearance', body: 'The accountant confirms there is no pending fee balance against the student.' },
  { stage: 'Remarks', body: 'The class teacher or principal adds any required remarks to the certificate.' },
  { stage: 'Principal signed', body: 'The principal reviews and signs off on the final certificate content.' },
  { stage: 'Delivered', body: 'A signed PDF is generated and sent directly to the parent on WhatsApp.' },
];

const steps = [
  {
    title: 'Request is logged, not lost in a register',
    body: 'Every request gets a single record that moves through the pipeline, instead of a paper file that can go missing.',
  },
  {
    title: 'Each stage has one clear owner',
    body: 'Finance clears fees, staff add remarks, the principal signs — no certificate skips a step.',
  },
  {
    title: 'Delivery is verifiable',
    body: 'The final PDF carries a QR code linking to a verification endpoint, so a receiving college or employer can confirm it is genuine.',
  },
];

const faqs = [
  {
    question: 'Can a certificate be issued if fees are still pending?',
    answer:
      'The finance clearance stage exists specifically to catch this. A principal can still override it for a genuine reason, but the override is recorded, not silent.',
  },
  {
    question: 'How is a certificate verified as genuine?',
    answer:
      'Every issued PDF carries a QR code linking to a verification page that checks a school-signed digital claim. We do not use blockchain for this — a signed record behind a QR code solves the same problem more simply.',
  },
  {
    question: 'Where is the school’s signing key stored?',
    answer:
      'Server-side only, held and rotated by the platform. It is never shipped to a browser, embedded in a PDF, or held on a school-side device.',
  },
  {
    question: 'Can parents track the status of a request themselves?',
    answer:
      'Yes, from the school portal once it is live for a school. In the meantime, staff can see exactly which of the five stages a request is sitting at.',
  },
];

export default function DigitalTcPipelinePage() {
  return (
    <Container className="flex flex-col gap-12 py-12">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-sapphire sm:text-3xl">
          Digital TC, Character &amp; Bonafide Certificates: Application to WhatsApp Delivery
        </h1>
        <AnswerFirst>
          Transfer, character, and bonafide certificate requests move through five clear stages —
          applied, finance clearance, remarks, principal signed, delivered — instead of a paper
          file that can sit on a desk. The finished certificate is a signed PDF sent straight to
          the parent&rsquo;s WhatsApp, with a QR code a receiving institution can verify.
        </AnswerFirst>
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate">The five-stage pipeline</h2>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-5">
          {pipeline.map((step, i) => (
            <div key={step.stage} className="flex flex-col items-center text-center">
              <Card className="w-full">
                <span className="inline-block rounded bg-emerald/15 px-2 py-0.5 text-slate text-xs font-semibold">Stage {i + 1}</span>
                <h3 className="mt-1 text-sm font-semibold text-slate">{step.stage}</h3>
                <p className="mt-2 text-xs text-slate">{step.body}</p>
              </Card>
              {i < pipeline.length - 1 && (
                <span aria-hidden className="my-2 text-slate/70 sm:hidden">
                  &#8595;
                </span>
              )}
            </div>
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
          <li>It does not use blockchain — a signed PDF with a QR verification link solves the same problem without a third-party dependency.</li>
          <li>It does not let a certificate skip the finance clearance stage silently — an override is always a recorded, human decision.</li>
          <li>It does not store the school&rsquo;s signing key on any client device or in the PDF itself.</li>
        </ul>
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate">Frequently asked questions</h2>
        <div className="mt-6">
          <FaqBlock items={faqs} />
        </div>
      </div>

      <div className="rounded-lg bg-sapphire p-8 text-off-white">
        <h2 className="text-xl font-bold">See the certificate pipeline on your own phone</h2>
        <p className="mt-2 text-off-white/90">
          Message us on WhatsApp for a walkthrough of the TC and certificate workflow.
        </p>
        <div className="mt-4">
          <Button
            href={whatsappLink('Hi, I would like to see the digital TC and certificate pipeline for my school.')}
            variant="secondary"
          >
            Book a demo
          </Button>
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.certificates)) }}
      />
    </Container>
  );
}
