// The founder's principal dashboard (NetCyberAI_Dashboard_Final_V2.html),
// reconciled into typed data. EVERYTHING here is fictional: a demo school,
// shown on the website under the "Demo school · fictional numbers" label.
// Nothing here calls an API or reaches a database.
//
// Every module, KPI, feature, record row, visual, dashboard panel and Add
// form field in the reference is carried over. The only departures are the
// recorded honesty and Constitution edits (Decision Log C74):
//   - No parent portal or parent app (C13): "portal" and "app" reach
//     become WhatsApp; the admin tech strip lists the real stack.
//   - Finance rows carry no academic labels ("topper", "Early Warning",
//     "Consistency Badge"); parent phone numbers are masked.
//   - Class toppers are shown as opt-in Top-3, never a public rank.
//   - No SLA figure (docs/13_LAUNCH_CHECKLIST.md row 2); no CRDT/Firebase/
//     Cloud SQL jargon (not this platform's stack).
//   - Reference typos and inconsistent counts are corrected (weekly
//     present counts never exceed the 1,240 enrolled).
// The MODULES block is generated from the reference by a script whose
// edit list matches the one above.

import type { IconName } from '@/components/visual/Icons';

export const SCHOOL = {
  name: 'Sunrise International',
  short: 'SI',
  sub: 'CBSE · Est. 2008 · 1,240 Students',
  user: { name: 'Admin Principal', initials: 'AP' },
  dateLine: 'Thursday 24 Sep 2026',
  sessionLine: 'School Admin · Thursday 24 Sep 2026 · Academic Session 2026–27',
};

export type ModuleId =
  | 'setup' | 'admissions' | 'students' | 'parents' | 'staff' | 'academics' | 'attendance' | 'timetable'
  | 'homework' | 'exams' | 'fees' | 'payroll' | 'communication' | 'events' | 'documents' | 'complaints'
  | 'reports' | 'learning-genome' | 'early-warning' | 'teacher-copilot' | 'school-auditor' | 'parent-ai'
  | 'recovery' | 'curriculum-gap' | 'automation' | 'career' | 'twin' | 'compliance' | 'pulse' | 'ptm'
  | 'proxy' | 'help-center' | 'raise-ticket';

export type PageId = 'dashboard' | ModuleId;

export interface ModuleDef {
  title: string;
  desc: string;
  kpis: string[];
  features: string[];
  rows: string[][];
}

// Badge colour families from the reference, mapped to semantic tones.
export type BadgeTone = 'neutral' | 'success' | 'alert' | 'action' | 'intelligence';

export interface NavItem {
  id: PageId | 'logout';
  label: string;
  icon: IconName;
  badge?: string;
  badgeTone?: BadgeTone;
}

export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  { title: 'Main', items: [{ id: 'dashboard', label: 'Dashboard', icon: 'principal' }] },
  {
    title: 'ERP Core · Day-to-Day Mandatory',
    items: [
      { id: 'setup', label: 'Setup', icon: 'school' },
      { id: 'admissions', label: 'Admissions', icon: 'admissions', badge: '124 new' },
      { id: 'students', label: 'Students', icon: 'student', badge: '1,240' },
      { id: 'parents', label: 'Parents', icon: 'parent', badge: '1,982' },
      { id: 'staff', label: 'Staff', icon: 'teacher', badge: '86' },
      { id: 'academics', label: 'Academics', icon: 'academics' },
      { id: 'attendance', label: 'Attendance', icon: 'attendance', badge: '95.2%', badgeTone: 'success' },
      { id: 'timetable', label: 'Timetable', icon: 'operations', badge: 'Proxy 7', badgeTone: 'intelligence' },
      { id: 'homework', label: 'Homework', icon: 'homework', badge: '38 photos' },
      { id: 'exams', label: 'Exams & Report Card', icon: 'exams' },
      { id: 'fees', label: 'Fees', icon: 'fees', badge: '77.5%', badgeTone: 'success' },
      { id: 'payroll', label: 'Payroll', icon: 'finance' },
      { id: 'communication', label: 'Communication', icon: 'chat', badge: '65.8%' },
      { id: 'events', label: 'Events', icon: 'sparkle' },
      { id: 'documents', label: 'Documents', icon: 'certificate' },
      { id: 'complaints', label: 'Complaints', icon: 'alert', badge: '3', badgeTone: 'alert' },
      { id: 'reports', label: 'Reports', icon: 'reports' },
    ],
  },
  {
    title: 'AI Education OS · NetCyberAI Core',
    items: [
      { id: 'learning-genome', label: 'Learning Genome', icon: 'core', badge: 'Graph', badgeTone: 'intelligence' },
      { id: 'early-warning', label: 'Early Warning', icon: 'alert', badge: '47 at-risk', badgeTone: 'alert' },
      { id: 'teacher-copilot', label: 'Teacher Copilot', icon: 'teacher', badge: 'Live', badgeTone: 'success' },
      { id: 'school-auditor', label: 'School Health Auditor', icon: 'school' },
      { id: 'parent-ai', label: 'Parent AI · What to Do?', icon: 'parent' },
      { id: 'recovery', label: 'Homework Recovery', icon: 'homework' },
      { id: 'curriculum-gap', label: 'Curriculum Gap Detector', icon: 'academics', badge: '7 flags' },
      { id: 'automation', label: 'Automation OS', icon: 'sparkle', badge: '9 agents', badgeTone: 'intelligence' },
      { id: 'career', label: 'Career Graph', icon: 'trophy' },
      { id: 'twin', label: 'Digital Twin', icon: 'chart', badge: 'Simulation' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { id: 'compliance', label: 'Compliance Pro · APAAR', icon: 'shield' },
      { id: 'pulse', label: 'Daily Pulse · Hinglish', icon: 'pulse', badge: '65.8%' },
      { id: 'ptm', label: 'PTM Scheduler', icon: 'users', badge: '412/520' },
      { id: 'proxy', label: 'Proxy Auto', icon: 'link', badge: '90 sec' },
    ],
  },
  {
    title: 'Support',
    items: [
      { id: 'help-center', label: 'Help Center', icon: 'support' },
      { id: 'raise-ticket', label: 'Raise Ticket', icon: 'mail', badge: 'New', badgeTone: 'action' },
      { id: 'logout', label: 'Logout', icon: 'lock' },
    ],
  },
];

// The real platform's stack, replacing the reference's tech strip.
export const TECH_STRIP = ['Next.js + TypeScript', 'PostgreSQL · Mumbai region', 'Row-level security per school', 'Audit trail', 'WhatsApp send-gate'];

// ---- Per-module signature visuals (reference moduleVisual) ------------------
// Each visual is a list of blocks. Levels 1..5 in a matrix are shades of
// one hue (sequential), never a rainbow.

export type VTone = 'success' | 'action' | 'alert' | 'intelligence' | 'communication' | 'product';

export type VisualBlock =
  | { t: 'funnel'; steps: string[] }
  | { t: 'bars'; values: number[]; labels?: string[]; tones?: VTone[] }
  | { t: 'boxes'; items: { label: string; value: string; note?: string; progress?: number }[] }
  | { t: 'skills'; rows: [string, number][] }
  | { t: 'matrix'; cells: number[]; cols?: number }
  | { t: 'ring'; segments: [number, VTone][]; value: string; label: string }
  | { t: 'timeline'; rows: [string, number][] }
  | { t: 'flow'; nodes: [string, string][]; breakAfter?: number }
  | { t: 'pills'; items: string[] }
  | { t: 'legend'; items: [string, VTone][] }
  | { t: 'schedule'; days: string[]; slots: { time: string; cells: string[] }[] }
  | { t: 'graph' }
  | { t: 'sims'; items: { title: string; sub: string; num: string; pct: number }[] }
  | { t: 'gauge'; value: number; label: string };

const pattern = (n: number, f: (i: number) => number) => Array.from({ length: n }, (_, i) => f(i));

