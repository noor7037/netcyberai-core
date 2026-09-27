// Fictional data for the website's teacher staff app preview. Same demo
// school as principal-dashboard.ts; the WhatsApp conversations live in
// whatsapp-chats.ts. Nothing here is real and nothing is sent.

import type { IconName } from '@/components/visual/Icons';

// ---- Teacher app --------------------------------------------------------------

export const TEACHER = {
  name: 'Priya Mehta',
  role: 'Mathematics · Class teacher 6-A',
  greeting: 'Good morning, Priya',
  date: 'Thursday, 24 Sep',
};

export const TEACHER_PERIODS: { time: string; cls: string; subject: string; note?: string; proxy?: boolean }[] = [
  { time: '08:40', cls: '6-A', subject: 'Mathematics', note: 'Fractions · comparing' },
  { time: '09:30', cls: '7-B', subject: 'Mathematics', note: 'Ratio · word problems' },
  { time: '10:20', cls: '9-B', subject: 'Science (cover)', note: 'Mrs Gupta on leave · free period match', proxy: true },
  { time: '11:30', cls: '6-C', subject: 'Mathematics', note: 'Fractions practice' },
  { time: '13:10', cls: '8-A', subject: 'Mathematics', note: 'Algebra · expressions' },
];

export const COPILOT_BRIEF = {
  cls: 'Class 6-A · Fractions',
  points: ['7 students missed the prerequisite (equivalent fractions)', '4 students ready for extension work', '2 students absent last lesson'],
  plan: [
    ['0–5', 'Recover prerequisite'],
    ['5–20', 'Core concept'],
    ['20–30', 'Guided practice'],
    ['30–36', 'Intervention group'],
    ['36–40', 'Exit check'],
  ] as [string, string][],
};

export const CLASS_ROSTER = ['Aarav S.', 'Diya K.', 'Ishaan P.', 'Kavya R.', 'Kabir M.', 'Myra J.', 'Riya T.', 'Arnav G.', 'Sara N.', 'Vivaan D.', 'Anika B.', 'Reyansh V.'];
export const ROSTER_ABSENT_DEFAULT = ['Riya T.'];

export const TEACHER_HOMEWORK = [
  { title: 'Fractions Practice', cls: '6-C', done: 26, total: 29, due: 'Today' },
  { title: 'Algebra Worksheet', cls: '8-A', done: 28, total: 32, due: 'Tomorrow' },
  { title: 'Comparing Fractions', cls: '6-A', done: 22, total: 31, due: 'Friday' },
];

export const MARKS_ENTRY: { name: string; best: number; mark: number }[] = [
  { name: 'Aarav S.', best: 14, mark: 18 },
  { name: 'Diya K.', best: 17, mark: 16 },
  { name: 'Ishaan P.', best: 12, mark: 15 },
  { name: 'Kavya R.', best: 19, mark: 19 },
  { name: 'Kabir M.', best: 11, mark: 10 },
  { name: 'Myra J.', best: 15, mark: 17 },
];

export const PULSE_TOPICS = ['Comparing fractions', 'Equivalent fractions', 'Fractions on a number line', 'Word problems'];

export const TEACHER_SIGNALS = [
  { name: 'Riya T. · 6-A', signal: 'Absent 3 days, no reason recorded', action: 'Call parent' },
  { name: 'Kabir M. · 6-A', signal: 'Homework missed 4 of last 6', action: 'Recovery plan' },
  { name: 'Class 6-C', signal: 'Parents replied “Samajh nahi aaya” ×9 on Fractions', action: 'Revise Friday' },
];

export const TEACHER_PTM = [
  { time: '10:00', parent: 'Rohit Sharma', child: 'Aarav · 6-A', state: 'Booked' },
  { time: '10:10', parent: 'Priya Kapoor', child: 'Diya · 6-A', state: 'Booked' },
  { time: '10:20', parent: '—', child: 'Open slot', state: 'Open' },
  { time: '10:30', parent: 'Ayesha Khan', child: 'Myra · 6-A', state: 'Booked' },
];

export const TEACHER_MESSAGES = [
  { from: 'Sharma ji (Aarav’s parent)', text: 'Aarav found the fractions homework hard. Can you share one more example?', when: '8:05 pm' },
  { from: 'Office', text: 'PTM slots for 6-A are published. 3 of 4 booked.', when: '9:10 am' },
];

export const TEACHER_MORE: { id: 'pulse' | 'copilot' | 'signals' | 'ptm' | 'leave' | 'messages' | 'impact'; label: string; icon: IconName }[] = [
  { id: 'pulse', label: 'Daily Pulse', icon: 'pulse' },
  { id: 'copilot', label: 'Teacher Copilot', icon: 'sparkle' },
  { id: 'signals', label: 'Early Warning', icon: 'alert' },
  { id: 'ptm', label: 'PTM slots', icon: 'users' },
  { id: 'leave', label: 'Leave & proxy', icon: 'operations' },
  { id: 'messages', label: 'Messages', icon: 'chat' },
  { id: 'impact', label: 'My Impact Card', icon: 'chart' },
];

// Private to the teacher and principal (Constitution: never a public
// teacher leaderboard).
export const IMPACT_CARD = [
  { label: 'Pulse sent on time', value: '96%' },
  { label: '“Achhe se samjha” replies', value: '71%' },
  { label: 'Topics revised after replies', value: '5' },
  { label: 'Personal Bests in my classes', value: '14' },
];
