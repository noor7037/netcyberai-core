import type { BlogPost } from '../contract';

export const fairTeacherWorkloadAndSubstitution: BlogPost = {
  slug: 'fair-teacher-workload-and-substitution',
  title: 'Fair Teacher Workload and Substitution Planning',
  description:
    'How to see each teacher’s real weekly load, including preparation, correction and meetings, flag overload fairly, and share substitutions without favourites.',
  publishedOn: '2026-09-27',
  answerFirst:
    'A teacher’s workload is more than periods on the timetable. Preparation, correction, meetings and duties add hours that never appear there. Count all of them for every teacher, set limits as school policy, and choose substitutes by a written rule. Fairness comes from the numbers being visible, not from a single score.',
  body: [
    { type: 'heading', text: 'Count the hidden hours' },
    {
      type: 'list',
      items: [
        'Teaching hours: periods per week multiplied by the length of a period.',
        'Preparation: planning lessons, worksheets and practicals.',
        'Correction: notebooks, tests and projects, which peak around exams.',
        'Meetings and duties: staff meetings, PTMs, gate and bus duty.',
      ],
    },
    { type: 'heading', text: 'Why no efficiency score' },
    {
      type: 'paragraph',
      text: 'A single score invites comparison between teachers doing very different jobs, and hides the reason behind a number. Showing each component lets a principal see that one teacher is overloaded by correction in a board class, and another by duties, and fix each cause. The same principle guides the [Teacher Impact Card](/blog/teacher-impact-card-measuring-teaching-without-leaderboards).',
    },
    { type: 'heading', text: 'A substitution rule everyone can see' },
    {
      type: 'paragraph',
      text: 'Choose substitutes only from teachers not on leave and within the limits: same subject first, then the most free periods, then the lightest week. The [free Teacher Workload and Substitution Planner](/free-tools/teacher-workload-planner) applies this rule and prints a weekly plan, and the [Timetable Clash Checker](/free-tools/timetable-clash-checker) handles period-by-period cover.',
    },
  ],
  faqs: [
    { question: 'How many hours does a teacher work in a week?', answer: 'Teaching periods multiplied by period length, plus preparation, correction, meetings and duties. Record each part to see the real total.' },
    { question: 'How do we avoid always asking the same teachers to substitute?', answer: 'Use a written rule based on free periods and weekly load, and apply it the same way every day.' },
    { question: 'What workload limit should we set?', answer: 'That is your school’s policy. Set a limit for periods and for total hours, and review it each term.' },
    { question: 'Should teachers see the workload table?', answer: 'Sharing the rule and the anonymised table builds trust. Share links can replace names with stand-ins.' },
  ],
  sources: [],
  caseStudy: null,
};
