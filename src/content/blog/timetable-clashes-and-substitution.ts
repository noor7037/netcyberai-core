import type { BlogPost } from '../contract';

export const timetableClashesAndSubstitution: BlogPost = {
  slug: 'timetable-clashes-and-substitution',
  title: 'Finding Timetable Clashes and Planning Substitutes',
  description:
    'A practical way to check a school timetable for teacher clashes and double bookings, balance teacher workload, and pick fair substitutes when a teacher is away.',
  publishedOn: '2026-09-27',
  answerFirst:
    'A timetable clash is one teacher in two classes at once, or one class with two lessons at once. Both are easy to miss in a spreadsheet and obvious in a list sorted by day, period and teacher. Check for them, compare scheduled periods with what each subject needs, and keep a substitute rule that everyone can see.',
  body: [
    { type: 'heading', text: 'Three checks before term starts' },
    {
      type: 'list',
      items: [
        'Teacher clashes: the same teacher in two different classes in the same period.',
        'Class double bookings: one class with two subjects or teachers in the same period.',
        'Unavailability: a teacher scheduled in a period they are not available, such as a part-time teacher’s day off.',
      ],
    },
    {
      type: 'paragraph',
      text: 'Then compare the periods scheduled for each class and subject with the weekly periods it needs. A subject that is two periods short every week loses a month of teaching by the end of the year.',
    },
    { type: 'heading', text: 'Workload balance you can see' },
    {
      type: 'paragraph',
      text: 'Count each teacher’s periods per week and the most in any one day. A teacher far above the average, or with six periods in a row, is where fatigue and complaints start. Show the counts rather than a single score, so the timetable in-charge can see the reason behind every flag.',
    },
    { type: 'heading', text: 'A substitute rule that feels fair' },
    {
      type: 'paragraph',
      text: 'When a teacher is absent, choose only from teachers who are free in that period and not unavailable. Prefer the same subject, then whoever has the lightest day. Writing the rule down, and applying it the same way each morning, stops the same willing teachers covering every gap. The [free Timetable Clash Checker](/free-tools/timetable-clash-checker) applies exactly these checks and suggests substitutes, and the [Teacher Workload Planner](/free-tools/teacher-workload-planner) adds preparation and correction hours to the picture.',
    },
  ],
  faqs: [
    { question: 'How do I find clashes in an Excel timetable?', answer: 'Put the timetable in long form, one row per class per period with day, period, class, subject and teacher, then sort by day, period and teacher. Any teacher appearing twice in the same slot is a clash.' },
    { question: 'How should substitutes be chosen?', answer: 'Only from teachers free in that period, same subject first, then the lightest day. Apply the rule the same way every time.' },
    { question: 'How many periods should a teacher take?', answer: 'That is a school policy decision. Track periods per week and per day so the policy can be applied fairly.' },
    { question: 'Can I share a timetable without teacher names?', answer: 'Yes. Replace each name with a stand-in such as Teacher 2 consistently, so clashes still show but names stay private.' },
  ],
  sources: [],
  caseStudy: null,
};
