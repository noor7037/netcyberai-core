// Illustrative demo data for the public website's product previews,
// charts, simulations and outcome dashboard.
//
// EVERYTHING in this file is fictional. It is NOT NetCyberAI performance
// data, it is not from any real school, and no number here is a claim
// about results. Every surface that renders it shows a visible
// "Demo school · fictional numbers" label (DemoLabel), and the
// dashboard previews sit on a demo.netcyberai.com address. It sits in src/demo-fixture/ -- the
// single directory allowlisted by scripts/check_claims.py and CI's
// no-invented-data grep -- precisely so that fictional figures can never
// leak into ordinary marketing copy unlabelled.
//
// It reuses the same fictional school as the /demo concept demo
// (sunrise-public-school.ts) so the whole site tells one story.

import { demoSchool } from './sunrise-public-school';

export const siteDemoSchool = demoSchool;

// ---- Charts ----------------------------------------------------------

export const attendanceTrend = {
  labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  thisWeek: [93, 95, 94, 96, 92, 95],
  lastWeek: [90, 91, 89, 92, 88, 90],
};

export const feeCollectionTrend = {
  // Rupees collected per month, in lakh.
  labels: ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
  values: [8.2, 6.9, 4.1, 9.4, 10.2, 11.6],
};

export const feeBuckets = [
  { label: 'Collected', value: 78 },
  { label: 'Due this week', value: 14 },
  { label: 'Overdue', value: 8 },
];

export const admissionsFunnel = [
  { label: 'Enquiries', value: 240 },
  { label: 'Campus visits', value: 132 },
  { label: 'Applications', value: 88 },
  { label: 'Admitted', value: 61 },
];

export const homeworkCompletion = [
  { label: '6A', value: 91 },
  { label: '6B', value: 84 },
  { label: '7A', value: 88 },
  { label: '7B', value: 79 },
  { label: '8A', value: 93 },
];

export const classPerformance = [
  { label: 'Maths', value: 72 },
  { label: 'Science', value: 78 },
  { label: 'English', value: 81 },
  { label: 'Hindi', value: 84 },
  { label: 'SST', value: 75 },
];

export const parentResponse = {
  labels: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'],
  read: [71, 76, 80, 83, 85, 88],
  replied: [18, 22, 27, 29, 33, 36],
};

export const schoolHealth = {
  score: 88,
  previous: 86,
  dimensions: [
    { label: 'Attendance', value: 95 },
    { label: 'Learning Pulse sent', value: 97 },
    { label: 'Homework updated', value: 89 },
    { label: 'Fee follow-ups closed', value: 82 },
    { label: 'Exceptions resolved', value: 90 },
  ],
};

export const teacherImpactSignals = [
  { label: 'Syllabus pace vs plan', value: 92 },
  { label: 'Pulse posted on time', value: 96 },
  { label: 'Homework reviewed', value: 88 },
  { label: 'Parent comprehension replies', value: 74 },
];

export const personalBest = {
  studentName: 'Fatima Khan',
  className: '8-A',
  subject: 'Maths',
  labels: ['Unit 1', 'Unit 2', 'Unit 3', 'Unit 4', 'Unit 5', 'Unit 6'],
  scores: [52, 55, 54, 61, 66, 71],
  baselineIndex: 0,
  personalBestIndex: 5,
  previousBest: 66,
};

export const learningGrowth = {
  labels: ['Term start', 'Wk 3', 'Wk 6', 'Wk 9', 'Wk 12'],
  classAverage: [61, 63, 66, 68, 71],
};

// ---- Outcome dashboard (illustrative only) ----------------------------

export const outcomeTiles = [
  { key: 'learning', title: 'Student learning growth', value: '+10 pts', detail: 'Class average, term start to week 12' },
  { key: 'parents', title: 'Parent engagement', value: '88%', detail: 'Daily Pulse read rate, week 6' },
  { key: 'fees', title: 'Fee operations', value: '₹11.6L', detail: 'Collected in September' },
  { key: 'results', title: 'School results', value: '78%', detail: 'Average Science score, Term 1' },
  { key: 'teachers', title: 'Teacher impact', value: '96%', detail: 'Pulses posted on time' },
  { key: 'admissions', title: 'Admissions', value: '61', detail: 'Admitted from 240 enquiries' },
] as const;

