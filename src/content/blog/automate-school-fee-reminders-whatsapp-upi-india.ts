import type { BlogPost } from '../contract';

export const automateSchoolFeeRemindersWhatsappUpiIndia: BlogPost = {
  slug: 'automate-school-fee-reminders-whatsapp-upi-india',
  title: 'How to Automate School Fee Reminders on WhatsApp with UPI (2026 Guide)',
  description:
    'A practical guide to automating school fee reminders on WhatsApp with a UPI payment link, using a fixed D-3 to D+7 sequence instead of manual phone calls.',
  publishedOn: '2026-09-16',
  answerFirst:
    'Automating school fee reminders means sending a WhatsApp message with a one-tap UPI payment link on a fixed schedule — before the due date, on it, and twice after — so the accountant is not manually calling parents. The fee ledger updates from real payment records, never from a reminder being sent, so the balance shown always stays correct.',
  body: [
    {
      type: 'paragraph',
      text: 'Every Indian school with more than a couple of hundred students runs into the same operational problem: someone on staff has to track who has paid, who has not, and when to follow up. Done manually, this means a register, a lot of phone calls, and fee data that is only ever as current as the last time someone updated the spreadsheet. Automating the reminder side of this does not mean replacing your accounting system — it means making sure the right message reaches the right parent at the right time, with a way to pay attached to it.',
    },
    {
      type: 'heading',
      text: 'The reminder sequence that actually works',
    },
    {
      type: 'paragraph',
      text: 'A fee reminder that goes out every single day until payment reads as harassment, and parents tune it out within a week. A sequence with a small, fixed number of touchpoints holds attention without becoming noise. [NetCyberAI’s fee recovery flow](/features/whatsapp-fee-recovery-upi) uses four: three days before the due date (a gentle heads-up), on the due date itself (a repeat of the same link, since paying should take one tap), two days after if still unpaid (a follow-up, not a warning), and seven days after if it remains unpaid, which is when it becomes a human follow-up rather than another automated message.',
    },
    {
      type: 'list',
      items: [
        'D-3 — advance reminder with the amount due and a UPI link',
        'D-Day — the same link again, so paying is one tap inside WhatsApp',
        'D+2 — a follow-up message, no penalty language',
        'D+7 — escalates to a staff member for a real phone call, not another automated text',
      ],
    },
    {
      type: 'heading',
      text: 'Why the fee status should never be set by hand',
    },
    {
      type: 'paragraph',
      text: 'The single most common fee-tracking bug in school software is a status field that gets set to "paid" because someone opened a payment page, or because a reminder happened to be acknowledged. The correct design computes the status from the actual sum of recorded payments against the amount due: nothing is paid until money has actually moved, and a partial payment shows as partial rather than silently rounding up. This sounds obvious written down, but it is the detail that determines whether parents trust the number they see.',
    },
    {
      type: 'heading',
      text: 'UPI links, not payment gateways parents have to trust blind',
    },
    {
      type: 'paragraph',
      text: 'A UPI deep link opens directly in whichever UPI app a parent already uses — there is no new account to create and no unfamiliar payment gateway to trust with a bank detail. Combined with an automatic receipt sent back over WhatsApp once the payment is confirmed, the entire loop happens inside an app the parent already has open every day.',
    },
    {
      type: 'heading',
      text: 'Concessions stay explicit, never automatic',
    },
    {
      type: 'paragraph',
      text: 'Sibling discounts, staff-ward concessions, and hardship waivers are common and legitimate. What is not legitimate is applying them automatically by matching surnames or addresses — a false-positive discount is a money error, and money errors damage trust faster than any other kind of bug. Every concession should be tied to an explicit guardian link, approved by a named staff member, with a reason recorded. That turns an informal practice many schools already run out of a register into something auditable.',
    },
    {
      type: 'heading',
      text: 'What this costs to run',
    },
    {
      type: 'paragraph',
      text: 'WhatsApp Business messaging is billed by Meta per message, by category, and the rate card changes periodically — it was restructured on 1 July 2025 and again with a new rate card effective 1 July 2026. Any specific rupee figure you read anywhere, including on this site, should carry the date it was checked. We deliberately do not quote a fixed number in this guide for that reason; see [our pricing page](/pricing) for how we handle this with schools directly, and [Meta’s own pricing reference](https://developers.facebook.com/docs/whatsapp/pricing) for the current rate card.',
    },
    {
      type: 'heading',
      text: 'What automation does not replace',
    },
    {
      type: 'paragraph',
      text: 'None of this replaces your school’s statutory books of account, and it should not be the only channel a parent has to ask a question about their fee. It also does not chase a parent daily — a sequence with a defined end that hands off to a human is the design goal, not a bot that never stops messaging. If your school also needs to track compliance with a state fee-hike rule, see our related guide on the [Haryana Form 6 filing requirement](/blog/haryana-form-6-fee-hike-compliance-guide), which covers a different but related problem: knowing whether a proposed fee increase itself is within the state’s advisory range.',
    },
  ],
  faqs: [
    {
      question: 'Does this replace our existing accounting software?',
      answer:
        'No. It automates the parent-facing reminder and receipt flow. Your books of account and financial reporting stay wherever they already are.',
    },
    {
      question: 'What happens if a parent pays in cash at the school office instead of using the link?',
      answer:
        'A staff member records the cash payment against the same fee record. The status updates from that recorded payment, exactly as it would from a UPI payment — there is only one source of truth for whether a fee is paid.',
    },
    {
      question: 'Can we stop the sequence for a specific family, like a hardship case?',
      answer:
        'Yes. A concession or a manual pause is a recorded staff decision, not something the sequence decides for itself.',
    },
    {
      question: 'How many messages does a parent actually receive?',
      answer:
        'Four, at most, spread across ten days — not a daily reminder. After the seventh day past due, follow-up becomes a human phone call rather than another automated message.',
    },
    {
      question: 'Is the WhatsApp messaging cost included in a flat software price?',
      answer:
        'WhatsApp’s own per-message billing is separate from software pricing and changes on Meta’s schedule, not ours. We confirm the current rate with each school directly rather than publish a number that could already be out of date by the time you read it.',
    },
  ],
  sources: [
    {
      label: 'Meta — WhatsApp Business Platform pricing',
      url: 'https://developers.facebook.com/docs/whatsapp/pricing',
      checkedOn: '2026-09-16',
    },
  ],
  caseStudy: null,
};
