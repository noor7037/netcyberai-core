import type { BlogPost } from '../contract';

export const admissionSeasonCapacityAndRevenue: BlogPost = {
  slug: 'admission-season-capacity-and-revenue',
  title: 'Admission Season Planning: Seats, Follow-up, Revenue',
  description:
    'How a school can plan an admission season: open seats, enquiry to admission conversion, daily follow-ups, new sections and the first-year revenue at stake.',
  publishedOn: '2026-09-27',
  answerFirst:
    'Admission planning starts with open seats: total seats minus continuing students. Enquiries multiplied by the share that apply, and applications by the share that take admission, give expected admissions. The gap between the two, and the follow-up calls needed each day to close it, is where a season is won or lost.',
  body: [
    { type: 'heading', text: 'Know your funnel from last season' },
    {
      type: 'paragraph',
      text: 'Count last season’s enquiries, applications and admissions from your register. The two ratios between them are your baseline conversion. Without them, targets are guesses, and guesses tend to be optimistic.',
    },
    { type: 'heading', text: 'The follow-up queue is the real workload' },
    {
      type: 'paragraph',
      text: 'Every enquiry that has not applied is a follow-up. Divide that queue by the days left in the season and compare it with the calls your team can make each day. When the queue is larger, the oldest enquiries go cold first, so work the most recent ones within a day and offer a school visit.',
    },
    { type: 'heading', text: 'Seats, sections and revenue together' },
    {
      type: 'list',
      items: [
        'Admissions can never exceed open seats; extra demand is a waitlist kept in the order applications arrived.',
        'New admissions divided by section size gives the sections to plan, and the rooms and teachers they need.',
        'First-year revenue is the admission fee plus a year of annual fee for each new student.',
      ],
    },
    {
      type: 'paragraph',
      text: 'The [free Admission Capacity and Revenue Planner](/free-tools/admission-revenue-planner) shows all three and compares what a few points of better conversion are worth. Check room capacity with the [Capacity and Section Planner](/free-tools/school-capacity-planner) before confirming offers.',
    },
  ],
  faqs: [
    { question: 'What is a good enquiry to admission conversion rate?', answer: 'Use your own register as the baseline. Improvement comes from faster follow-up and school visits, and the scenarios show what it is worth.' },
    { question: 'How many follow-up calls are needed per day?', answer: 'Enquiries not yet applied divided by the days left in the season. Compare that with what your team can actually make.' },
    { question: 'Should we keep a waitlist?', answer: 'Yes, when demand exceeds open seats. Keep it written and in the order applications arrived, and tell families where they stand.' },
    { question: 'Which revenue should the plan count?', answer: 'The admission fee and one year of annual fee per new student. Later years depend on retention and fee revisions.' },
  ],
  sources: [],
  caseStudy: null,
};