// ---- Live ecosystem simulation ----------------------------------------

export type EcoNode = 'principal' | 'admin' | 'teacher' | 'student' | 'parent' | 'finance' | 'core';

export interface EcoStep {
  from: EcoNode;
  to: EcoNode;
  title: string;
  detail: string;
  tone: 'trust' | 'product' | 'communication' | 'success' | 'intelligence' | 'action' | 'alert' | 'achievement';
  kpis: { present: string; notified: string; health: string; openExceptions: string };
}

export const ecosystemScript: EcoStep[] = [
  {
    from: 'teacher', to: 'core', tone: 'product',
    title: 'Teacher marks attendance',
    detail: 'Class 6A: 38 present, 2 absent, submitted from the Teacher Today screen.',
    kpis: { present: '38/40', notified: '0', health: '86', openExceptions: '0' },
  },
  {
    from: 'core', to: 'admin', tone: 'trust',
    title: 'Record validated and saved',
    detail: 'Portal-validated entry lands in the school record with an audit trail.',
    kpis: { present: '38/40', notified: '0', health: '86', openExceptions: '0' },
  },
  {
    from: 'core', to: 'student', tone: 'product',
    title: "Student status updates",
    detail: "Aarav's attendance for today changes to Absent on his profile.",
    kpis: { present: '38/40', notified: '0', health: '86', openExceptions: '0' },
  },
  {
    from: 'core', to: 'parent', tone: 'communication',
    title: 'Parent notified on WhatsApp',
    detail: '"Aarav was marked absent in Class 6A today." Sent only with consent, inside quiet hours rules.',
    kpis: { present: '38/40', notified: '2', health: '86', openExceptions: '0' },
  },
  {
    from: 'parent', to: 'core', tone: 'communication',
    title: 'Parent replies',
    detail: '"He has fever, will be back Monday." The reply is attached to the attendance record.',
    kpis: { present: '38/40', notified: '2', health: '86', openExceptions: '0' },
  },
  {
    from: 'core', to: 'principal', tone: 'trust',
    title: 'Principal dashboard updates',
    detail: 'Attendance today: 95% across the school. Class 6A marked on time.',
    kpis: { present: '38/40', notified: '2', health: '87', openExceptions: '0' },
  },
  {
    from: 'core', to: 'core', tone: 'alert',
    title: 'Exception detected',
    detail: 'Riya (6A) absent 3 days in a row with no reason recorded.',
    kpis: { present: '38/40', notified: '2', health: '85', openExceptions: '1' },
  },
  {
    from: 'core', to: 'teacher', tone: 'action',
    title: 'Task assigned to the class teacher',
    detail: '"Call Riya\'s guardian today." Visible on the teacher\'s Today list and to the principal.',
    kpis: { present: '38/40', notified: '2', health: '85', openExceptions: '1' },
  },
  {
    from: 'teacher', to: 'core', tone: 'success',
    title: 'Resolved and verified',
    detail: 'Guardian reached; medical leave recorded. The exception closes with a note.',
    kpis: { present: '38/40', notified: '2', health: '88', openExceptions: '0' },
  },
  {
    from: 'core', to: 'principal', tone: 'achievement',
    title: 'School health updates',
    detail: 'Health score 86 to 88. No open exceptions at end of day.',
    kpis: { present: '38/40', notified: '2', health: '88', openExceptions: '0' },
  },
];

// ---- Role explorer ------------------------------------------------------

export const roleKpis = {
  principal: { label: 'School health today', value: '88 / 100' },
  admin: { label: 'Records updated today', value: '146' },
  teacher: { label: 'Classes marked on time', value: '5 of 5' },
  student: { label: 'Maths, Unit 6', value: 'Personal Best: 71' },
  parent: { label: 'Updates this week', value: '6 Pulses' },
  finance: { label: 'Collected this month', value: '₹11.6L' },
} as const;

// ---- Screens ------------------------------------------------------------

export const principalTiles = [
  { label: 'Students', value: '1,240' },
  { label: 'Present today', value: '95%' },
  { label: 'Fees collected', value: '78%' },
  { label: 'Open exceptions', value: '3' },
];

