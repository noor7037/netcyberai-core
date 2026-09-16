import type { BlogPost } from '../contract';

export const onboarding500StudentsWithoutDpdpProblem: BlogPost = {
  slug: 'onboarding-500-students-without-dpdp-problem',
  title: 'Onboarding 500 Students Without a DPDP Problem',
  description:
    'A fast bulk student import is not the same as 500 consented records. Here is how a consent ledger keeps onboarding speed from becoming a compliance problem.',
  publishedOn: '2026-09-16',
  answerFirst:
    'Importing 500 students from a spreadsheet in minutes is a real, achievable speed. What it is not, by itself, is 500 consented records — most of that data concerns children, and a bulk import should land every record in a quarantined pending state until a parent or guardian’s consent is actually recorded.',
  body: [
    {
      type: 'paragraph',
      text: 'A common pitch for school software is speed: upload a spreadsheet, and within minutes every student, parent, and teacher record exists in the system. That speed is genuinely valuable — no one wants to hand-type 500 rows. But "the records exist" and "the records are ready to receive messages or be scored" are two different claims, and conflating them is where a fast onboarding process turns into a compliance problem.',
    },
    {
      type: 'heading',
      text: 'Why a fast import is not the same as consent',
    },
    {
      type: 'paragraph',
      text: 'Most of the data in a school system concerns children. A spreadsheet upload tells you a record exists; it tells you nothing about whether a parent or lawful guardian has actually agreed to their child’s data being processed for a given purpose. Treating the two as equivalent means an "onboard 500 students in 10 minutes" pitch quietly becomes "500 unconsented child records now exist in a live system" — which is a materially different and much riskier claim.',
    },
    {
      type: 'heading',
      text: 'The honest version of the pitch',
    },
    {
      type: 'paragraph',
      text: 'The design we use treats a bulk import as creating records in a quarantined state, not an active one. A student record starts as pending consent, and stays there until a specific consent event is recorded against it. No outbound message and no [recognition scoring](/blog/personal-best-vs-top-3-recognition) reaches a student in that state. The honest speed claim is not "onboard 500 students," it is "prepare 500 records for consent collection" — a smaller claim, but one that is actually true.',
    },
    {
      type: 'heading',
      text: 'Consent is per purpose, not one checkbox',
    },
    {
      type: 'paragraph',
      text: 'A single blanket "I consent" checkbox is not the same as meaningful consent for several distinct things a school might do with a child’s data — sending a daily update, sending recognition messages, or sending a weekly summary are different purposes, and a parent should be able to agree to one without being forced into all three. Each purpose should be independently consentable and independently withdrawable, defaulting to off until specifically granted, and recorded with who granted it, how, and when.',
    },
    {
      type: 'list',
      items: [
        'A bulk import creates records in a pending, quarantined state — never active by default.',
        'No message and no recognition scoring reaches a pending-consent student.',
        'Each communication purpose (daily update, recognition, weekly summary) is separately consentable.',
        'Consent can be withdrawn as easily as it was given, independently per purpose.',
      ],
    },
    {
      type: 'heading',
      text: 'Why this protects the school, not just the child',
    },
    {
      type: 'paragraph',
      text: 'A consent ledger is not only a protection for a student — it is also the record a school would need if its own data handling were ever questioned, whether by a parent, an auditor, or a regulator. Being able to show exactly when and how a parent consented to a specific communication purpose is a much stronger position than a vendor’s assurance that consent was "handled" somewhere in the system. This is the same logic behind [how we approach data ownership more broadly](/security/data-ownership): a recorded decision beats an assumed one, every time, and a ledger that cannot be quietly edited after the fact is worth more than one that can.',
    },
    {
      type: 'heading',
      text: 'What this looks like operationally',
    },
    {
      type: 'paragraph',
      text: 'In practice, a school uploads its spreadsheet once, and then runs a consent collection process — a form sent home, a signature collected at admission, or a verified digital acknowledgment — separately from the technical import. The two steps happen close together in time, but they are not the same step, and the system should never blur them into one to make the pitch sound faster than it is. If your school is also thinking about how fee and academic data feed into a compliance filing like [Haryana’s Form 6](/blog/haryana-form-6-fee-hike-compliance-guide), the same principle applies: recorded and sourced beats fast and assumed.',
    },
  ],
  faqs: [
    {
      question: 'Does this mean onboarding actually takes longer?',
      answer:
        'The technical import stays fast — minutes, not days. What takes real time is the separate, necessary process of actually collecting consent from parents, which a fast import should never pretend to have already done.',
    },
    {
      question: 'Can a school message a student before consent is collected?',
      answer:
        'No. A student in the pending-consent state cannot receive outbound messages or recognition scoring under this design — it is enforced structurally, not left to a setting someone could forget to check.',
    },
    {
      question: 'What if a parent consents to daily updates but not to recognition messages?',
      answer:
        'That is exactly the case this design is built for. Each purpose is independently consentable, so a parent can opt into one and not another without an all-or-nothing choice.',
    },
    {
      question: 'Is a signed paper form enough to count as recorded consent?',
      answer:
        'It can be one valid method, as long as it is logged — who consented, to what, by what method, and when — rather than assumed from the student simply being enrolled.',
    },
  ],
  sources: [],
  caseStudy: null,
};
