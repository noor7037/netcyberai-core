// Sample data for the two parent-home design mock-ups (src/app/(dev)/mock/parent-a, parent-b). Illustrative only:
// neutral labels, no real child, no real statistic. Never shown outside the development-only mock-up pages.
export const MOCK_SAMPLE_NOTICE = 'Sample data';

export type MockChild = {
  id: string;
  name: string;
  className: string;
  minutesToday: number;
  goalMinutes: number;
  streak: boolean[]; // last 7 days, oldest first
  streakDays: number;
  answersRight: number;
  topicsDone: number;
  tutorMinutes: number;
  weekMinutes: number[]; // Mon..Sun
  subjects: { name: string; pct: number; color: 'royal' | 'turquoise' | 'grape' | 'tangerine' }[];
  timeline: { icon: 'check' | 'book' | 'chat' | 'star' | 'flask'; text: string; when: string }[];
};

export const mockChildren: MockChild[] = [
  {
    id: 'c1',
    name: 'Child 1',
    className: 'Class 6',
    minutesToday: 24,
    goalMinutes: 30,
    streak: [true, true, false, true, true, true, true],
    streakDays: 4,
    answersRight: 18,
    topicsDone: 3,
    tutorMinutes: 9,
    weekMinutes: [20, 35, 0, 28, 30, 40, 24],
    subjects: [
      { name: 'Maths', pct: 72, color: 'royal' },
      { name: 'Science', pct: 58, color: 'turquoise' },
      { name: 'English', pct: 81, color: 'grape' },
      { name: 'Social science', pct: 40, color: 'tangerine' },
    ],
    timeline: [
      { icon: 'check', text: 'Finished a Fractions practice set', when: 'Today, 5:10 pm' },
      { icon: 'chat', text: 'Asked the tutor about plant cells', when: 'Today, 4:45 pm' },
      { icon: 'book', text: 'Read the lesson on Rivers', when: 'Yesterday' },
      { icon: 'star', text: 'Kept a 4-day learning streak', when: 'Yesterday' },
      { icon: 'flask', text: 'Tried the Light and Shadows lab', when: 'Tuesday' },
    ],
  },
  {
    id: 'c2',
    name: 'Child 2',
    className: 'Class 3',
    minutesToday: 12,
    goalMinutes: 20,
    streak: [true, false, true, true, false, true, true],
    streakDays: 2,
    answersRight: 11,
    topicsDone: 2,
    tutorMinutes: 4,
    weekMinutes: [15, 10, 20, 18, 0, 22, 12],
    subjects: [
      { name: 'Maths', pct: 64, color: 'royal' },
      { name: 'English', pct: 70, color: 'grape' },
      { name: 'Environment', pct: 52, color: 'turquoise' },
    ],
    timeline: [
      { icon: 'check', text: 'Finished a Counting practice set', when: 'Today, 4:30 pm' },
      { icon: 'book', text: 'Read a short English story', when: 'Today, 4:10 pm' },
      { icon: 'chat', text: 'Asked the tutor about animals', when: 'Yesterday' },
      { icon: 'star', text: 'Earned a star for 5 answers right', when: 'Yesterday' },
      { icon: 'flask', text: 'Tried the Shapes game', when: 'Tuesday' },
    ],
  },
];

export const mockNeedsYou = [
  { icon: 'link', title: 'Link your school', body: 'See fees, notices and attendance here.', cta: 'Link now', tone: 'action' },
  { icon: 'shield', title: 'Review privacy choices', body: 'Two settings are waiting for you.', cta: 'Review', tone: 'trust' },
  { icon: 'clock', title: 'Set a daily goal for Child 2', body: 'Pick minutes that suit your child.', cta: 'Set goal', tone: 'product' },
] as const;

export const mockDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
