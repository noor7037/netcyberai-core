import type { BlogPost } from '../contract';

export const schoolCostPerStudentAndBreakEvenFee: BlogPost = {
  slug: 'school-cost-per-student-and-break-even-fee',
  title: 'Cost per Student and the Break-even School Fee',
  description:
    'How to add up a school’s running costs, find the cost per student and the break-even fee at your real collection rate, and see the surplus or deficit early.',
  publishedOn: '2026-09-27',
  answerFirst:
    'Cost per student is the year’s running costs divided by enrollment. The break-even fee is that cost divided by the share of fees you actually collect, because uncollected fees still leave the bills to pay. If the average fee is below the break-even fee, the school is running a deficit this year, whatever last year looked like.',
  body: [
    { type: 'heading', text: 'List every monthly cost' },
    {
      type: 'list',
      items: [
        'Payroll, usually the largest line.',
        'Rent or loan instalments, electricity, water and internet.',
        'Teaching materials, stationery, maintenance and cleaning.',
        'Parent communication, software subscriptions and transport.',
      ],
    },
    { type: 'heading', text: 'Collection changes the answer' },
    {
      type: 'paragraph',
      text: 'If a school collects 90 of every 100 rupees billed, the break-even fee is the cost per student divided by 0.9: about 11 rupees more for every 100 rupees of cost. Improving collection is often faster and kinder than raising fees; see the [Fee Leakage and Recovery Calculator](/free-tools/fee-leakage-calculator) for where fees slip away.',
    },
    { type: 'heading', text: 'Keep a surplus on purpose' },
    {
      type: 'paragraph',
      text: 'Buildings need repairs, buses need replacing and emergencies happen. Decide a surplus margin and add it to the break-even fee to find the fee that keeps the school healthy. The [free Operations Cost Calculator](/free-tools/school-operations-cost-calculator) prints the category budget, cost per student, break-even fee and this year’s surplus or deficit. Where fee revisions need regulator approval, such as Form 6 in Haryana, see our [Form 6 guide](/blog/haryana-form-6-fee-hike-compliance-guide).',
    },
  ],
  faqs: [
    { question: 'How do I calculate cost per student?', answer: 'Add a year of running costs and divide by the number of students enrolled.' },
    { question: 'What is the break-even fee?', answer: 'The average annual fee needed for fee income to cover running costs, after allowing for fees that are billed but never collected.' },
    { question: 'Should capital spending be included?', answer: 'Not in running cost. Plan buildings and buses separately, and keep a surplus to fund them.' },
    { question: 'Is a deficit always a reason to raise fees?', answer: 'No. Check collection and leakage first. Many schools recover more from receipting and reminders than a fee rise would bring.' },
  ],
  sources: [],
  caseStudy: null,
};