export const VISUALS: Record<ModuleId, { title: string; blocks: VisualBlock[] }> = {
  setup: {
    title: 'Operational visual · School Setup',
    blocks: [
      { t: 'bars', values: [42, 55, 61, 70, 66, 78, 84] },
      { t: 'pills', items: ['Configuration linked', 'Workflow linked', 'Audit ready'] },
    ],
  },
  admissions: {
    title: 'Admissions funnel · live conversion path',
    blocks: [
      { t: 'funnel', steps: ['01 · Enquiries 184', '02 · Contacted 132', '03 · Applications 96', '04 · Interviews 18', '05 · Converted 61'] },
      { t: 'pills', items: ['66% conversion', '27 follow-ups today', '5-stage TC pipeline'] },
    ],
  },
  students: {
    title: 'Student population mix · class distribution',
    blocks: [
      { t: 'bars', values: [60, 82, 85, 90, 92, 95, 110, 105, 108, 115, 118, 92, 88], labels: ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] },
      {
        t: 'boxes',
        items: [
          { label: 'K–5', value: '504', note: '6 grades' },
          { label: '6–8', value: '323', note: '3 grades' },
          { label: '9–12', value: '413', note: '4 grades' },
          { label: 'Guardians', value: '1,982', note: '98.8% linked' },
        ],
      },
    ],
  },
  parents: {
    title: 'Family engagement · channel reach',
    blocks: [
      { t: 'skills', rows: [['WhatsApp', 92], ['Consent captured', 95], ['PTM', 79], ['Email', 64]] },
      { t: 'boxes', items: [{ label: 'Sibling graph', value: '312', note: 'Family relationships connected to student records' }] },
    ],
  },
  staff: {
    title: 'Teacher workload matrix · periods / week',
    blocks: [
      { t: 'matrix', cells: pattern(40, (i) => (i % 8 < 2 ? 1 : i % 8 < 4 ? 2 : i % 8 < 6 ? 3 : i % 8 === 6 ? 4 : 5)) },
      {
        t: 'boxes',
        items: [
          { label: 'Teaching', value: '18.4', note: 'avg periods' },
          { label: 'Free periods', value: '41', note: 'available' },
          { label: 'Leave', value: '4', note: 'today' },
          { label: 'Proxy', value: '7', note: 'slots' },
        ],
      },
    ],
  },
  academics: {
    title: 'Curriculum execution heatmap',
    blocks: [
      { t: 'matrix', cells: pattern(56, (i) => Math.min(5, Math.floor(i / 9) + 1)), cols: 14 },
      {
        t: 'boxes',
        items: [
          { label: 'Maths', value: '88%', note: 'coverage' },
          { label: 'Science', value: '81%', note: 'coverage' },
          { label: 'English', value: '84%', note: 'coverage' },
          { label: 'Objectives', value: '78%', note: 'met' },
        ],
      },
    ],
  },
  attendance: {
    title: 'Attendance command view · class bands + alerts',
    blocks: [
      {
        t: 'boxes',
        items: [
          { label: 'Overall', value: '95.2%', note: '1,180 present' },
          { label: 'Best class', value: '98%', note: 'Kindergarten' },
          { label: 'Watch', value: '88%', note: 'Class 6' },
          { label: 'Early warning', value: '47', note: 'Class 9 signal set' },
        ],
      },
      { t: 'bars', values: [98, 97, 96, 95, 95, 94, 88, 96, 93, 91, 96, 94, 95], labels: ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] },
    ],
  },
  timetable: {
    title: 'Weekly timetable · visual load map',
    blocks: [
      {
        t: 'schedule',
        days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        slots: ['09:00', '10:00', '11:00', '01:00', '02:00'].map((time, r) => ({
          time,
          cells: ['Maths', 'Science', 'English', 'History', r === 1 ? 'Proxy' : 'Lab'],
        })),
      },
    ],
  },
  homework: {
    title: 'Submission health · completion rings',
    blocks: [
      {
        t: 'boxes',
        items: [
          { label: 'Assigned', value: '312', note: 'this week' },
          { label: 'Submitted', value: '79.5%', note: '248 students' },
          { label: 'Review', value: '44', note: 'teacher queue' },
          { label: 'Overdue', value: '31', note: 'reminders' },
        ],
      },
      { t: 'ring', segments: [[79.5, 'success'], [10, 'action'], [10.5, 'alert']], value: '79.5%', label: 'Submitted' },
      { t: 'legend', items: [['Submitted', 'success'], ['Pending review', 'action'], ['Overdue', 'alert']] },
    ],
  },
  exams: {
    title: 'Exam processing pipeline',
    blocks: [
      { t: 'timeline', rows: [['Question bank', 100], ['Schedule', 100], ['Marks entry', 92], ['Approval', 78], ['Report cards', 71]] },
      { t: 'bars', values: [68, 74, 81, 86, 92, 88, 95] },
    ],
  },
  fees: {
    title: 'Cash collection mix · timing matters',
    blocks: [
      { t: 'ring', segments: [[65, 'success'], [22, 'action'], [13, 'alert']], value: '₹17.9L', label: 'tracked' },
      { t: 'bars', values: [65, 22, 13], labels: ['On time', 'Delayed', 'Defaulters'], tones: ['success', 'action', 'alert'] },
      { t: 'legend', items: [['On time 65%', 'success'], ['Delayed 22%', 'action'], ['Defaulters 13%', 'alert']] },
    ],
  },
  payroll: {
    title: 'Payroll composition · current cycle',
    blocks: [
      { t: 'boxes', items: [{ label: 'Net payable', value: '₹38.6L', note: '82 processed · 4 inputs pending', progress: 92 }] },
      { t: 'bars', values: [76, 54, 38, 24, 18] },
      {
        t: 'boxes',
        items: [
          { label: 'Teaching', value: '₹29.4L', note: '64 staff' },
          { label: 'Admin', value: '₹5.8L', note: '12 staff' },
          { label: 'Support', value: '₹3.4L', note: '10 staff' },
          { label: 'Advances', value: '₹1.8L', note: 'outstanding' },
        ],
      },
    ],
  },
  communication: {
    title: 'Communication channel health',
    blocks: [
      { t: 'skills', rows: [['WhatsApp', 95], ['SMS', 98], ['Email', 97], ['Staff app', 88]] },
      { t: 'boxes', items: [{ label: 'Engagement', value: '65.8%', note: 'Daily Pulse open rate' }] },
    ],
  },
  events: {
    title: 'Event calendar pressure + PTM booking',
    blocks: [
      { t: 'timeline', rows: [['PTM', 79], ['Science Exhibition', 74], ['English Essay', 61], ['Sports Day', 48], ['Mid Term', 33]] },
      { t: 'pills', items: ['412 / 520 PTM slots', '168 bookings', '5-min dossier'] },
    ],
  },
  documents: {
    title: 'Document production pipeline',
    blocks: [{ t: 'funnel', steps: ['Draft → 2,148', 'Generated → 1,842', 'Approval → 1,814', 'Published → 1,786'] }],
  },
  complaints: {
    title: 'Resolution target gauge',
    blocks: [
      { t: 'gauge', value: 92, label: 'within target' },
      {
        t: 'boxes',
        items: [
          { label: 'Open', value: '18', note: '4 high' },
          { label: 'Resolved', value: '73', note: 'this month' },
          { label: 'First response', value: '42m', note: 'median' },
          { label: 'Resolution', value: '7.4h', note: 'median' },
        ],
      },
    ],
  },
  compliance: {
    title: 'Governance control matrix',
    blocks: [
      { t: 'matrix', cells: pattern(32, (i) => (i % 4 === 0 ? 4 : i % 3 === 0 ? 3 : 2)) },
      {
        t: 'boxes',
        items: [
          { label: 'Consent', value: '95.4%', note: 'complete' },
          { label: 'Audit', value: '100%', note: 'logged' },
          { label: 'Backups', value: '31/31', note: 'verified' },
          { label: 'Exports', value: '32', note: 'checked' },
        ],
      },
    ],
  },
  pulse: {
    title: 'Daily Pulse reach · language-ready',
    blocks: [
      { t: 'ring', segments: [[65.8, 'communication'], [16.2, 'success'], [10, 'action'], [8, 'intelligence']], value: '65.8%', label: 'open rate' },
      { t: 'pills', items: ['WhatsApp 87%', '3 reply tiers', 'Hinglish', '8+ languages', 'Voice note ready'] },
    ],
  },
  ptm: {
    title: 'PTM slot occupancy',
    blocks: [
      { t: 'matrix', cells: pattern(40, (i) => (i < 31 ? 4 : i < 34 ? 3 : i < 38 ? 2 : 1)) },
      {
        t: 'boxes',
        items: [
          { label: 'Booked', value: '412', note: 'of 520' },
          { label: 'Utilization', value: '79%', note: 'school-wide' },
          { label: 'Dossiers', value: '5m', note: 'before slot' },
          { label: 'Feedback', value: '142', note: 'responses' },
        ],
      },
    ],
  },
  proxy: {
    title: 'Proxy agent flow · absence to published timetable',
    blocks: [
      { t: 'flow', nodes: [['01', 'Absence'], ['02', 'Match Subject'], ['03', 'Check Workload'], ['04', 'Approve'], ['05', 'Notify']] },
      { t: 'pills', items: ['90 sec target', '3 candidates', '<8s notify'] },
    ],
  },
  'learning-genome': { title: 'Knowledge graph · prerequisite chain', blocks: [{ t: 'graph' }] },
  'early-warning': {
    title: 'Early-warning matrix · observable signals',
    blocks: [
      {
        t: 'boxes',
        items: [
          { label: 'Academic', value: 'Watch', note: 'concept gaps' },
          { label: 'Engagement', value: 'High', note: '5-week decline' },
          { label: 'Attendance', value: 'Watch', note: 'below threshold' },
          { label: 'Signals', value: '47', note: 'human review' },
        ],
      },
      { t: 'timeline', rows: [['Participation', 84], ['Homework', 68], ['Attendance', 76], ['Concept mastery', 61]] },
    ],
  },
  'teacher-copilot': {
    title: 'Teacher Copilot · a 40-minute class plan',
    blocks: [
      { t: 'flow', nodes: [['0–5', 'Recover prerequisite'], ['5–20', 'Core concept'], ['20–30', 'Guided practice'], ['30–36', 'Intervention'], ['36–40', 'Exit check']] },
      { t: 'pills', items: ['7 prerequisite gaps', '4 advanced learners', '2 absent last lesson'] },
    ],
  },
  'school-auditor': {
    title: 'School health · eight operating dimensions',
    blocks: [
      {
        t: 'boxes',
        items: [
          ['Academic Progress', 78], ['Teacher Stability', 61], ['Engagement', 73], ['Parent Communication', 89],
          ['Infrastructure', 84], ['Gap Closure', 67], ['Attendance', 91], ['Curriculum Execution', 76],
        ].map(([label, v]) => ({ label: label as string, value: `${v}%`, progress: v as number })),
      },
    ],
  },
  'parent-ai': {
    title: 'Parent AI · evidence → action → result',
    blocks: [
      { t: 'flow', nodes: [['01', 'Recent data'], ['02', 'Find gap'], ['03', '10-min activity'], ['04', 'Result'], ['05', 'Teacher loop']] },
      {
        t: 'boxes',
        items: [
          { label: 'Guidance', value: '842', note: 'sessions' },
          { label: 'Homework', value: '62%', note: 'maths completion' },
          { label: 'Evidence', value: '3', note: 'recent signals' },
          { label: 'Human check', value: 'Required', note: 'when sensitive' },
        ],
      },
    ],
  },
  recovery: {
    title: 'Homework recovery timeline',
    blocks: [
      { t: 'timeline', rows: [['Missed lessons', 100], ['Prerequisites', 82], ['Micro-activity', 72], ['Practice', 64], ['Assessment', 48]] },
      { t: 'pills', items: ['31 plans', '4-day average', '82% completion'] },
    ],
  },
  'curriculum-gap': {
    title: 'Curriculum path · sequence break detection',
    blocks: [
      { t: 'flow', nodes: [['A', 'Curriculum'], ['B', 'Textbook'], ['C', 'Lesson gap'], ['D', 'Assessment'], ['E', 'Outcome']], breakAfter: 1 },
      { t: 'pills', items: ['7 gap flags', '318 lessons checked', '16 assessments linked'] },
    ],
  },
  automation: {
    title: 'Automation OS · agents with human approval',
    blocks: [
      { t: 'flow', nodes: [['01', 'Attendance anomaly'], ['02', 'Proxy finder'], ['03', 'Drafter'], ['04', 'Human review'], ['05', 'Sender'], ['06', 'Ledger']] },
      { t: 'pills', items: ['286 runs', '96% success', '14 approvals'] },
    ],
  },
  career: {
    title: 'Education-to-career graph',
    blocks: [
      { t: 'flow', nodes: [['01', 'Knowledge'], ['02', 'Skills'], ['03', 'Projects'], ['04', 'Evidence'], ['05', 'Pathway']] },
      {
        t: 'boxes',
        items: [
          { label: 'Python', value: '72%', note: 'Ishita Jain' },
          { label: 'Networking', value: '58%', note: 'Ayaan Khan' },
          { label: 'Evidence', value: '312', note: 'skill links' },
          { label: 'Coverage', value: '72%', note: 'graph mapped' },
        ],
      },
    ],
  },
  twin: {
    title: 'Digital twin · compare school scenarios',
    blocks: [
      {
        t: 'sims',
        items: [
          { title: 'Scenario A · Add Maths Teacher', sub: 'Grade 8 workload impact', num: '−16%', pct: 84 },
          { title: 'Scenario B · 60-min periods', sub: 'Whole-school timetable shift', num: '+8%', pct: 72 },
          { title: 'Scenario C · Remedial Period', sub: 'Intervention capacity', num: '+1 slot', pct: 65 },
          { title: 'Scenario D · Absence', sub: 'Substitute impact', num: '3 options', pct: 58 },
        ],
      },
    ],
  },
  reports: {
    title: 'Reporting cockpit · school intelligence',
    blocks: [
      {
        t: 'boxes',
        items: [
          ['Attendance', 95.2], ['Fees', 77.5], ['Homework', 79.5], ['Engagement', 65.8],
          ['Data Quality', 96.4], ['Complaint target', 92], ['Lesson Exec.', 91.8], ['PTM', 79],
        ].map(([label, v]) => ({ label: label as string, value: `${v}%`, progress: v as number })),
      },
    ],
  },
  'help-center': {
    title: 'Guided help map',
    blocks: [
      { t: 'flow', nodes: [['01', 'Setup'], ['02', 'Attendance'], ['03', 'Fees'], ['04', 'Admissions'], ['05', 'Exams']] },
      { t: 'pills', items: ['42 guides', '18 tutorials', '9 workflows'] },
    ],
  },
  'raise-ticket': {
    title: 'Support ticket queue · target routing',
    blocks: [
      { t: 'gauge', value: 92, label: 'within target' },
      { t: 'pills', items: ['3 open', '1 high priority', '8 resolved MTD'] },
    ],
  },
};

