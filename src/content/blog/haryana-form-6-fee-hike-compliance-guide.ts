import type { BlogPost } from '../contract';

export const haryanaForm6FeeHikeComplianceGuide: BlogPost = {
  slug: 'haryana-form-6-fee-hike-compliance-guide',
  title: 'Haryana Form 6: The Fee Hike Compliance Guide for Private Schools',
  description:
    'What Haryana’s Form 6 actually requires, how the fee-hike cap is calculated, and what happens if a school misses the filing — with dated, cited sources.',
  publishedOn: '2026-09-16',
  answerFirst:
    'Haryana requires recognised private schools to file Form 6 annually, and caps most fee increases at the per-capita rise in teaching staff salary, subject to a ceiling of the latest Consumer Price Index increase plus five percent. Schools that miss the filing cannot raise fees that session. This guide explains the rule and the filing requirement, without giving legal advice.',
  body: [
    {
      type: 'paragraph',
      text: 'Every recognised private school in Haryana is required to file Form 6 with the Director of Education each year, and the fee increase a school can apply is capped by a published formula. Coverage of school fee disputes in the state makes clear this is not a paperwork formality schools can skip — non-filing has a direct, stated consequence: a school that has not filed cannot raise its fees for that academic session.',
    },
    {
      type: 'heading',
      text: 'What the fee-hike formula actually says',
    },
    {
      type: 'paragraph',
      text: 'The rule ties a school’s permissible fee increase to the per-capita rise in its teaching staff’s salary from the previous year, capped by the latest available Consumer Price Index increase plus five percent. In effect, the CPI-plus-five-percent figure acts as a ceiling on the calculation, not a separate formula a school can simply choose instead. We are deliberately not publishing a worked numeric example here, because the current year’s CPI figure is not something we invent — it has to come from an official source, checked at the time you need it, which is exactly the design used on our [Form 6 advisory feature page](/features/haryana-form-6-fee-advisory).',
    },
    {
      type: 'heading',
      text: 'What Form 6 requires',
    },
    {
      type: 'paragraph',
      text: 'Form 6 covers student and staff strength, staff salary figures for the current and prior year, the current and proposed fee structure, and the facilities the school provides. It must be filed online to the Director of Education, and it must also be displayed publicly — on the school’s notice board and on its website. A school cannot charge any mandatory fee component beyond what it declared in its own filed Form 6. If you are weighing how any of this data should be stored and who can access it, see our page on [data ownership and security](/security/data-ownership).',
    },
    {
      type: 'heading',
      text: 'Filing Form 6: the steps',
    },
    {
      type: 'list',
      items: [
        'Gather the required data — enrollment and staff strength, last year’s and this year’s fee structure, staff salary figures for both years, and details of the facilities the school provides.',
        'Calculate the permissible increase — work out the per-capita rise in teaching staff salary, and check the result does not exceed the latest Consumer Price Index increase plus five percent.',
        'File Form 6 online — submit the completed form to the Director of Education before the deadline confirmed by the Department for that year.',
        'Display Form 6 publicly — post it on the school’s notice board and its own website; public display is a required part of compliance, not optional.',
      ],
    },
    {
      type: 'heading',
      text: 'The deadline is not a fixed date every year',
    },
    {
      type: 'paragraph',
      text: 'The standing rule sets 1 February as the annual filing deadline. In practice, Haryana has extended this deadline differently in different years — reporting on one year’s cycle describes an extension to 31 March after being pushed back multiple times, while a more recent cycle describes an extension to 30 April. Treating any single date as fixed year over year is the kind of assumption that causes a school to miss a real deadline. Confirm the current year’s actual cutoff with the Department directly rather than reusing last year’s date, including from this guide.',
    },
    {
      type: 'heading',
      text: 'The compliance gap is real and well documented',
    },
    {
      type: 'paragraph',
      text: 'Reporting on one filing cycle found that even after the deadline was extended multiple times, only around 56 percent of the more than 10,000 schools required to file had actually submitted Form 6. Schools cited the form’s complexity and the difficulty of comparing the previous year’s and the current year’s staff salary figures as the main obstacles — not unwillingness to comply, but a genuinely hard annual paperwork exercise. That is the specific, verifiable gap a compliance tool needs to close: making the salary comparison and the filing itself easier to get right, not policing whether a school wants to raise fees.',
    },
    {
      type: 'heading',
      text: 'What an advisory tool should and should not do',
    },
    {
      type: 'paragraph',
      text: 'A fee cap is enforced by the Education Department, not by software. Our own [Form 6 advisory](/features/haryana-form-6-fee-advisory) shows a school where its proposed increase sits against the published formula, and nothing more — it never states that a fee structure is legal or illegal, and it never blocks a school from proceeding. A principal can mute the advisory, and doing so is itself a recorded action rather than a silent setting, precisely because the point of the tool is transparency, not gatekeeping. If your school is also automating fee collection itself, see our guide on [automating WhatsApp fee reminders with UPI](/blog/automate-school-fee-reminders-whatsapp-upi-india), which covers the collection side of the same fee cycle.',
    },
    {
      type: 'heading',
      text: 'This is not legal advice',
    },
    {
      type: 'paragraph',
      text: 'This guide explains publicly reported rules and cites its sources with dates. It is not a substitute for confirming your school’s specific position with your own legal counsel or directly with the Haryana Department of School Education, particularly given how often reported deadlines and figures have changed year to year.',
    },
  ],
  faqs: [
    {
      question: 'Is the fee cap simply "5% every year"?',
      answer:
        'No. The cap is tied to the per-capita rise in teaching staff salary, subject to a ceiling of the latest CPI increase plus five percent — not a flat five percent applied automatically every year regardless of CPI.',
    },
    {
      question: 'What happens if our school does not file Form 6 on time?',
      answer:
        'Reported coverage of the rule states that a school which has not submitted Form 6 is not permitted to raise its fees for that academic session.',
    },
    {
      question: 'Is the filing deadline always 1 February?',
      answer:
        'That is the standing rule, but Haryana has granted extensions in practice in multiple past years, to different dates in different years. Confirm the current year’s actual cutoff with the Department rather than assuming a fixed date.',
    },
    {
      question: 'Does Form 6 need to be shown to anyone outside the school?',
      answer:
        'Yes — schools are required to display Form 6 publicly, on the notice board and on the school’s own website, not only file it internally.',
    },
    {
      question: 'Can a compliance tool tell us definitively whether our fee hike is legal?',
      answer:
        'No, and any tool that claims to is overstating what it can determine. An advisory position against a published formula is not the same as a legal determination — confirm specifics with legal counsel or the Department directly.',
    },
  ],
  sources: [
    {
      label: 'Haryana Government Sets Mandatory Cap on School Fee Hike (formula, quoted directly)',
      url: 'https://exam.buddy4study.com/haryana-government-sets-mandatory-cap-on-school-fee-hike',
      checkedOn: '2026-09-16',
    },
    {
      label: 'The Tribune — Form 6 public-display rule and fee restriction',
      url: 'https://www.tribuneindia.com/news/haryana/private-schools-violating-form-6-rules-allege-parents-612662',
      checkedOn: '2026-09-16',
    },
    {
      label: 'The Tribune — Form 6 filing compliance rate (56%, 10,000+ schools)',
      url: 'https://www.tribuneindia.com/news/haryana/only-56-private-schools-in-haryana-apply-for-hiking-fee-383422',
      checkedOn: '2026-09-16',
    },
    {
      label: 'Haryana Department of School Education — official Form 6 fee-increase notification (8 April 2022)',
      url: 'https://schooleducationharyana.gov.in/increase-in-school-fee-as-per-form-vi-of-haryana-school-education-08-04-2022/',
      checkedOn: '2026-09-16',
    },
  ],
  howTo: {
    name: 'How to file Haryana Form 6',
    description:
      'The four-step process a recognised Haryana private school follows to file its annual Form 6 fee-hike filing, matching the "Filing Form 6: the steps" section above.',
    steps: [
      {
        name: 'Gather the required data',
        text: 'Collect enrollment and staff strength, last year’s and this year’s fee structure, staff salary figures for both years, and details of the facilities the school provides.',
      },
      {
        name: 'Calculate the permissible increase',
        text: 'Work out the per-capita rise in teaching staff salary, and confirm the result does not exceed the latest Consumer Price Index increase plus five percent.',
      },
      {
        name: 'File Form 6 online',
        text: 'Submit the completed form to the Director of Education before the deadline confirmed by the Department for that year.',
      },
      {
        name: 'Display Form 6 publicly',
        text: 'Post the filed form on the school’s notice board and its own website, since public display is a required part of compliance.',
      },
    ],
  },
  caseStudy: null,
};
