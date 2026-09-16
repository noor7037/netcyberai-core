import type { BlogPost } from '../contract';

export const schoolErpDataOwnershipPreContractChecklist: BlogPost = {
  slug: 'school-erp-data-ownership-pre-contract-checklist',
  title: 'School ERP Data Ownership: A Pre-Contract Checklist',
  description:
    'Questions a principal should ask any school software vendor before signing — about data export, residency, children’s consent, and what happens if you leave.',
  publishedOn: '2026-09-16',
  answerFirst:
    'Before signing with any school software vendor, ask four things: can you export your data in a standard format, where is it physically stored, how is children’s consent actually recorded, and what happens to your data if you leave. A vendor unable to answer plainly is telling you something, whether or not they mean to.',
  body: [
    {
      type: 'paragraph',
      text: 'This checklist is meant to be used against any vendor a school is considering — not only us. A principal evaluating school software is usually not a data protection lawyer, and should not need to be one to ask the questions that actually matter before signing a multi-year contract with a system that will hold years of student records.',
    },
    {
      type: 'heading',
      text: '1. Can you actually export your own data?',
    },
    {
      type: 'paragraph',
      text: 'Ask specifically what format an export comes in. "We can export your data" said about a proprietary format only that vendor’s own tools can read is a much weaker promise than a real CSV or SQL export you could open in a spreadsheet or hand to a different vendor. If a vendor cannot describe the export format concretely, that is itself an answer.',
    },
    {
      type: 'heading',
      text: '2. Where is the data physically stored?',
    },
    {
      type: 'paragraph',
      text: 'For a school handling Indian students’ data, ask which country and which specific region the database lives in, not just "cloud-hosted" as a vague answer. A vendor should be able to name the actual hosting region.',
    },
    {
      type: 'heading',
      text: '3. How is children’s consent actually recorded?',
    },
    {
      type: 'paragraph',
      text: 'Most of the data in a school system concerns children. Ask whether a bulk student import creates active records immediately, or whether records sit in a pending state until consent is specifically recorded. Ask whether daily updates, recognition messages, and other communication types are separately consentable, or bundled into one blanket agreement. We cover why this distinction matters in more depth in [our guide to onboarding students without a DPDP problem](/blog/onboarding-500-students-without-dpdp-problem).',
    },
    {
      type: 'heading',
      text: '4. What happens if you leave?',
    },
    {
      type: 'paragraph',
      text: 'Ask what happens to your data on offboarding — do you get a full export before deletion, and is there a defined retention timeline, or does the vendor simply not say. A vague answer here is a real signal, since this is one of the easiest commitments for a vendor to state plainly if it actually intends to honour it.',
    },
    {
      type: 'heading',
      text: '5. Who inside the school can actually see what?',
    },
    {
      type: 'paragraph',
      text: 'Ask how access is restricted between roles — can a teacher see another teacher’s private performance notes, can a parent see another family’s fee balance, can front-desk staff see salary data mixed in with student records. The important follow-up question is not whether the answer is "no," but *where* that "no" is enforced. A restriction enforced only in the app’s screens can be bypassed by a bug or a direct database query; a restriction enforced at the database layer itself, so a query simply cannot return another school’s or another family’s row, holds even if the application code has a mistake somewhere else.',
    },
    {
      type: 'list',
      items: [
        'Export format: named and concrete, not "we can export it" as a vague promise.',
        'Data residency: a specific country and region, not just "the cloud."',
        'Consent: purpose-specific and recorded, not one blanket checkbox at enrollment.',
        'Offboarding: a stated export-then-delete process, not silence on the question.',
        'Access control: enforced at the database layer, not only hidden in the interface.',
      ],
    },
    {
      type: 'heading',
      text: 'Why we answer this about ourselves in public',
    },
    {
      type: 'paragraph',
      text: 'We publish our own answers to exactly these questions on [our data ownership page](/security/data-ownership), including being explicit about which commitments are already locked into our design today and which are planned for our first live school deployment rather than already running. A vendor that marks the difference between "built" and "planned" is giving you more useful information than one that describes everything in the present tense regardless of what actually exists yet.',
    },
    {
      type: 'heading',
      text: 'What this checklist does not cover',
    },
    {
      type: 'paragraph',
      text: 'This is about data ownership and consent specifically, not a full vendor evaluation — things like pricing, feature fit, and support quality matter too, and are separate questions. See [our pricing page](/pricing) for how we handle the commercial side of that conversation honestly as well.',
    },
  ],
  faqs: [
    {
      question: 'Should I ask these questions even if I trust the vendor?',
      answer:
        'Yes — a concrete answer costs a good vendor nothing to give, and the exercise of asking is what actually surfaces the difference between a vendor with a real answer and one without.',
    },
    {
      question: 'What if a vendor says data export "will be available soon"?',
      answer:
        'That is a reasonable answer if it is honest — ask for a specific format and timeline rather than accepting it as settled. The problem is not a feature being planned; the problem is a planned feature being described as already available.',
    },
    {
      question: 'Does data residency in India matter if the vendor is an Indian company?',
      answer:
        'Not automatically — an Indian company can still host data on infrastructure located outside India. Ask about the actual server region, not the vendor’s registered address.',
    },
    {
      question: 'Is a signed contract enough, or should this be verified technically?',
      answer:
        'A contract sets expectations, but where it is practical, ask how a claim is technically enforced — for example, whether data isolation between schools is enforced at the database level or only in application code that could contain a bug.',
    },
  ],
  sources: [],
  caseStudy: null,
};