// Reference automation tab: the five governed steps every workflow runs.
export const WORKFLOW_STEPS = ['Capture', 'Validate', 'Analyse', 'Recommend', 'Approve'];

// ---- Dashboard home ---------------------------------------------------------

export const DASH_KPIS: { value: string; label: string; trend: string; tone: VTone; icon: IconName; trendAlert?: boolean }[] = [
  { value: '1,240', label: 'Total Students', trend: '↑ 5%', tone: 'product', icon: 'users' },
  { value: '1,180', label: 'Present Today', trend: '95%', tone: 'success', icon: 'check' },
  { value: '60', label: 'Absent Today', trend: '↑ 5%', tone: 'alert', icon: 'alert', trendAlert: true },
  { value: '86', label: 'Total Staff', trend: '↑ 2%', tone: 'intelligence', icon: 'teacher' },
];

const ATT_BAND_NOTES = [
  { band: 'K–5', note: 'Strong consistency' },
  { band: '6–8', note: 'Class 6 needs review' },
  { band: '9–12', note: 'Class 9 early signal' },
];

// Opt-in Top-3 (Constitution: recognition is Personal Best first; a class
// top-3 appears only where families opted in).
export const ATT_TOP3 = [
  { rank: 1, name: 'Ishita Jain', note: 'Class 10-A · 99%' },
  { rank: 2, name: 'Aaradhya Sharma', note: 'Kindergarten · 99%' },
  { rank: 3, name: 'Sanvi Kapoor', note: 'Class 12 · 99%' },
];

// Weekly present / absent for the demo school (1,240 enrolled).
export const ATT_WEEKS: Record<'This Week' | 'This Month' | 'Last Week', { day: string; present: number; absent: number }[]> = {
  'This Week': [
    { day: 'Mon', present: 1172, absent: 68 },
    { day: 'Tue', present: 1185, absent: 55 },
    { day: 'Wed', present: 1168, absent: 72 },
    { day: 'Thu', present: 1180, absent: 60 },
    { day: 'Fri', present: 1176, absent: 64 },
    { day: 'Sat', present: 1151, absent: 89 },
  ],
  'This Month': [
    { day: 'Mon', present: 1169, absent: 71 },
    { day: 'Tue', present: 1178, absent: 62 },
    { day: 'Wed', present: 1171, absent: 69 },
    { day: 'Thu', present: 1182, absent: 58 },
    { day: 'Fri', present: 1174, absent: 66 },
    { day: 'Sat', present: 1160, absent: 80 },
  ],
  'Last Week': [
    { day: 'Mon', present: 1161, absent: 79 },
    { day: 'Tue', present: 1170, absent: 70 },
    { day: 'Wed', present: 1158, absent: 82 },
    { day: 'Thu', present: 1175, absent: 65 },
    { day: 'Fri', present: 1166, absent: 74 },
    { day: 'Sat', present: 1142, absent: 98 },
  ],
};

// K–12 attendance, reference ATT_CLASS. Present counts sum to 1,180 / 1,240.
export const ATT_CLASS: { cls: string; total: number; top: string; notes?: string; present: number; status: string }[] = [
  { cls: 'K - Kindergarten', total: 60, top: 'Aaradhya Sharma · 99%', present: 59, status: 'Excellent' },
  { cls: 'Class 1', total: 82, top: 'Vivaan Patel · 98%', present: 80, status: 'Excellent' },
  { cls: 'Class 2', total: 85, top: 'Anaya Singh · 97%', present: 82, status: 'Good' },
  { cls: 'Class 3', total: 90, top: 'Reyansh Gupta · 96%', present: 87, status: 'Good' },
  { cls: 'Class 4', total: 92, top: 'Siya Mehta · 98%', notes: 'Personal Best', present: 88, status: 'Good' },
  { cls: 'Class 5', total: 95, top: 'Atharv Kumar · 97%', present: 90, status: 'Good' },
  { cls: 'Class 6', total: 110, top: 'Priya Verma · 96%', notes: '22% anomaly flagged · Mrs Gupta absent, 4th period free', present: 97, status: 'Needs attention' },
  { cls: 'Class 7', total: 105, top: 'Ayaan Khan · 98%', notes: 'Fractions 42% → recovery assigned', present: 102, status: 'Good' },
  { cls: 'Class 8', total: 108, top: 'Ananya Reddy · 97%', present: 102, status: 'Good' },
  { cls: 'Class 9', total: 115, top: 'Rahul Sharma · 95%', notes: 'Participation declined 5 weeks · Early Warning', present: 106, status: 'Watch' },
  { cls: 'Class 10', total: 118, top: 'Ishita Jain · 99%', notes: 'Career Graph · Python 72%', present: 114, status: 'Excellent' },
  { cls: 'Class 11', total: 92, top: 'Dev Malhotra · 98%', notes: 'Science Exhibition winner', present: 87, status: 'Good' },
  { cls: 'Class 12', total: 88, top: 'Sanvi Kapoor · 99%', notes: 'Career mentorship active', present: 86, status: 'Excellent' },
];

export function classPct(present: number, total: number): number {
  return Math.round((present / total) * 1000) / 10;
}

const BAND_OF = (i: number) => (i < 6 ? 'K–5' : i < 9 ? '6–8' : '9–12');

// Band figures are computed from ATT_CLASS, never typed separately.
export function attendanceBands() {
  return ATT_BAND_NOTES.map(({ band, note }) => {
    const rows = ATT_CLASS.filter((_, i) => BAND_OF(i) === band);
    const present = rows.reduce((a, r) => a + r.present, 0);
    const total = rows.reduce((a, r) => a + r.total, 0);
    return { band, note, pct: classPct(present, total) };
  });
}

export const FEE_SUMMARY = {
  collectedPct: 78,
  buckets: [
    { amount: '₹12.4L', label: 'On Time Paid', share: 65, note: 'On time or paid in advance', tone: 'success' as VTone },
    { amount: '₹3.6L', label: 'Delayed', share: 22, note: 'Reminder sent on WhatsApp', tone: 'action' as VTone },
    { amount: '₹1.9L', label: 'Defaulters', share: 13, note: 'Action required', tone: 'alert' as VTone },
  ],
  defaulterTitle: 'Defaulters · 13% · action required:',
  defaulterNote: '18 students · total ₹1.9L · WhatsApp reminder sent · payment → ledger → receipt PDF → WhatsApp',
};

