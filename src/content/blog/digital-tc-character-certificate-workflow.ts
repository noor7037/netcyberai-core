import type { BlogPost } from '../contract';

export const digitalTcCharacterCertificateWorkflow: BlogPost = {
  slug: 'digital-tc-character-certificate-workflow',
  title: 'Digital TC & Character Certificate Workflow',
  description:
    'How a transfer, character, or bonafide certificate request moves through a school — from application to a signed PDF delivered on WhatsApp, start to finish.',
  publishedOn: '2026-09-16',
  answerFirst:
    'A digital TC or character certificate workflow moves a request through five stages — applied, finance clearance, remarks, principal signed, delivered — instead of a paper file that can sit on a desk for weeks. The finished certificate is a signed PDF sent straight to WhatsApp, carrying a QR code a receiving college or employer can verify independently.',
  body: [
    {
      type: 'paragraph',
      text: 'A Transfer Certificate, Character Certificate, or Bonafide Certificate request touches at least three people at most schools: the accountant, who has to confirm there is no pending fee balance; a class teacher or the principal, who adds remarks; and the principal again, who signs off. When this lives in a paper register, a request can sit for weeks with no one quite sure whose desk it is on. A digital workflow does not change who is involved — it changes whether the request is ever actually lost.',
    },
    {
      type: 'heading',
      text: 'The five stages',
    },
    {
      type: 'list',
      items: [
        'Applied — a parent or student submits the request',
        'Finance clearance — the accountant confirms no fee balance is outstanding',
        'Remarks — the class teacher or principal adds any required notes',
        'Principal signed — final review and sign-off',
        'Delivered — a signed PDF is generated and sent on WhatsApp',
      ],
    },
    {
      type: 'paragraph',
      text: 'Structuring the process this way, as described on our [digital TC and certificate pipeline page](/features/digital-tc-character-bonafide-pipeline), means every request has exactly one stage it is sitting at, and exactly one person whose action moves it forward. That is a small change on paper, but it is the difference between a principal seeing a queue of three pending requests and a parent calling the office to ask what happened to theirs.',
    },
    {
      type: 'heading',
      text: 'Why finance clearance is a stage, not an assumption',
    },
    {
      type: 'paragraph',
      text: 'Issuing a Transfer Certificate while a fee balance is outstanding is a common source of dispute once a student has already left for another school. Building finance clearance in as an explicit stage — rather than trusting that someone remembered to check — catches this before the certificate goes out. A principal can still override it for a genuine reason, and that override should be recorded, not silent, so there is a record of why an exception was made.',
    },
    {
      type: 'heading',
      text: 'Verifying a certificate without blockchain',
    },
    {
      type: 'paragraph',
      text: 'Certificate verification is often pitched as a blockchain problem, but the actual requirement is simpler: a receiving college or employer needs a way to confirm a certificate is genuine without calling the school. A signed digital claim behind a QR code solves this without a third-party ledger, a token, or a wallet — the QR code resolves to a verification page that checks a cryptographic signature created by the school. The complexity that blockchain credentials add — a distributed ledger, a token standard, ongoing infrastructure — solves a problem this simpler approach already solves.',
    },
    {
      type: 'paragraph',
      text: 'The one part of this that has to be handled carefully is the signing key itself. It should live and rotate on the server side only — never shipped to a browser, never embedded inside the PDF, never held on a device at the school. A signing key on a school-side laptop is one lost laptop away from a forged certificate.',
    },
    {
      type: 'heading',
      text: 'Delivery matters as much as the certificate itself',
    },
    {
      type: 'paragraph',
      text: 'A certificate that is ready but sitting in a folder waiting for someone to print it is not meaningfully different from a paper process. Sending the finished, signed PDF directly to the parent’s WhatsApp closes the loop the same way [WhatsApp fee reminders](/blog/automate-school-fee-reminders-whatsapp-upi-india) do — the document reaches the person who needs it without a second trip to the school office.',
    },
    {
      type: 'heading',
      text: 'What this does not solve',
    },
    {
      type: 'paragraph',
      text: 'A digital pipeline does not remove the human judgment involved in remarks or in a principal’s sign-off — nor should it. It also does not retroactively fix a backlog of paper requests already in progress; it only prevents new ones from getting lost the same way. If your school is also digitizing fee records, see our guide on [Haryana’s Form 6 filing requirement](/blog/haryana-form-6-fee-hike-compliance-guide), which covers a related but separate compliance obligation around fee structures.',
    },
  ],
  faqs: [
    {
      question: 'Can a certificate be issued if the student still owes fees?',
      answer:
        'The finance clearance stage exists specifically to surface this before a certificate is signed. A principal can still override it for a genuine reason, and that override is recorded rather than silent.',
    },
    {
      question: 'How does a college or employer actually verify the certificate?',
      answer:
        'The PDF carries a QR code linking to a verification page that checks a school-signed digital claim — no blockchain, no app to install, no account to create.',
    },
    {
      question: 'Where is the school’s signing key stored?',
      answer:
        'Server-side only, held and rotated by the platform. It is never shipped to a client device, embedded in the PDF, or exposed in a browser.',
    },
    {
      question: 'Does this work for Bonafide and Character certificates too, or only Transfer Certificates?',
      answer:
        'The same five-stage structure applies to all three certificate types, since the underlying problem — a request moving through clearance, remarks, and sign-off — is the same regardless of which certificate is being issued.',
    },
  ],
  sources: [],
  caseStudy: null,
};
