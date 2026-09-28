import type { BlogPost } from '../contract';

export const schoolFeeInstalmentPlanAndCollectionForecast: BlogPost = {
  slug: 'school-fee-instalment-plan-and-collection-forecast',
  title: 'School Fee Instalment Plans and Collection Forecasts',
  description:
    'How to set a school fee instalment plan with down payments, sibling discounts and scholarships, and forecast the year’s collection before the shortfall shows.',
  publishedOn: '2026-09-27',
  answerFirst:
    'A school fee instalment plan divides each student’s annual fee, after discounts and the down payment, into equal instalments with fixed due dates. A collection forecast then applies your real on-time and late payment rates to that plan, so the office sees the likely shortfall in April instead of discovering it in February.',
  body: [
    { type: 'heading', text: 'Start from the net fee, not the list fee' },
    {
      type: 'paragraph',
      text: 'The list fee multiplied by enrollment is what the school would earn if nobody had a discount and everybody paid. Sibling discounts and scholarships are promises already made, so the plan should start from the net fee: the list fee less every discount granted. Keep sibling and concession students as separate groups unless your policy deliberately stacks them, and write that policy down so it is applied the same way every year.',
    },
    { type: 'heading', text: 'Choose an instalment rhythm families can keep' },
    {
      type: 'list',
      items: [
        'Monthly instalments are easiest for salaried families but create twelve reminder cycles for the office.',
        'Quarterly and term-wise plans suit most private schools and keep the reminder load manageable.',
        'A down payment at admission reduces risk, because the first part of the year is paid before the first class.',
        'Keep instalments in whole rupees and let the last one absorb rounding, so receipts always add up to the annual fee.',
      ],
    },
    { type: 'heading', text: 'Forecast with your own register, not a hope' },
    {
      type: 'paragraph',
      text: 'Open last year’s fee register and count the share of instalments paid by the due date and the share paid late but within the year. Those two numbers are the most honest forecast you have. Apply them to the net fee after down payments and the gap that remains is the projected shortfall. The [free School Fee Planner](/free-tools/school-fee-planner) does this arithmetic and prints the schedule and a parent link that carries only fee numbers.',
    },
    { type: 'heading', text: 'Act on the shortfall early' },
    {
      type: 'paragraph',
      text: 'A shortfall seen in the first term can still be closed: a polite private reminder three days before each due date, a smaller instalment plan for families who ask, and a weekly look at the overdue list with one named owner. The same actions taken in the last quarter recover far less, because the money has already been spent elsewhere. The [D-3 to D+7 recovery playbook](/blog/fee-recovery-sequence-d3-to-d7-playbook) describes the reminder sequence in detail.',
    },
    { type: 'heading', text: 'What a plan cannot do' },
    {
      type: 'paragraph',
      text: 'A plan is only as good as the collection rates you feed it. If your register is incomplete, or cash is collected without receipts, the forecast will look better than reality. Fix receipting first; the [Fee Leakage and Recovery Calculator](/free-tools/fee-leakage-calculator) helps estimate how much that gap is costing.',
    },
  ],
  faqs: [
    { question: 'How do I calculate a school fee instalment?', answer: 'Take the annual fee after any discount, subtract the down payment, and divide by the number of instalments. Round to whole rupees and let the last instalment carry the difference.' },
    { question: 'Should the down payment be discounted too?', answer: 'Usually not. Most schools apply discounts to the annual fee and keep the admission down payment the same for every family, which keeps the policy simple to explain.' },
    { question: 'What is a realistic collection forecast?', answer: 'The one your own register gives: the share of instalments paid on time and paid late last year. Using a hoped-for rate hides the shortfall until it is too late to act.' },
    { question: 'Can parents see the schedule?', answer: 'Yes. Share the printed schedule or a link that carries only the fee numbers, never any family’s details.' },
  ],
  sources: [],
  caseStudy: null,
};