export const exceptionsList = [
  { title: 'Riya (6A) absent 3 days, no reason', owner: 'Class teacher', status: 'open' as const },
  { title: 'Homework not updated, 7B Science', owner: 'Subject teacher', status: 'open' as const },
  { title: 'Fee follow-up, 12 families overdue', owner: 'Accounts', status: 'in_progress' as const },
  { title: 'Pulse pending, 8A Hindi', owner: 'Subject teacher', status: 'resolved' as const },
];

export const teacherToday = {
  name: 'Anjali Mehta',
  schedule: [
    { time: '08:40', label: '6A Science', status: 'done' as const },
    { time: '09:30', label: '7B Science', status: 'now' as const },
    { time: '11:10', label: '8A Science', status: 'next' as const },
    { time: '12:00', label: '6B Science', status: 'next' as const },
  ],
  roster: [
    { name: 'Aarav', present: false },
    { name: 'Ananya', present: true },
    { name: 'Bhavya', present: true },
    { name: 'Dev', present: true },
    { name: 'Ishaan', present: true },
    { name: 'Kabir', present: true },
    { name: 'Meera', present: true },
    { name: 'Riya', present: false },
    { name: 'Sara', present: true },
    { name: 'Tanvi', present: true },
    { name: 'Vihaan', present: true },
    { name: 'Zoya', present: true },
  ],
};

export const pulseToday = {
  className: 'Class 6A',
  date: 'Thursday',
  taught: 'Science: How plants make food (photosynthesis), with a leaf experiment.',
  homework: 'Draw and label a leaf. Due Monday.',
  attendance: 'Aarav was present today.',
  note: 'Science fair registration closes Friday.',
  askAtHome: 'Ask: why do leaves need sunlight?',
  parentReply: 'Thank you! He explained the experiment at dinner.',
  replyTiers: ['Samajh nahi aaya', 'Thoda samjha', 'Achhe se samjha'],
};

export const financeSummary = {
  collectedThisMonth: '₹11.6L',
  dueThisWeek: '₹2.1L',
  overdueFamilies: '12',
  remindersSent: '46',
  receiptsIssued: '212',
};

export const feeFlowSteps = [
  { title: 'Fee falls due', detail: 'Tuition, Q2 · ₹5,400' },
  { title: 'WhatsApp reminder', detail: 'D-3 with a UPI link' },
  { title: 'Parent pays via UPI', detail: 'Reference auto-matched' },
  { title: 'Receipt sent', detail: 'PDF on WhatsApp' },
  { title: 'Dashboard updates', detail: 'Collected 78% of term' },
];

export const admissionsBoard = [
  { stage: 'Enquiry', items: ['Kiara M. · Class 1', 'Arjun P. · Class 6'] },
  { stage: 'Campus visit', items: ['Neel S. · Class 3'] },
  { stage: 'Application', items: ['Myra K. · Class 1', 'Ved R. · Class 9'] },
  { stage: 'Admitted', items: ['Aadya J. · Class 2'] },
];

export const homeworkBoard = [
  { title: 'Leaf diagram', className: '6A Science', done: 34, total: 40 },
  { title: 'Fractions worksheet', className: '7B Maths', done: 29, total: 38 },
  { title: 'Essay: My school', className: '8A English', done: 36, total: 39 },
];

export const examResults = [
  { name: 'Aarav', marks: 78 },
  { name: 'Ananya', marks: 91 },
  { name: 'Dev', marks: 66 },
  { name: 'Meera', marks: 84 },
  { name: 'Riya', marks: 59 },
];

export const certificateSteps = [
  { title: 'Request', detail: 'Transfer Certificate for Rohan K.' },
  { title: 'Financial clearance', detail: 'Dues cleared, or a formal waiver recorded' },
  { title: 'Generated', detail: 'Principal-approved PDF' },
  { title: 'Sent on WhatsApp', detail: 'To the verified guardian number' },
  { title: 'Audit record', detail: 'Who approved, when, which version' },
];

export const complianceLedger = [
  { purpose: 'Core records', status: 'Consented', when: '12 Aug' },
  { purpose: 'WhatsApp updates', status: 'Consented', when: '12 Aug' },
  { purpose: 'Photos in newsletter', status: 'Declined', when: '14 Aug' },
];