// Parent numbers masked: the reference showed full numbers.
export const DELAYED_FEES = [
  { student: 'Aarav Sharma · Class 9-B', parent: 'Rajesh Sharma · 98765 •••••', amount: '₹2,400', note: '12 days delay · payment link sent' },
  { student: 'Priya Mehta · Class 6-A', parent: 'Sunita Mehta · 98765 •••••', amount: '₹8,400', note: '5 days delay · reminder 1 sent' },
  { student: 'Rahul Sharma · Class 9-B', parent: 'Sharma Ji · 98765 •••••', amount: '₹12,400', note: '8 days delay · call scheduled' },
  { student: 'Anaya Singh · Class 2', parent: 'Vikram Singh', amount: '₹1,200', note: '3 days delay · reminder 1 sent' },
];

export const ONTIME_FEES = [
  { student: 'Ishita Jain · Class 10', parent: 'Jain Family · paid 3 months in advance', amount: '₹42,400', note: 'Advance · receipt sent' },
  { student: 'Siya Mehta · Class 4', parent: 'Mehta Family · sibling 10% concession', amount: '₹38,160', note: 'Advance · receipt sent' },
  { student: 'Ayaan Khan · Class 7-B', parent: 'Khan Family · paid by UPI', amount: '₹38,000', note: 'On time · receipt sent' },
  { student: 'Vivaan Patel · Class 1', parent: 'Patel Family', amount: '₹36,000', note: 'On time · receipt sent' },
];

export const QUICK_ACTIONS: { label: string; icon: IconName; tone: VTone; action: 'add-student' | ModuleId }[] = [
  { label: 'Add Student', icon: 'student', tone: 'product', action: 'add-student' },
  { label: 'Collect Fees', icon: 'fees', tone: 'success', action: 'fees' },
  { label: 'Send Notice', icon: 'chat', tone: 'action', action: 'communication' },
  { label: 'Generate Report', icon: 'reports', tone: 'intelligence', action: 'reports' },
];

export const TIMETABLE_TODAY = [
  { time: '09:00 AM', subject: 'Mathematics', detail: 'Class 10 - A · Priya Mehta', status: 'Ongoing' },
  { time: '10:00 AM', subject: 'Science', detail: 'Class 9 - B · Mrs Gupta absent → proxy suggested, 3 same-subject teachers', status: '45 min' },
  { time: '11:00 AM', subject: 'English', detail: 'Class 8 - A · Arjun Malik', status: '1 hr 45 min' },
  { time: '01:00 PM', subject: 'Social Studies', detail: 'Class 7 - C · syllabus marked → Daily Pulse in Hinglish', status: '3 hr 45 min' },
];

export const EVENTS_UPCOMING: { title: string; detail: string; time: string; icon: IconName }[] = [
  { title: 'Parent-Teacher Meeting', detail: '26 Sep 2026 · 412 of 520 slots booked · dossier 5 min before', time: '10:00 AM', icon: 'users' },
  { title: 'Science Exhibition', detail: '28 Sep 2026 · Grades 6–10', time: '09:00 AM', icon: 'sparkle' },
  { title: 'English Essay (Term 1)', detail: '05 Oct 2026 · Siya Mehta · Personal Best', time: '09:00 AM', icon: 'homework' },
  { title: 'Sports Day', detail: '12 Oct 2026 · School-wide', time: '06:00 AM', icon: 'trophy' },
];

export type ActivityKind = 'Fees' | 'Admissions' | 'Staff' | 'Academics';
export const RECENT_ACTIVITY: { title: string; detail: string; when: string; kind: ActivityKind; icon: IconName }[] = [
  { title: 'New admission application', detail: 'Aarav Sharma · Class 9-B · Applied → Finance → Remarks → Ready → Signed', when: '10 min ago', kind: 'Admissions', icon: 'admissions' },
  { title: 'Fee payment received', detail: '₹25,000 · Class 8 · Ananya Reddy · payment verified → ledger → receipt on WhatsApp', when: '1 hour ago', kind: 'Fees', icon: 'fees' },
  { title: 'Leave applied', detail: 'Priya Mehta (Teacher) · Class 6-A · proxy found in 90 sec', when: '2 hours ago', kind: 'Staff', icon: 'teacher' },
  { title: 'Homework posted', detail: 'Class 6 · Mathematics · 38 photos queued · Fractions 42% → recovery', when: '3 hours ago', kind: 'Academics', icon: 'homework' },
  { title: 'Learning Genome updated', detail: 'Ayaan · 7-B · Fractions 42% → Ratio affected → Algebra future risk · 15-min recovery', when: '6 hours ago', kind: 'Academics', icon: 'core' },
];

// Reference ecosystem card + AI showcase.
export const ECO_SIGNALS: { label: string; value: string; note: string; tone: VTone }[] = [
  { label: 'Learning', value: '67%', note: 'Gap closure tracked across interventions', tone: 'intelligence' },
  { label: 'Teacher workload', value: '18.4', note: 'Average periods / week with automation support', tone: 'success' },
  { label: 'Fee recovery', value: '₹3.6L', note: 'Dues segmented into reminder + escalation actions', tone: 'action' },
  { label: 'Engagement', value: '65.8%', note: 'Daily Pulse open rate across parent channels', tone: 'communication' },
  { label: 'Attendance', value: '95.2%', note: 'Today’s school attendance with low-attendance alerts', tone: 'success' },
  { label: 'Automation', value: '286', note: 'Runs with human approval on sensitive actions', tone: 'intelligence' },
];

export const AI_CORE: { num: string; id: ModuleId; name: string; line: string; metric: string; rail: string; icon: IconName }[] = [
  { num: '01', id: 'learning-genome', name: 'Learning Genome', line: 'Knowledge graph + longitudinal learner model', metric: '6,840 concepts mapped', rail: 'Knowledge graph', icon: 'core' },
  { num: '02', id: 'early-warning', name: 'Early Warning', line: 'Observable signals before visible failure', metric: '47 signals to review', rail: 'Observable signals', icon: 'alert' },
  { num: '03', id: 'teacher-copilot', name: 'Teacher Copilot', line: 'Daily preparation + targeted intervention', metric: '18 intervention plans', rail: 'Daily class prep', icon: 'teacher' },
  { num: '04', id: 'school-auditor', name: 'School Health Auditor', line: 'Evidence-backed school improvement', metric: '8 dimensions tracked', rail: '8 dimensions', icon: 'school' },
  { num: '05', id: 'parent-ai', name: 'Parent AI', line: 'What should we do next?', metric: '842 guidance sessions', rail: 'What to do?', icon: 'parent' },
  { num: '06', id: 'recovery', name: 'Homework Recovery', line: 'Recover missed learning after absence', metric: '31 active plans', rail: 'Missed learning', icon: 'homework' },
  { num: '07', id: 'curriculum-gap', name: 'Curriculum Gap', line: 'Curriculum → lesson → assessment', metric: '7 gap flags', rail: 'Sequence intelligence', icon: 'academics' },
  { num: '08', id: 'automation', name: 'Automation OS', line: 'Agent workflow + human approval', metric: '9 operational agents', rail: '9 agents', icon: 'sparkle' },
  { num: '09', id: 'career', name: 'Career Graph', line: 'Skills + evidence + pathways', metric: '72% graph coverage', rail: 'Skills + evidence', icon: 'trophy' },
  { num: '10', id: 'twin', name: 'Digital Twin', line: 'Simulate staffing + outcomes', metric: '14 simulations', rail: 'Scenario simulation', icon: 'chart' },
];

export const AI_FLOW = ['ERP + Attendance', 'Evidence Graph', 'AI Intelligence', 'Human Review', 'Intervention', 'Outcome Feedback'];
export const AI_STATS = [
  { label: 'Students connected', value: '1,240' },
  { label: 'Staff workflows', value: '86' },
  { label: 'Parent reach', value: '65.8%' },
  { label: 'Automation runs', value: '286' },
];

export const TOP_NOTICES = {
  bell: '8 notifications · 3 fees · 2 admissions · 2 approvals',
  chat: '6 messages · 2 parent replies · 1 support ticket',
};

// ---- "+ Add" modal: six roles, every field from the reference ---------------

export type AddRole = 'student' | 'parent' | 'teacher' | 'staff' | 'admin' | 'other';

export type FieldDef =
  | { label: string; kind: 'text' | 'date' | 'email' | 'tel' | 'number'; required?: boolean; placeholder?: string }
  | { label: string; kind: 'select'; required?: boolean; options: string[] }
  | { label: string; kind: 'textarea' | 'file'; required?: boolean };

const t = (label: string, required = false, kind: 'text' | 'date' | 'email' | 'tel' | 'number' = 'text'): FieldDef => ({ label, kind, required });
const s = (label: string, options: string[], required = false): FieldDef => ({ label, kind: 'select', options, required });

export const ADD_ROLES: { id: AddRole; label: string; icon: IconName }[] = [
  { id: 'student', label: 'Student', icon: 'student' },
  { id: 'parent', label: 'Parent', icon: 'parent' },
  { id: 'teacher', label: 'Teacher', icon: 'teacher' },
  { id: 'staff', label: 'Staff', icon: 'users' },
  { id: 'admin', label: 'Admin', icon: 'admin' },
  { id: 'other', label: 'Other', icon: 'sparkle' },
];

