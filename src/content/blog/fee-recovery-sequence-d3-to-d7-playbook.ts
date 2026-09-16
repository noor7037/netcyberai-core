import type { BlogPost } from '../contract';

export const feeRecoverySequenceD3ToD7Playbook: BlogPost = {
  slug: 'fee-recovery-sequence-d3-to-d7-playbook',
  title: 'The Fee Recovery Sequence, Step by Step: D-3 to D+7 (Template Playbook)',
  description:
    'A step-by-step playbook for a four-touchpoint WhatsApp fee reminder sequence — the exact timing, tone, and escalation logic, without invented results.',
  publishedOn: '2026-09-16',
  answerFirst:
    'A fee recovery sequence should have a small, fixed number of touchpoints — D-3, D-Day, D+2, D+7 — not a daily reminder. Each stage has a specific job: reminding, prompting, following up, and finally escalating to a human. This is a playbook for the sequence itself, not a claim about results any specific school achieved with it.',
  body: [
    {
      type: 'paragraph',
      text: 'This is a methodology post, not a results post. We are not going to tell you a percentage by which this sequence improved fee collection at some school, because we do not have a real, consented pilot to cite one from yet — and a made-up number would be worse than no number at all. What we can walk through is the actual design of the sequence: why it has exactly four touchpoints, what each one should say, and where a human needs to take over.',
    },
    {
      type: 'heading',
      text: 'D-3: the advance reminder',
    },
    {
      type: 'paragraph',
      text: 'Three days before a fee is due, a parent gets a short message stating the amount and a UPI payment link. The tone here should be entirely neutral — this is a heads-up, not a warning. Nothing about a fee reminder this early should read as urgent, because it is not yet urgent.',
    },
    {
      type: 'heading',
      text: 'D-Day: the same link, repeated',
    },
    {
      type: 'paragraph',
      text: 'On the due date itself, the same payment link goes out again. This is deliberate repetition, not a new message with new wording — a parent who intends to pay that day should be able to do it in one tap without hunting for a link they saw three days earlier.',
    },
    {
      type: 'heading',
      text: 'D+2: a follow-up, not a warning',
    },
    {
      type: 'paragraph',
      text: 'Two days after the due date, if the fee is still unpaid, a follow-up message goes out. This is where it is tempting to introduce penalty language — late fee warnings, threats of consequence — and where we think that temptation should be resisted at this stage. A short, plain follow-up outperforms an aggressive one, because most late payments are not refusals; they are a parent who missed the first two messages or is waiting on their own next payday.',
    },
    {
      type: 'heading',
      text: 'D+7: escalate to a person, not another message',
    },
    {
      type: 'paragraph',
      text: 'If a week has passed with no payment, the sequence ends and a human — the accountant or the principal — sees it as an item requiring a real phone call. This is the most important design decision in the whole sequence: automation gets you four well-timed nudges, and then it hands off. A bot that keeps messaging daily past this point stops being useful and starts being noise a parent learns to ignore, which undermines every future reminder too.',
    },
    {
      type: 'list',
      items: [
        'D-3 — neutral advance reminder with amount and UPI link',
        'D-Day — repeat the same link; paying should be one tap',
        'D+2 — plain follow-up, no penalty language',
        'D+7 — hands off to a staff member for a real conversation',
      ],
    },
    {
      type: 'heading',
      text: 'What determines whether a fee shows as paid',
    },
    {
      type: 'paragraph',
      text: 'None of this sequence should ever set a fee’s status directly. The status should always be computed from actual recorded payments against the amount due — a reminder being sent, a payment page being opened, or a link being clicked should never move a fee into "paid." This is covered in more depth in [our guide to automating WhatsApp fee reminders with UPI](/blog/automate-school-fee-reminders-whatsapp-upi-india), and in the underlying [fee recovery feature](/features/whatsapp-fee-recovery-upi) itself.',
    },
    {
      type: 'heading',
      text: 'Adapting the sequence without breaking it',
    },
    {
      type: 'paragraph',
      text: 'A school might reasonably want to adjust the exact day offsets for its own calendar, or add a fifth stage for a specific fee type. What should not change is the underlying shape: a small, finite number of touchpoints, a tone that starts neutral and stays non-punitive, and a defined point where automation stops and a person takes over. If your school is also tracking compliance with a state fee-hike rule alongside collection itself, see our [Haryana Form 6 compliance guide](/blog/haryana-form-6-fee-hike-compliance-guide), which covers a related but separate part of the same fee cycle.',
    },
  ],
  faqs: [
    {
      question: 'Why exactly four touchpoints, not more or fewer?',
      answer:
        'Four is enough to remind a parent at the moments that actually matter — before, on, and shortly after the due date — without turning into a daily nag that gets muted or ignored.',
    },
    {
      question: 'Should the tone change if a fee is very overdue?',
      answer:
        'The automated messages should stay non-punitive throughout. Once a real escalation is warranted, that should happen through a human conversation, not a harsher automated message.',
    },
    {
      question: 'Does this sequence work the same way for every fee type?',
      answer:
        'The shape works generally, but a school may reasonably want different timing for, say, an annual fee versus a monthly transport fee. What should stay constant is the finite touchpoint count and the human hand-off at the end.',
    },
    {
      question: 'What happens to the sequence if a parent already paid in cash?',
      answer:
        'The sequence should stop as soon as a real payment is recorded against that fee, regardless of channel — the trigger is the payment record, not which stage the sequence happened to be at.',
    },
  ],
  sources: [],
  caseStudy: null,
};