export const dayTimeline = [
  { time: '08:30', title: 'Attendance', detail: 'Teacher opens Today and marks 6A in under a minute. Absences flow straight to the record.' },
  { time: '09:30', title: 'Teacher activity', detail: 'The lesson and a leaf experiment are logged against the syllabus plan.' },
  { time: '15:30', title: 'Daily Learning Pulse', detail: 'Built from verified class activity, the Pulse reaches every consenting parent on WhatsApp.' },
  { time: '16:00', title: 'Parent communication', detail: 'Parents reply with a tap. Teachers see who understood, and who needs a call.' },
  { time: '16:30', title: 'Fee and operations alert', detail: 'Twelve families cross their due date. Reminders go out with a UPI link; accounts sees the list.' },
  { time: '17:00', title: 'Principal dashboard', detail: 'Attendance, Pulse coverage and open exceptions in one view, without asking anyone.' },
  { time: '17:15', title: 'Personal Best', detail: "Fatima's Maths score beats her own previous best. A badge and certificate are prepared." },
  { time: '18:00', title: 'School health', detail: 'End of day: health 88, every exception closed or owned, tomorrow ready.' },
];

export const pulseReplies = {
  read: 34,
  of: 40,
  tiers: [
    { label: 'Achhe se samjha', value: 24 },
    { label: 'Thoda samjha', value: 7 },
    { label: 'Samajh nahi aaya', value: 3 },
  ],
  messages: [
    { from: 'Parent of Aarav', text: 'He explained the leaf experiment at dinner.' },
    { from: 'Parent of Riya', text: 'She was unwell; can you share the homework again?' },
  ],
};

// ---- Homepage hero dashboard ----------------------------------------------
// One school morning for the fictional Sunrise Public School. Class-band
// attendance, fee split and Pulse replies are internally consistent:
// 1,180 of 1,240 present; fee buckets sum to 100; replies sum to the class.

export const heroDashboard = {
  greeting: 'Good morning, Principal',
  date: 'Thursday, 24 September',
  kpis: [
    { label: 'Students', value: '1,240', note: '13 classes' },
    { label: 'Present today', value: '95.2%', note: '1,180 of 1,240' },
    { label: 'Fees collected', value: '78%', note: 'This term' },
    { label: 'Needs an owner', value: '3', note: 'Open exceptions' },
  ],
  attendanceBands: [
    { band: 'K–5', value: 95.8, note: 'Steady' },
    { band: '6–8', value: 92.3, note: 'Class 6 needs review' },
    { band: '9–12', value: 94.0, note: 'Class 9 early signal' },
  ],
  fees: {
    collected: 78,
    buckets: [
      { label: 'Paid on time', share: 65, amount: '₹12.4L' },
      { label: 'Paid late', share: 22, amount: '₹3.6L' },
      { label: 'Overdue', share: 13, amount: '₹1.9L' },
    ],
    reminder: '18 families reminded on WhatsApp today',
  },
  learning: {
    title: 'Class 6A · Maths · Fractions',
    replies: [
      { label: 'Achhe se samjha', count: 21 },
      { label: 'Thoda samjha', count: 9 },
      { label: 'Samajh nahi aaya', count: 3 },
    ],
    followUp: 'Revision on Friday, assigned to Ms Priya Mehta',
  },
  exceptions: [
    { title: 'Riya (6A) absent 3 days, no reason given', owner: 'Class teacher', status: 'open' as const },
    { title: '12 fee reminders unanswered for 7+ days', owner: 'Accounts', status: 'in_progress' as const },
    { title: 'Pulse not sent: 8A Hindi', owner: 'Subject teacher', status: 'open' as const },
  ],
  toasts: {
    attendance: '6A attendance saved · 08:52',
    fee: '₹8,400 received · receipt sent on WhatsApp',
    personalBest: 'New Personal Best · Aarav, Maths',
  },
};

// ---- Homepage WhatsApp showcase -------------------------------------------
// One parent's week, in the order it happens. Reply tiers match the real
// pulse_response_log.tier (1..3) and messages are English + Roman-script
// Hinglish, matching pulse_messages.body_hinglish. Recognition is
// Personal Best (a child against their own past), never a class rank.

