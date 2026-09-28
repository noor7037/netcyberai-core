// Illustrative demo data for the public website's product previews,
// charts, simulations and outcome dashboard.
//
// EVERYTHING in this file is fictional. It is NOT NetCyberAI performance
// data, it is not from any real school, and no number here is a claim
// about results. The founder removed the on-screen demo label (Decision
// Log C80); the Terms page and llms.txt state that it is example data, and the
// dashboard previews sit on a demo.netcyberai.com address. It sits in src/demo-fixture/ -- the
// single directory allowlisted by scripts/check_claims.py and CI's
// no-invented-data grep -- precisely so that fictional figures can never
// leak into ordinary marketing copy unlabelled.
//
// The interactive dashboard, teacher app and parent WhatsApp live in
// principal-dashboard.ts and role-apps.ts; this file feeds the smaller
// product screens on the catalog pages. One school throughout.

export const demoSchool = {
  name: 'Sunrise International',
  location: 'Palwal, Haryana',
};

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
