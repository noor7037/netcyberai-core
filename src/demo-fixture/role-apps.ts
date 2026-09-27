// Fictional data for the website's teacher app and parent WhatsApp
// mockups, and for the homepage WhatsApp feed. Same demo school as
// principal-dashboard.ts. Nothing here is real and nothing is sent.
//
// Constitution rules applied: parents are reached on WhatsApp only (no
// parent app or portal, C13); reply tiers are the three stored in
// pulse_response_log.tier; Hinglish is Roman script; recognition is
// Personal Best, never a class rank shown to a parent.

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

// ---- Parent on WhatsApp -------------------------------------------------------

export type ParentChildId = 'rahul' | 'meera';

export const PARENT = { name: 'Sharma ji', school: 'Sunrise International' };

export const CHILDREN: Record<ParentChildId, { name: string; cls: string; teacher: string }> = {
  rahul: { name: 'Rahul', cls: 'Class 5', teacher: 'Priya Mehta' },
  meera: { name: 'Meera', cls: 'Class 1', teacher: 'Neha Verma' },
};

export type ParentMenuId = 'attendance' | 'homework' | 'marks' | 'fees' | 'receipts' | 'ptm' | 'notices' | 'teacher' | 'complaint' | 'documents' | 'consent';

export const PARENT_MENU: { id: ParentMenuId; label: string; hint: string; icon: IconName }[] = [
  { id: 'attendance', label: 'Attendance', hint: 'This month, day by day', icon: 'attendance' },
  { id: 'homework', label: 'Homework', hint: 'Due and pending', icon: 'homework' },
  { id: 'marks', label: 'Marks & Personal Best', hint: 'Latest tests', icon: 'trophy' },
  { id: 'fees', label: 'Fees & payment', hint: 'Dues and UPI link', icon: 'fees' },
  { id: 'receipts', label: 'Receipts', hint: 'Past payments', icon: 'certificate' },
  { id: 'ptm', label: 'Book PTM slot', hint: 'Meet the class teacher', icon: 'users' },
  { id: 'notices', label: 'Notices & events', hint: 'Circulars, holidays', icon: 'bell' },
  { id: 'teacher', label: 'Message a teacher', hint: 'Reaches the class teacher', icon: 'chat' },
  { id: 'complaint', label: 'Raise a concern', hint: 'Tracked until resolved', icon: 'alert' },
  { id: 'documents', label: 'Documents', hint: 'Certificates, ID card', icon: 'exams' },
  { id: 'consent', label: 'Consent & preferences', hint: 'Language, what you receive', icon: 'shield' },
];