export type ChatItem =
  | { id: string; kind: 'day'; text: string }
  | { id: string; kind: 'pulse'; time: string; greeting: string; hinglish: string; subjects: { subject: string; teacher: string; ask: string; askHinglish: string }[]; prompt: string; tiers: string[] }
  | { id: string; kind: 'in'; time: string; badge?: string; text: string; hinglish?: string; attachment?: string; actions?: string[] }
  | { id: string; kind: 'out'; time: string; text: string };

export const whatsappStory: { child: string; parent: string; className: string; items: ChatItem[] } = {
  child: 'Rahul',
  parent: 'Sharma ji',
  className: 'Class 5',
  items: [
    { id: 'day-1', kind: 'day', text: 'Today' },
    {
      id: 'pulse',
      kind: 'pulse',
      time: '6:30 pm',
      greeting: 'Namaste Sharma ji! Here is what Rahul learned in school today.',
      hinglish: 'Aaj Rahul ne school mein yeh seekha. Dinner ke time 5 minute baat kijiye.',
      subjects: [
        { subject: 'Maths · Fractions', teacher: 'Priya Mehta', ask: 'Which is bigger, 3/4 or 5/8? Ask Rahul to explain why.', askHinglish: '3/4 aur 5/8 mein bada kaun? Wajah poochhiye.' },
        { subject: 'English · The Rainbow', teacher: 'Arjun Malik', ask: 'What do we need to see a rainbow?', askHinglish: 'Rainbow dekhne ke liye kya chahiye?' },
        { subject: 'EVS · Journey of a River', teacher: 'Ritu Gupta', ask: 'Name one way a river helps people.', askHinglish: 'Nadi logon ki madad kaise karti hai?' },
      ],
      prompt: 'Rahul ne aaj kitna samjha? Tap one:',
      tiers: ['Achhe se samjha', 'Thoda samjha', 'Samajh nahi aaya'],
    },
    { id: 'reply', kind: 'out', time: '8:05 pm', text: 'Thoda samjha. Fractions mein thodi dikkat hai.' },
    {
      id: 'recorded',
      kind: 'in',
      time: '8:05 pm',
      badge: 'Response recorded',
      text: 'Thank you, Sharma ji. Fractions is marked for a short revision with Priya Ma’am on Friday.',
      hinglish: 'Shukriya! Friday ko Fractions dobara karwaya jayega.',
    },
    { id: 'day-2', kind: 'day', text: 'Friday' },
    {
      id: 'followup',
      kind: 'in',
      time: '4:10 pm',
      badge: 'Teacher follow-up',
      text: 'Priya Ma’am: We revised Fractions in small groups today. Rahul solved 4 of 5 practice questions on his own.',
    },
    {
      id: 'homework',
      kind: 'in',
      time: '6:00 pm',
      badge: 'Homework reminder',
      text: 'The Maths worksheet (8 questions) given on Thursday is still pending.',
      hinglish: 'Maths worksheet abhi baaki hai. Aaj raat check kar lijiye.',
      actions: ['Will complete tonight', 'Need help'],
    },
    { id: 'homework-reply', kind: 'out', time: '6:12 pm', text: 'Will complete tonight.' },
    { id: 'day-3', kind: 'day', text: 'Monday' },
    {
      id: 'fee',
      kind: 'in',
      time: '10:00 am',
      badge: 'Fee reminder',
      text: 'The September fee of ₹8,400 for Rahul is due on 10 October. You can pay securely by UPI.',
      actions: ['Pay by UPI', 'View details'],
    },
    {
      id: 'receipt',
      kind: 'in',
      time: '10:14 am',
      badge: 'Payment received',
      text: 'Thank you, Sharma ji. We received ₹8,400. Your receipt is attached.',
      attachment: 'Receipt_September_Rahul.pdf',
    },
    {
      id: 'personal-best',
      kind: 'in',
      time: '5:30 pm',
      badge: 'Personal Best',
      text: 'Rahul reached a Personal Best in Maths: 18 out of 20 in the Fractions check, up from 14 last month. Please congratulate him at home!',
      hinglish: 'Rahul ne apna best score banaya hai. Ghar par zaroor shabaashi dijiye!',
      attachment: 'Personal_Best_Certificate.pdf',
    },
  ],
};