export const ADD_FORMS: Record<AddRole, FieldDef[]> = {
  student: [
    t('First Name', true), t('Last Name', true), t('Date of Birth', true, 'date'),
    s('Gender', ['Male', 'Female', 'Prefer not to say']),
    t('Admission No.', true), t('Admission Date', false, 'date'),
    s('Class', ['Class 9 - B', 'Class 10 - A', 'Class 7 - B', 'Class 6 - A'], true),
    s('Section', ['B', 'A', 'C', 'D'], true), t('Roll No.', false, 'number'),
    s('House', ['Blue House', 'Green House', 'Orange House', 'Violet House']),
    t('Previous School'), s('Student Category', ['General', 'Scholarship', 'Sibling', 'Transfer']),
    t('Parent / Guardian Name', true), s('Relationship', ['Father', 'Mother', 'Guardian']),
    t('Primary Mobile', true, 'tel'), t('Email', false, 'email'), { label: 'Address', kind: 'textarea' },
    s('WhatsApp Message Language', ['English', 'Hindi', 'English + Hindi', 'Punjabi', 'Bengali', 'Marathi', 'Gujarati', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Odia', 'Urdu', 'Assamese'], true),
    s('Preferred Channel', ['WhatsApp', 'WhatsApp + Email', 'SMS', 'Phone call']),
    s('Fee Plan', ['Class 9 Annual · ₹92,400', 'Quarterly', 'Monthly']),
    s('Fee Status', ['On Time / Advanced Paid', 'Delayed', 'Defaulter']),
    s('Scholarship / Concession', ['None', 'Sibling 10%', 'Merit 15%']),
    s('Transport', ['Campus pickup · Route R-18', 'Parent drop', 'Not required']),
    { label: 'Documents', kind: 'file' },
  ],
  parent: [
    t('First Name', true), t('Last Name', true), s('Relationship', ['Father', 'Mother', 'Guardian']),
    t('Parent ID'), t('Primary Mobile', true, 'tel'), t('Alternate Mobile', false, 'tel'), t('Email', true, 'email'),
    t('Occupation'), s('Preferred Language', ['Hinglish + Hindi', 'English', 'Hindi']),
    s('Primary Student', ['Aarav Sharma · Class 9-B', 'Ayaan Khan · Class 7-B'], true),
    s('Additional Child 1', ['None', 'Siya Sharma · Class 4']), s('Additional Child 2', ['None', 'Meera Sharma · Class 1']),
    s('WhatsApp', ['Enabled · 87% preferred', 'Disabled']),
    s('WhatsApp Updates', ['Start after consent', 'Invite later']),
    s('WhatsApp Message Language', ['English', 'Hindi', 'English + Hindi', 'Punjabi', 'Bengali', 'Marathi', 'Gujarati', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Odia', 'Urdu', 'Assamese'], true),
    s('Consent', ['Communication consent captured', 'Pending consent']),
    { label: 'Address', kind: 'textarea' },
  ],
  teacher: [
    t('First Name', true), t('Last Name', true), t('Employee ID', true), t('Joining Date', true, 'date'),
    t('Date of Birth', false, 'date'), s('Gender', ['Female', 'Male', 'Prefer not to say']),
    t('Mobile', true, 'tel'), t('Email', true, 'email'),
    s('Department', ['Mathematics', 'Science', 'English', 'Languages', 'Computer Science'], true),
    s('Designation', ['PGT', 'TGT', 'PRT', 'Coordinator', 'HOD'], true),
    s('Employment Type', ['Full-time', 'Part-time', 'Contract']),
    s('Experience', ['8+ years', '5–8 years', '2–5 years', '0–2 years']),
    s('Primary Subject', ['Mathematics', 'Science', 'English', 'Computer Science'], true),
    s('Secondary Subject', ['None', 'Physics', 'Algebra Support', 'STEM Lab']),
    s('Primary Class', ['Class 6-A', 'Class 7-A', 'Class 8-B', 'Class 9-B'], true),
    t('Additional Classes'), t('Sections'), t('Periods / Week', false, 'number'), t('Free Periods', false, 'number'),
    s('Homeroom', ['Class 6-A', 'None']), s('Substitute Eligible', ['Yes · Same-subject priority', 'No']),
    s('Coordinator', ['Mrs. Kavita Shah', 'Academic Head']), s('Language Support', ['Hinglish + Hindi', 'English only']),
    s('Staff App Role', ['Teacher + Attendance + Marks', 'Teacher Limited', 'Coordinator']),
    t('Qualification'), t('Specialization'),
    s('Bank / Payroll', ['Payroll profile to be created', 'Existing employee']),
    s('Leave Policy', ['Teaching Staff Standard', 'Coordinator']),
    { label: 'Documents', kind: 'file' },
  ],
  staff: [
    t('First Name', true), t('Last Name', true), t('Employee ID', true), t('Joining Date', true, 'date'),
    s('Department', ['Administration', 'Accounts', 'Front Office', 'Library', 'IT'], true),
    t('Designation', true), t('Reporting Manager'),
    s('Shift', ['08:00 AM – 04:30 PM', '09:00 AM – 05:30 PM']),
    t('Mobile', true, 'tel'), t('Email', false, 'email'),
    t('Attendance'), t('Leave Request'),
    s('System Access', ['Operations + Reports', 'View Only', 'Custom']),
    s('Leave Type', ['Standard Staff', 'Contract Staff']), t('Leave Balance', false, 'number'),
    s('Payroll Profile', ['Create new', 'Existing']), s('Loan / Advance', ['None', 'Advance requested']),
    { label: 'Documents', kind: 'file' },
  ],
  admin: [
    t('First Name', true), t('Last Name', true), t('Admin / Employee ID', true),
    s('Designation', ['Admin Principal', 'Finance Admin', 'Admission Admin', 'Academic Coordinator'], true),
    s('School / Branch', ['Sunrise International · Main Campus', 'Sunrise International · Junior Campus']),
    t('Mobile', true, 'tel'), t('Email', true, 'email'),
    s('Approval Level', ['Level 3 · Principal', 'Level 2 · Department', 'Level 1 · Operational']),
    s('Permission Profile', ['Full School Access', 'Finance + Reports', 'Admissions + Students', 'Academics + Attendance'], true),
    s('Data Scope', ['This school only', 'Branch only', 'Custom']),
    s('2FA', ['Required', 'Optional']), s('Session Policy', ['8 hours · device checked', '4 hours']),
    s('Audit Logging', ['All sensitive actions', 'Standard']), t('Feature Flags'),
  ],
  other: [
    s('Record Type', ['Vendor / Service Provider', 'Event', 'Library Asset', 'Facility', 'Custom Record'], true),
    t('Record ID'), t('Name', true), t('Department / Owner', true), t('Contact', false, 'tel'), t('Email', false, 'email'),
    s('Status', ['Active', 'Pending Approval', 'Archived']), s('Access Level', ['School Admin', 'Department', 'View Only']),
    { label: 'Description', kind: 'textarea' },
  ],
};

// Status chip tone, reference clsFor(): alert words first, then pending,
// then healthy; anything else is neutral.
export function statusTone(v: string): BadgeTone {
  const x = v.toLowerCase();
  if (/high|overdue|failed|open|absent/.test(x)) return 'alert';
  if (/pending|review|watch|delay|scheduled/.test(x)) return 'action';
  if (/complete|active|delivered|ready|present|approved|processed|stable|excellent|good|on time|on track|recorded|sent/.test(x)) return 'success';
  return 'neutral';
}

export const MODULES: Record<ModuleId, ModuleDef> = {
  setup: {
    title: 'School Setup',
    desc: 'Build the academic foundation once, then run the school from a controlled configuration layer.',
    kpis: ['42 Classes', '96 Sections', '86 Subjects', '12 Roles'],
    features: ['Academic sessions', 'Classes & sections', 'Subjects', 'Subject-teacher mapping', 'Class-teacher assignment', 'Learning objectives', 'Promotion rules', 'Student categories', 'Houses', 'Grading scales', 'Holiday calendar', 'Working days', 'School timings'],
    rows: [
      ['Session 2026–27', 'Active', '218 working days', 'Ready'],
      ['Classes', '42', '96 sections mapped', 'Complete'],
      ['Subjects', '86', '91% teacher mapped', 'Review'],
      ['Promotion rules', 'Auto-ready', 'Classes K–11', 'Ready'],
      ['Grading', '4 scales', 'CBSE term + holistic', 'Active'],
    ],
  },
  admissions: {
    title: 'Admissions & CRM',
    desc: 'Lead-to-admission pipeline with follow-up, documents, interviews, sibling linking and conversion without duplicate entry.',
    kpis: ['184 Enquiries', '27 Follow-ups', '96 Applications', '61 Converted'],
    features: ['Admission enquiry', 'Lead source', 'Lead stage', 'Kanban pipeline', 'Follow-up date', 'Online form', 'Guardian details', 'Document upload', 'Interview scheduling', 'Admission decision', 'Sibling linking', 'Duplicate detection', 'Lead conversion', 'Admission fee'],
    rows: [
      ['Aarav Sharma', 'Class 9-B', 'Applied → Finance → Ready', '10 min ago'],
      ['Ananya Kapoor', 'Class 5-B', 'Interview complete', 'Admitted'],
      ['Vihaan Mehta', 'Class 9-C', 'Follow-up', 'Tomorrow'],
      ['Sara Khan', 'Class 7-A', 'Sibling link found', 'Review'],
      ['Arjun Nair', 'Class 11-A', 'Application complete', 'Interview'],
    ],
  },
  students: {
    title: 'Student 360',
    desc: 'One student record connects profile, guardian, attendance, fees, homework, exams, documents and progression history.',
    kpis: ['1,240 Students', '96.2% Profiles Complete', '98.8% Guardians Linked', '73 Low Attendance'],
    features: ['Admission number', 'Roll number', 'Photo', 'Personal details', 'Guardian details', 'Siblings', 'Class & section', 'Attendance', 'Fees & dues', 'Homework', 'Exam results', 'Documents', 'Health notes', 'Complaints', 'Communication history', 'Promotion history'],
    rows: [
      ['STU-2401', 'Aarav Sharma', '8-A', '94%', '₹5,000 due'],
      ['STU-2402', 'Ananya Kapoor', '5-B', '98%', 'Paid'],
      ['STU-2403', 'Vihaan Mehta', '9-C', '88%', '₹12,500 due'],
      ['STU-2404', 'Sara Khan', '7-A', '96%', '₹2,500 due'],
      ['STU-2405', 'Arjun Nair', '11-A', '91%', 'Paid'],
    ],
  },
  parents: {
    title: 'Parents & Guardians',
    desc: 'Connected family records, children, notifications, PTM, consent and school communication in one place.',
    kpis: ['1,982 Guardians', '1,724 On WhatsApp', '216 PTM Bookings', '95.4% Consent'],
    features: ['My children', 'Sibling switcher', 'Attendance', 'Homework', 'Marks', 'Fees', 'Payments', 'Receipts', 'PTM', 'Notices', 'Events', 'Messages', 'Complaints', 'Documents', 'Consent & privacy', 'Notification preferences'],
    rows: [
      ['Rohit Sharma', 'Aarav · 8-A', 'WhatsApp active', 'PTM booked'],
      ['Priya Kapoor', 'Ananya · 5-B', 'WhatsApp active', 'Homework viewed'],
      ['Sameer Mehta', 'Vihaan · 9-C', 'Unread', 'Fee reminder'],
      ['Ayesha Khan', 'Sara · 7-A', 'WhatsApp active', 'PTM booked'],
      ['Nitin Nair', 'Arjun · 11-A', 'WhatsApp active', 'Exam update'],
    ],
  },
  staff: {
    title: 'Staff Management',
    desc: 'Staff directory, attendance, leave, substitution, workload, documents and payroll inputs.',
    kpis: ['86 Staff', '82 Present', '4 On Leave', '7 Substitutions'],
    features: ['Staff directory', 'Staff profile', 'Department', 'Designation', 'Staff documents', 'Staff attendance', 'Leave types', 'Leave request', 'Leave approval', 'Leave balance', 'Substitute assignment', 'Salary inputs', 'Loans & advances', 'Payroll export'],
    rows: [
      ['Priya Mehta', 'Mathematics', 'Present', 'Class 6-A'],
      ['Mrs Gupta', 'Science', 'Absent', '4th period free'],
      ['Arun Patel', 'Social Studies', 'Present', '13 periods'],
      ['Megha Rao', 'Computer', 'Present', '11 periods'],
      ['Rakesh Kumar', 'Administration', 'Present', 'Front Office'],
    ],
  },
  academics: {
    title: 'Academics',
    desc: 'Curriculum planning and execution with lessons, objectives, syllabus progress, classwork and evidence.',
    kpis: ['1,842 Lessons Planned', '1,691 Completed', '82% Syllabus Coverage', '78% Objectives Met'],
    features: ['Lesson plans', 'Weekly planner', 'Syllabus tracker', 'What was taught', 'Classwork', 'Logbook', 'Learning objectives', 'Homework creation', 'Attachments', 'Deadline', 'Parent-safe summary', 'Completion report'],
    rows: [
      ['Mathematics', '88% coverage', '42 classes', 'On track'],
      ['Science', '81% coverage', '42 classes', 'On track'],
      ['English', '84% coverage', '42 classes', 'On track'],
      ['Social Studies', '76% coverage', '42 classes', 'Watch'],
      ['Computer Science', '92% coverage', '28 classes', 'Ahead'],
    ],
  },
  attendance: {
    title: 'Attendance Command Center',
    desc: 'Daily and monthly attendance, correction workflow, class-level progress and low-attendance signals.',
    kpis: ['1,180 Present', '60 Absent', '24 Late', '73 Below 75%'],
    features: ['Daily attendance', 'Monthly attendance', 'Present All', 'Mark absent', 'Late', 'Half-day', 'Correction request', 'Correction approval', 'Parent absence alert', 'Class report', 'Student report', 'Attendance %', 'Low-attendance alert', 'Excel/PDF export'],
    rows: [
      ['Class K', '98%', '59/60', 'Aaradhya Sharma · 99% · top attendance (opt-in)'],
      ['Class 6', '88%', '97/110', 'Priya Verma · 96% · top attendance (opt-in)'],
      ['Class 7', '96%', '101/105', 'Ayaan Khan · 98% · top attendance (opt-in)'],
      ['Class 9', '91%', '105/115', 'Rahul Sharma · 95% · top attendance (opt-in)'],
      ['Class 10', '96%', '113/118', 'Ishita Jain · 99% · top attendance (opt-in)'],
    ],
  },
  timetable: {
    title: 'Timetable & Substitution',
    desc: 'Class and teacher schedules with clash detection, substitute assignment and controlled publishing.',
    kpis: ['328 Periods', '0 Clashes', '41 Free Periods', '7 Substitutions'],
    features: ['Visual timetable builder', 'Class timetable', 'Teacher timetable', 'Subject periods', 'Free period view', 'Teacher clash detection', 'Class clash detection', 'Substitute assignment', 'Publishing', 'Change notification', 'Print/export'],
    rows: [
      ['09:00', 'Mathematics', 'Class 10-A · Ishita Jain', 'Ongoing'],
      ['10:00', 'Science', 'Class 9-B · Mrs Gupta absent', 'Proxy auto'],
      ['11:00', 'English', 'Class 8-A · Ananya Reddy', 'Next'],
      ['01:00', 'Social Studies', 'Class 7-C · Pulse Hinglish', 'Later'],
      ['02:00', 'Computer Science', 'Class 10-A · Megha Rao', 'Later'],
    ],
  },
  homework: {
    title: 'Homework & Assignments',
    desc: 'Assign, collect, review and recover student work with teacher queues and parent visibility.',
    kpis: ['312 Assigned', '248 Submitted', '44 Pending Review', '31 Overdue'],
    features: ['Create homework', 'Copy previous', 'Multi-section assign', 'Attachments', 'Deadline', 'Instructions', 'Submission', 'Evaluation', 'Parent visibility', 'Completion report', 'Resubmission'],
    rows: [
      ['Algebra Worksheet', '8-A', '28/32', '4 pending'],
      ['Science Lab Report', '9-B', '24/31', '7 pending'],
      ['Chapter 5 Questions', '8-B', '22/31', '9 pending'],
      ['Essay Writing', '7-A', '30/35', '5 pending'],
      ['Fractions Practice', '6-C', '26/29', '3 pending'],
    ],
  },
  exams: {
    title: 'Exams & Report Cards',
    desc: 'Exam schedules, question bank, marks, approvals, grades, report cards and correction history.',
    kpis: ['9 Upcoming Exams', '92% Marks Entered', '64 Pending Approval', '1,024 Report Cards'],
    features: ['Exam types', 'Exam schedule', 'Subject mapping', 'Marks configuration', 'Question bank', 'Difficulty level', 'Online exam', 'Offline exam', 'Bulk marks entry', 'Excel import', 'Marks approval', 'Grade calculation', 'Remarks', 'Report cards', 'Bulk PDF', 'Result publishing', 'Correction audit', 'Progress comparison', 'Holistic Progress Card'],
    rows: [
      ['Mathematics', '98% entered', 'Approval 2', 'A'],
      ['Science', '94% entered', 'Approval 6', 'A'],
      ['English', '92% entered', 'Approval 10', 'B'],
      ['Social Studies', '89% entered', 'Approval 17', 'B'],
      ['Languages', '86% entered', 'Approval 29', 'B'],
    ],
  },
  fees: {
    title: 'Fees, Collections & Recovery',
    desc: 'Fee heads, invoices, collections, receipts, reconciliation and automated recovery workflows.',
    kpis: ['₹12.4L On Time', '₹3.6L Delayed', '₹1.9L Defaulters', '77.5% Collection'],
    features: ['Fee heads', 'Class-wise structure', 'Installments', 'Discounts', 'Scholarships', 'Invoices', 'Collection', 'Partial payment', 'Offline payment', 'Online payment', 'UPI payment link', 'Digital receipt', 'Refund', 'Due breakup', 'Reconciliation', 'Daily collection', 'Defaulter report', 'Fee Recovery'],
    rows: [
      ['Aarav Sharma · 9-B', '₹2,400', '12 days delay', 'Payment link sent'],
      ['Priya Mehta · 6-A', '₹8,400', '5 days delay', 'Reminder 1 sent'],
      ['Rahul Sharma · 9-B', '₹12,400', '8 days delay', 'Call scheduled'],
      ['Ishita Jain · 10-A', '₹42,400', 'Paid in advance', 'Receipt sent'],
      ['Ayaan Khan · 7-B', '₹38,000', 'On time', 'Receipt sent'],
    ],
  },
  payroll: {
    title: 'Payroll',
    desc: 'Staff salary inputs, attendance effects, loans, advances, payroll processing and exports.',
    kpis: ['86 Configured', '82 Processed', '4 Pending Inputs', '₹38.6L Net Payable'],
    features: ['Salary inputs', 'Salary components', 'Attendance adjustments', 'Loans', 'Advances', 'Deductions', 'Payroll processing', 'Bank validation', 'Export'],
    rows: [
      ['Teaching', '₹29.4L', '64 staff', 'Processed'],
      ['Administration', '₹5.8L', '12 staff', 'Processed'],
      ['Support', '₹3.4L', '10 staff', 'Processed'],
      ['Attendance adjustments', '4 staff', 'Review', 'Pending'],
      ['Bank validation', '86 accounts', '100%', 'Complete'],
    ],
  },
  communication: {
    title: 'Communication Hub',
    desc: 'Notices, circulars, class announcements and multi-channel delivery with consent-aware controls.',
    kpis: ['4,892 Sent', '4,711 Delivered', '181 Failed', '65.8% Engagement'],
    features: ['Notice board', 'Circulars', 'Class announcements', 'Staff announcements', 'Parent announcements', 'Scheduled messages', 'Templates', 'SMS', 'Email', 'WhatsApp', 'Staff app push', 'Delivery status', 'Read status', 'Retry', 'Opt-out', 'Communication history', 'Internal chat', 'Parent-teacher messaging'],
    rows: [
      ['Fees Reminder', 'Parents · All', '2,418', 'Delivered'],
      ['Mid Term Notice', 'Parents · 6–10', '1,132', 'Delivered'],
      ['Teacher Meeting', 'Staff', '86', 'Delivered'],
      ['Library Week', 'Students + Parents', '2,240', '74% read'],
      ['Exam Schedule', 'Parents · 8–10', '894', 'Scheduled'],
    ],
  },
  events: {
    title: 'Events & PTM',
    desc: 'Event calendar, holidays, field trips, parent-teacher meetings, bookings, reminders and feedback.',
    kpis: ['12 Upcoming', '216 PTM Slots', '168 Booked', '142 Feedback'],
    features: ['Event calendar', 'Holiday calendar', 'Annual events', 'Field trips', 'PTM schedule', 'Teacher availability', 'Parent slot booking', 'Reminders', 'Event attendance', 'Feedback form', 'Event report'],
    rows: [
      ['26 Sep', 'Parent-Teacher Meeting', '412/520 slots', '10:00 AM'],
      ['28 Sep', 'Science Exhibition', 'Grades 6–10', '09:00 AM'],
      ['05 Oct', 'English Essay', 'Siya Mehta · Personal Best', '09:00 AM'],
      ['12 Oct', 'Sports Day', 'School-wide', '06:00 AM'],
      ['18 Oct', 'Mid Term', 'All subjects', '08:30 AM'],
    ],
  },
  documents: {
    title: 'Documents',
    desc: 'Certificates, IDs, admit cards, fee receipts, report cards and staff letters from reusable templates.',
    kpis: ['1,842 Generated', '28 Pending Approval', '316 Certificates', '4,891 Access Events'],
    features: ['Bonafide certificate', 'Transfer certificate', 'Character certificate', 'ID card', 'Admit card', 'Fee receipt', 'Report card', 'Staff letter', 'Document templates', 'Merge fields', 'Bulk generation', 'Approval workflow', 'Download', 'Access log'],
    rows: [
      ['Report Card', '1,024', 'Generated', 'Ready'],
      ['Bonafide Certificate', '64', 'Approved', 'Ready'],
      ['ID Cards', '744', 'Generated', 'Printed'],
      ['Admit Cards', '120', 'Generated', 'Ready'],
      ['Transfer Certificates', '8', 'Review', 'Pending'],
    ],
  },
  complaints: {
    title: 'Complaints & Feedback',
    desc: 'Issue intake, assignment, priority, escalation, resolution and parent acknowledgement.',
    kpis: ['18 Open', '4 High Priority', '16 Assigned', '91% Satisfaction'],
    features: ['Complaint submission', 'Category', 'Priority', 'Assignment', 'Internal notes', 'Status', 'Escalation', 'Resolution', 'Parent acknowledgement', 'Satisfaction feedback', 'Complaint report'],
    rows: [
      ['CMP-1042', 'Transport delay', 'High', 'Operations'],
      ['CMP-1039', 'Homework visibility', 'Medium', 'Academic'],
      ['CMP-1037', 'Fee receipt correction', 'Low', 'Accounts'],
      ['CMP-1035', 'PTM slot issue', 'Medium', 'Coordinator'],
      ['CMP-1029', 'Classroom maintenance', 'High', 'Facilities'],
    ],
  },
  reports: {
    title: 'Reports & Analytics',
    desc: 'Operational, academic, finance, communication, engagement and data-quality reporting with scheduled exports.',
    kpis: ['38 Reports Today', '16 Scheduled', '12 Exports', '96.4% Data Quality'],
    features: ['Student report', 'Attendance report', 'Fees report', 'Exam report', 'Homework report', 'Communication report', 'Engagement report', 'Login report', 'Storage report', 'Support report', 'Feature usage', 'Data quality'],
    rows: [
      ['Student Strength', '1,240', 'By class / section', 'Open'],
      ['Attendance', '95.2%', 'Today + monthly', 'Open'],
      ['Fees', '₹12.4L', 'Collection + dues', 'Open'],
      ['Exams', '92%', 'Marks completion', 'Open'],
      ['Homework', '79.5%', 'Submission rate', 'Open'],
    ],
  },
  'learning-genome': {
    title: '01 · Learning Genome',
    desc: 'Persistent learner intelligence connecting concepts, prerequisite gaps and longitudinal progress across the learner lifecycle.',
    kpis: ['1,240 Learners', '6,840 Concepts', '312 Gap Chains', '72% Coverage'],
    features: ['Knowledge graph', 'Concept mastery', 'Prerequisite mapping', 'Longitudinal profile', 'Cross-school continuity', 'Teacher evidence', 'Assessment evidence', 'Intervention links', 'Privacy controls'],
    rows: [
      ['Ayaan Khan · 7-B', 'Fractions 42%', 'Ratio 81%', 'Algebra future risk'],
      ['Ishita Jain · 10-A', '99% overall', 'Python 72%', 'Career Graph linked'],
      ['Priya Verma · 6-A', '96% overall', 'Consistency 15-day', 'Stable'],
      ['Rahul Sharma · 9-B', '95% attendance', 'Participation -5 weeks', 'Early Warning'],
      ['Siya Mehta · 4-A', '98%', 'Personal Best', 'On track'],
    ],
  },
  'early-warning': {
    title: '02 · Early Warning System',
    desc: 'Observable signals surface where attendance, homework, participation and learning patterns are changing.',
    kpis: ['47 At-Risk Signals', '18 High Priority', '31 Open Cases', '72% Reviewed'],
    features: ['Attendance signals', 'Homework trends', 'Assessment trajectory', 'Participation change', 'Assignment delay', 'Teacher observations', 'Parent interaction', 'Concept gaps', 'Human review'],
    rows: [
      ['Rahul Sharma', 'Participation declined 5 weeks', 'Math gap increasing', 'Review'],
      ['Class 6-A', '88% attendance', '22% anomaly flagged', 'Intervention'],
      ['8-B', 'Homework completion 71%', 'Science gap', 'Monitor'],
      ['9-B', '3-week late trend', 'Assignment delays', 'Review'],
      ['7-C', 'Stable attendance', 'Low engagement', 'Observe'],
    ],
  },
  'teacher-copilot': {
    title: '03 · Teacher Copilot',
    desc: 'Prepare teachers for the day, highlight exceptions and reduce repetitive assessment and documentation workload.',
    kpis: ['86 Teachers', '31 Daily Briefs', '18 Interventions', '94% Acceptance'],
    features: ['Morning briefing', 'Class readiness', 'Prerequisite gaps', 'Lesson flow', 'Targeted groups', 'Worksheet review', 'Misconception patterns', 'Intervention groups', 'Parent-safe summary'],
    rows: [
      ['Priya Mehta', 'Class 6-A', 'Fractions 42% weak', 'Brief ready'],
      ['Mrs Gupta', 'Class 9-B', 'Absent today', 'Proxy suggestions'],
      ['Rahul Verma', 'Class 8-B', 'Science worksheet', 'Review 12'],
      ['Neha Singh', 'Class 7-A', 'Essay set', 'Ready'],
      ['Megha Rao', 'Class 10-A', 'Project review', 'Ready'],
    ],
  },
  'school-auditor': {
    title: '04 · School Health Auditor',
    desc: 'Continuous school-improvement view across learning execution, attendance, teacher stability, engagement and operations.',
    kpis: ['8 Dimensions', '91 Health Index', '7 Improvement Flags', '24 Evidence Sets'],
    features: ['Academic progress', 'Teacher stability', 'Student engagement', 'Parent communication', 'Infrastructure', 'Learning gap closure', 'Attendance', 'Curriculum execution', 'Teacher workload'],
    rows: [
      ['Academic Progress', '78', 'Grade 8 Math', 'Watch'],
      ['Teacher Stability', '91', '86 staff active', 'Stable'],
      ['Parent Communication', '89', '65.8% Pulse', 'Stable'],
      ['Learning Gap Closure', '67', '42 intervention links', 'Improve'],
      ['Attendance', '91', '95.2% today', 'Stable'],
    ],
  },
  'parent-ai': {
    title: '05 · Parent AI · What To Do?',
    desc: 'Turn school data into practical, evidence-linked next actions for families without replacing teacher or school judgement.',
    kpis: ['1,724 Active Families', '842 Guidance Sessions', '65.8% Pulse Open', '87% WhatsApp Reach'],
    features: ['Context-aware guidance', 'Child learning view', 'Homework support', 'Attendance context', 'Fee action', 'Daily activities', 'Language preference', 'Voice-note ready', 'Teacher escalation'],
    rows: [
      ['Aarav Sharma', 'Maths: Fractions 41%', '12-minute activity', 'Ready'],
      ['Ayaan Khan', 'Fractions 42%', 'Recovery activity', 'Ready'],
      ['Ananya Reddy', 'Science lab', 'Practice review', 'Ready'],
      ['Siya Mehta', 'English essay', 'Personal Best', 'Celebrate'],
      ['Rahul Sharma', 'Maths + participation', 'Teacher conversation', 'Review'],
    ],
  },
  recovery: {
    title: '06 · Homework Recovery Engine',
    desc: 'Recover missed learning after absence or delayed work by mapping missed topics to the smallest practical intervention.',
    kpis: ['31 Recovery Plans', '82% Completion', '4-Day Avg Plan', '19 Closed'],
    features: ['Absence detection', 'Missed lesson map', 'Prerequisite check', 'Recovery plan', 'Micro-activities', 'Assessment', 'Progress update', 'Teacher review'],
    rows: [
      ['Student A', '3 missed days', 'Science → Maths → English', '82%'],
      ['Ayaan Khan', 'Fractions gap', 'Practice + assessment', 'Ready'],
      ['Class 8-B', 'Lab report missed', '2-step recovery', '76%'],
      ['Student C', 'Homework backlog', '3 tasks', '90%'],
      ['Student D', 'Exam absent', 'Catch-up plan', '64%'],
    ],
  },
  'curriculum-gap': {
    title: '07 · Curriculum Gap Detector',
    desc: 'Compare curriculum, school delivery and assessments to reveal sequence breaks and prerequisite risk.',
    kpis: ['7 Gap Flags', '42 Curriculum Maps', '318 Lessons Checked', '16 Assessments Linked'],
    features: ['Curriculum mapping', 'Textbook mapping', 'Lesson mapping', 'Assessment mapping', 'Sequence analysis', 'Prerequisite graph', 'Gap flags', 'Teacher review'],
    rows: [
      ['Class 7 Maths', 'A → C sequence', 'B under-taught', 'Gap flagged'],
      ['Class 8 Science', 'Electricity', 'Prerequisite missing', 'Review'],
      ['Class 6 English', 'Grammar strand', 'Assessment mismatch', 'Watch'],
      ['Class 9 Maths', 'Algebra', 'Coverage strong', 'Stable'],
      ['Class 10 CS', 'Python basics', 'Project aligned', 'Stable'],
    ],
  },
  automation: {
    title: '08 · Education Automation OS',
    desc: 'Agentic school operations built around approvals, auditability and predictable workflows rather than blind automation.',
    kpis: ['9 Agents', '286 Runs', '96% Success', '14 Human Approvals'],
    features: ['Attendance anomaly', 'Proxy finder', 'Drafter', 'Human-in-loop', 'WhatsApp sender', 'Fee recovery', 'Receipt generation', 'Report generation', 'Approval queue'],
    rows: [
      ['Attendance anomaly', '6-A', '22% anomaly', 'Review'],
      ['Proxy finder', 'Mrs Gupta absent', '3 candidates', 'Ready'],
      ['Drafter', 'Notice · fees', 'Parent audience', 'Draft'],
      ['Fee recovery', '92 accounts', 'Reminder 1', 'Scheduled'],
      ['Receipt flow', '₹25,000', 'Webhook verified', 'Posted'],
    ],
  },
  career: {
    title: '09 · Education-to-Career Graph',
    desc: 'Connect student knowledge and evidence to skills, projects and future pathways without becoming a course marketplace.',
    kpis: ['1,240 Profiles', '312 Skill Links', '72% Graph Coverage', '48 Evidence Gaps'],
    features: ['Knowledge → skill', 'Project evidence', 'Industry skill map', 'Career pathways', 'Skill gaps', 'Certification links', 'Portfolio evidence', 'Teacher validation'],
    rows: [
      ['Ishita Jain', 'Python 72%', 'Project 3', 'Career Graph mapped'],
      ['Ayaan Khan', 'Networking 58%', 'Project 1', 'Skill gap'],
      ['Dev Malhotra', 'Science + communication', 'Exhibition winner', 'Evidence linked'],
      ['Sanvi Kapoor', 'Leadership', 'Alumni mentorship', 'Pathway'],
      ['Aarav Sharma', 'Math + coding', 'Project 0', 'Build evidence'],
    ],
  },
  twin: {
    title: '10 · Education Digital Twin',
    desc: 'Scenario simulation for school planning across student allocation, timetable, staffing, learning gaps, workload and cost.',
    kpis: ['14 Simulations', '6 Variables', '3 Active Scenarios', '92% Model Coverage'],
    features: ['School model', 'Student allocation', 'Teacher workload', 'Timetable simulation', 'Intervention capacity', 'Cost model', 'Scenario compare', 'Outcome feedback'],
    rows: [
      ['Add Maths teacher', 'Grade 8', 'Load -16%', 'Scenario active'],
      ['60-min periods', 'All grades', 'Timetable shift', 'Scenario active'],
      ['Extra remedial period', 'Grade 8', 'Intervention +1', 'Scenario active'],
      ['Teacher absent', 'Class 9-B', 'Substitute impact', 'Tested'],
      ['Fee cycle change', 'School-wide', 'Cash-flow impact', 'Ready'],
    ],
  },
  compliance: {
    title: 'Compliance Pro · APAAR & Governance',
    desc: 'Centralized compliance workspace for student identifiers, records, privacy, consent, retention and audit trails.',
    kpis: ['1,240 Student Records', '100% Audit Logged', '95.4% Consent', '31 Backups Verified'],
    features: ['APAAR readiness', 'Consent ledger', 'Privacy controls', 'Retention rules', 'Access logs', 'Sensitive exports', 'Document audit', 'Role permissions', 'Backup verification'],
    rows: [
      ['Consent ledger', '1,183', '95.4% complete', 'Review 57'],
      ['Access logs', '4,891', 'Sensitive actions', 'Tracked'],
      ['Retention policy', '36 months', 'Configured', 'Active'],
      ['Backup status', '31 / 31', 'Verified', 'Healthy'],
      ['Export audit', '32', 'Permission checked', 'Logged'],
    ],
  },
  pulse: {
    title: 'Daily Pulse · Hinglish',
    desc: 'A parent-safe daily school update designed around high reach, concise context and multilingual delivery.',
    kpis: ['65.8% Open', '87% WhatsApp', '3 Reply Tiers', '8+ Languages'],
    features: ['Daily learning pulse', 'Hinglish copy', 'Hindi + regional language', 'Voice note', 'TTS ready', 'Missed-call report', 'Homework summary', 'Attendance summary', 'Parent engagement'],
    rows: [
      ['Today', 'Mathematics taught', 'Homework due', 'Sent 3:45 PM'],
      ['Class 7-C', 'Social Studies', 'Pulse triggered', '65.8% open'],
      ['Parents', 'WhatsApp reach', '87%', 'Primary'],
      ['Replies', 'One-tap tiers', '41% replied', 'Recorded'],
      ['Voice notes', '20 sec TTS', 'Pilot ready', 'Queued'],
    ],
  },
  ptm: {
    title: 'PTM Smart Scheduler',
    desc: 'Slot scheduling, teacher availability, parent booking, reminders and meeting dossiers for efficient PTM execution.',
    kpis: ['520 Slots', '412 Booked', '79% Utilization', '5-min Dossiers'],
    features: ['Slot generator', 'Teacher availability', 'Parent booking', 'Reminder', 'Calendar sync', 'Meeting dossier', 'Attendance', 'Feedback'],
    rows: [
      ['8-A', '32 slots', '28 booked', '87.5%'],
      ['8-B', '31 slots', '26 booked', '83.9%'],
      ['9-A', '30 slots', '27 booked', '90%'],
      ['9-B', '30 slots', '22 booked', '73.3%'],
      ['7-A', '35 slots', '30 booked', '85.7%'],
    ],
  },
  proxy: {
    title: 'Proxy Auto-Allocation',
    desc: 'Teacher absence can trigger candidate discovery, workload checks, approval and notifications in one controlled flow.',
    kpis: ['7 Auto Today', '90 sec Goal', '3 Candidates', '<8s Notify'],
    features: ['Absence trigger', 'Free-period match', 'Subject match', 'Workload check', 'Accept/decline', 'Principal approval', 'Timetable update', 'Notifications'],
    rows: [
      ['Mrs Gupta', 'Science · 9-B', '3 same-subject candidates', 'Ready'],
      ['Priya Mehta', 'Maths · 6-A', '2 candidates', 'Ready'],
      ['Arun Patel', 'Social Studies', '1 candidate', 'Review'],
      ['Neha Singh', 'English', '2 candidates', 'Ready'],
      ['Megha Rao', 'Computer', '1 candidate', 'Approved'],
    ],
  },
  'help-center': {
    title: 'Help Center',
    desc: 'Guided product help for principals, coordinators and administrators across every major workflow.',
    kpis: ['42 Guides', '18 Tutorials', '9 Workflows', '24/7 Help View'],
    features: ['Getting started', 'School setup', 'Attendance guide', 'Fees guide', 'Admissions guide', 'Exam guide', 'Communication guide', 'AI features', 'Security'],
    rows: [
      ['Getting started', 'Setup checklist', '12 steps', 'Open'],
      ['Attendance', 'Daily process', 'Present All → Submit', 'Open'],
      ['Fees', 'Recovery', 'Reminder → Payment', 'Open'],
      ['PTM', 'Scheduling', 'Slots → Dossier', 'Open'],
      ['AI', 'Human review', 'Evidence → Action', 'Open'],
    ],
  },
  'raise-ticket': {
    title: 'Raise Support Ticket',
    desc: 'Structured support intake with priority, module, evidence and response-target routing.',
    kpis: ['3 Open Tickets', '1 High Priority', '8 Resolved MTD', '92% Within Target'],
    features: ['Ticket creation', 'Module selection', 'Priority', 'Attachments', 'Conversation', 'Escalation', 'Response targets', 'Resolution', 'Feedback'],
    rows: [
      ['TCK-1042', 'Fees', 'High', 'In progress'],
      ['TCK-1039', 'Homework', 'Medium', 'Assigned'],
      ['TCK-1037', 'Reports', 'Low', 'Resolved'],
      ['TCK-1035', 'PTM', 'Medium', 'Resolved'],
      ['TCK-1029', 'Documents', 'High', 'Assigned'],
    ],
  },
};