// What the school's WhatsApp replies for each menu choice, per child.
export const PARENT_REPLIES: Record<ParentChildId, Record<ParentMenuId, { title: string; lines: string[]; buttons?: string[] }>> = {
  rahul: {
    attendance: { title: 'Rahul · Attendance, September', lines: ['Present 19 of 20 school days (95%).', 'Absent: Mon 15 Sep (fever, informed by you).', 'Arrived late: none.'] },
    homework: { title: 'Rahul · Homework', lines: ['Maths · Fractions worksheet (8 questions) · due Friday · pending', 'English · Rainbow poem, 5 lines · submitted', 'EVS · River diagram · due Monday'], buttons: ['Will complete tonight', 'Need help'] },
    marks: { title: 'Rahul · Latest tests', lines: ['Maths · Fractions check: 18/20 · Personal Best (up from 14)', 'English · Reading: 16/20', 'EVS · Rivers quiz: 17/20'] },
    fees: { title: 'Rahul · Fees', lines: ['September fee: ₹8,400 · due 10 Oct', 'Paid this session: ₹25,200'], buttons: ['Pay by UPI', 'View breakup'] },
    receipts: { title: 'Rahul · Receipts', lines: ['Aug fee · ₹8,400 · 06 Aug · Receipt_Aug_Rahul.pdf', 'Jul fee · ₹8,400 · 05 Jul · Receipt_Jul_Rahul.pdf'] },
    ptm: { title: 'PTM · Sat 26 Sep with Priya Mehta', lines: ['Choose a 10-minute slot.'], buttons: ['10:20 am', '10:50 am', '11:30 am'] },
    notices: { title: 'Notices & events', lines: ['26 Sep · Parent-Teacher Meeting', '28 Sep · Science Exhibition (Classes 6–10)', '02 Oct · Holiday · Gandhi Jayanti'] },
    teacher: { title: 'Message Priya Mehta (class teacher)', lines: ['Type your message below. It reaches the class teacher, who replies in school hours.'] },
    complaint: { title: 'Raise a concern', lines: ['Choose a topic. You get a reference number and updates here until it is resolved.'], buttons: ['Transport', 'Academics', 'Fees', 'Other'] },
    documents: { title: 'Rahul · Documents', lines: ['ID card (QR) · ready', 'Bonafide certificate · request', 'Report card Term 1 · after results'], buttons: ['Request bonafide'] },
    consent: { title: 'Consent & preferences', lines: ['Language: English + Hinglish', 'Daily Learning Pulse: on', 'Fee reminders: on', 'You can change or withdraw consent at any time.'], buttons: ['Change language', 'Pause Daily Pulse'] },
  },
  meera: {
    attendance: { title: 'Meera · Attendance, September', lines: ['Present 20 of 20 school days (100%).', 'Well done, Meera!'] },
    homework: { title: 'Meera · Homework', lines: ['Hindi · Varnamala practice · submitted', 'Maths · Count and colour · due Friday'] },
    marks: { title: 'Meera · Latest activities', lines: ['Reading aloud: confident', 'Numbers 1–50: Personal Best, all correct'] },
    fees: { title: 'Meera · Fees', lines: ['September fee: ₹6,200 · paid on 04 Sep. Nothing due.'] },
    receipts: { title: 'Meera · Receipts', lines: ['Sep fee · ₹6,200 · 04 Sep · Receipt_Sep_Meera.pdf'] },
    ptm: { title: 'PTM · Sat 26 Sep with Neha Verma', lines: ['Choose a 10-minute slot.'], buttons: ['09:30 am', '10:00 am'] },
    notices: { title: 'Notices & events', lines: ['26 Sep · Parent-Teacher Meeting', '02 Oct · Holiday · Gandhi Jayanti'] },
    teacher: { title: 'Message Neha Verma (class teacher)', lines: ['Type your message below. It reaches the class teacher, who replies in school hours.'] },
    complaint: { title: 'Raise a concern', lines: ['Choose a topic. You get a reference number and updates here until it is resolved.'], buttons: ['Transport', 'Academics', 'Fees', 'Other'] },
    documents: { title: 'Meera · Documents', lines: ['ID card (QR) · ready'] },
    consent: { title: 'Consent & preferences', lines: ['Language: English + Hinglish', 'Daily Learning Pulse: on', 'Fee reminders: on'], buttons: ['Change language'] },
  },
};

// Follow-ups when the parent taps a reply button.
export const PARENT_BUTTON_REPLIES: Record<string, string> = {
  'Will complete tonight': 'Thank you. The teacher can see that you acknowledged it.',
  'Need help': 'Noted. Priya Ma’am will send one worked example tomorrow.',
  'Pay by UPI': 'Payment of ₹8,400 received. Receipt_September_Rahul.pdf is attached.',
  'View breakup': 'Tuition ₹7,200 · Activities ₹700 · Computer lab ₹500.',
  'Request bonafide': 'Request CR-2291 created. The office will share the certificate here.',
  'Change language': 'Choose: English + Hinglish · English only · Hindi (Roman).',
  'Pause Daily Pulse': 'Daily Pulse paused. Attendance and fee messages continue.',
};

// ---- Homepage WhatsApp feed, per audience -----------------------------------------

export type Segment = 'parents' | 'teachers' | 'principal' | 'offline';

export type FeedMsg = { from: 'school' | 'user'; text: string; tag?: string; time: string };

export const SEGMENTS: {
  id: Segment;
  label: string;
  chatTitle: string;
  chatSub: string;
  feed: FeedMsg[];
  how: { title: string; body: string }[];
  status: string;
}[] = [
  {
    id: 'parents',
    label: 'Parents',
    chatTitle: 'Sunrise International',
    chatSub: 'School updates · Rahul, Class 5',
    feed: [
      { from: 'school', tag: 'Attendance', text: 'Rahul reached school at 8:02 am. Attendance marked present.', time: '8:05 am' },
      { from: 'school', tag: 'Daily Learning Pulse', text: 'Today Rahul learned comparing fractions in Maths. Ask him: which is bigger, 3/4 or 5/8? Aaj Rahul ne kitna samjha?', time: '6:30 pm' },
      { from: 'user', text: 'Thoda samjha', time: '8:05 pm' },
      { from: 'school', tag: 'Response recorded', text: 'Thank you, Sharma ji. Fractions is marked for revision with Priya Ma’am on Friday.', time: '8:05 pm' },
      { from: 'school', tag: 'Fee reminder', text: 'September fee ₹8,400 is due on 10 Oct. Pay securely by UPI from this chat.', time: 'Mon' },
      { from: 'school', tag: 'Personal Best', text: 'Rahul scored 18/20 in Fractions, up from 14. Please congratulate him at home!', time: 'Tue' },
    ],
    how: [
      { title: 'No app, no login', body: 'Updates arrive from the school’s own WhatsApp number, in English and Hinglish.' },
      { title: 'Reply in one tap', body: 'Three reply buttons tell the teacher how well the lesson landed at home.' },
      { title: 'Consent first', body: 'Only parents who agreed receive messages, and they can pause any time.' },
    ],
    status: 'Absence alerts are live today; the Daily Pulse, fees and Personal Best are in development.',
  },
  {
    id: 'teachers',
    label: 'Teachers',
    chatTitle: 'NetCyberAI · Staff',
    chatSub: 'Priya Mehta · Mathematics',
    feed: [
      { from: 'school', tag: 'Morning brief', text: '5 periods today. 10:20 you cover 9-B Science (Mrs Gupta on leave). 7 students in 6-A need the equivalent-fractions recap.', time: '7:45 am' },
      { from: 'school', tag: 'Reminder', text: 'Attendance for 6-A is not marked yet. Open the staff app to mark it in one screen.', time: '8:50 am' },
      { from: 'school', tag: 'Daily Pulse', text: 'What did you teach 6-A today? Pick the topic in the staff app; parents get the update at 6:30 pm.', time: '3:30 pm' },
      { from: 'user', text: 'Done: Comparing fractions', time: '3:34 pm' },
      { from: 'school', tag: 'Parent replies', text: '6-C: 9 parents said “Samajh nahi aaya” on Fractions. Suggested: 10-minute revision on Friday.', time: '9:00 pm' },
    ],
    how: [
      { title: 'One minute a day', body: 'Teachers mark attendance and “taught today” in the staff app. That is the only input asked of them.' },
      { title: 'Nudges, not paperwork', body: 'WhatsApp brings the morning brief, reminders and what parents said.' },
      { title: 'Private by default', body: 'A teacher’s Impact Card is seen only by the teacher and the principal. There is no public ranking.' },
    ],
    status: '“Taught today” and attendance marking are live in the staff app; staff WhatsApp nudges are planned.',
  },
  {
    id: 'principal',
    label: 'Principal',
    chatTitle: 'NetCyberAI · Principal',
    chatSub: 'Daily digest · Sunrise International',
    feed: [
      { from: 'school', tag: 'Morning digest', text: 'Present 1,180 of 1,240 (95.2%). Class 6 at 88%: 12 absent, 3 without a reason.', time: '9:15 am' },
      { from: 'school', tag: 'Needs an owner', text: '3 open exceptions: Riya (6-A) absent 3 days · 12 fee reminders unanswered · Pulse not sent for 8-A Hindi.', time: '9:16 am' },
      { from: 'user', text: 'Assign Riya to the class teacher', time: '9:20 am' },
      { from: 'school', tag: 'Assigned', text: 'Assigned to Priya Mehta. You will see it close in the dashboard.', time: '9:20 am' },
      { from: 'school', tag: 'Weekly Confidence Brief', text: 'Parents replied to 71% of Pulses this week. Maths Fractions needs the most support in Classes 5–6.', time: 'Sat' },
    ],
    how: [
      { title: 'The whole school in one message', body: 'A short digest each morning; the dashboard holds the detail.' },
      { title: 'Every problem gets an owner', body: 'Exceptions are assigned to a person and tracked until they close.' },
      { title: 'Full dashboard below', body: 'Explore every module the principal uses in the preview on this page.' },
    ],
    status: 'The principal dashboard is live for attendance and students; the WhatsApp digest is planned.',
  },
  {
    id: 'offline',
    label: 'Non-users',
    chatTitle: 'Sunrise International · Office',
    chatSub: 'Families not on WhatsApp',
    feed: [
      { from: 'school', tag: 'Not delivered', text: 'The absence alert for Kabir (6-A) could not be delivered: this family is not on WhatsApp.', time: '9:10 am' },
      { from: 'school', tag: 'Office follow-up', text: 'Added to today’s call list for the front office, with the student, class and reason.', time: '9:10 am' },
      { from: 'user', text: 'Called. Kabir is unwell, back Monday.', time: '10:02 am' },
      { from: 'school', tag: 'Recorded', text: 'Reason saved to attendance. The class teacher can see it.', time: '10:02 am' },
    ],
    how: [
      { title: 'Nothing fails silently', body: 'If a message cannot reach a family, the school sees it instead of assuming it was read.' },
      { title: 'A person follows up', body: 'The office gets a short call list, so families without WhatsApp are never left out.' },
      { title: 'Paper still works', body: 'Printed notices and PTM slips continue for families who prefer them.' },
    ],
    status: 'Undelivered messages are logged today; the office call-list screen is in development.',
  },
];
