import type { Tone } from '@/lib/semantic';
import type { IconName } from '@/components/visual/Icons';

// Single source for the product and solution catalogue: the mega-menus,
// the /products and /solutions hubs, and every detail page read from
// here. src/content/catalog.test.ts enforces the SEO/AEO rules the CI
// audit checks (meta description 150-160 chars, hero lead 40-60 words,
// 4-6 FAQs) so a copy edit can't silently break the build.
//
// Claims discipline: no customer names, results, statistics or
// certifications. Where a board/regulatory claim would be tempting
// (CBSE, DPDP), copy states what the product does, not a compliance
// status that has not been verified.

export type ScreenKey =
  | 'principal'
  | 'teacher'
  | 'parent'
  | 'student'
  | 'finance'
  | 'admissions'
  | 'attendance'
  | 'homework'
  | 'exams'
  | 'recognition'
  | 'certificates'
  | 'reports'
  | 'compliance'
  | 'operations'
  | 'pulse'
  | 'impact'
  | 'profile'
  | 'health';

export type ChartKey = 'attendance' | 'fees' | 'admissions' | 'homework' | 'performance' | 'parents' | 'health' | 'impact' | 'growth' | 'personalBest';

export interface Faq {
  question: string;
  answer: string;
}

export interface CatalogPage {
  slug: string;
  name: string;
  tone: Tone;
  icon: IconName;
  menuBlurb: string;
  title: string;
  description: string;
  heroTitle: string;
  heroLead: string;
  problem: string[];
  solution: string[];
  workflow: { title: string; detail: string }[];
  benefits: string[];
  users: { role: string; value: string }[];
  screen: ScreenKey;
  secondaryScreen?: ScreenKey;
  chart: ChartKey;
  automation: string[];
  outcomes: string[];
  related: string[];
  faqs: Faq[];
}

export const products: CatalogPage[] = [
  {
    slug: 'school-management',
    name: 'School Management',
    tone: 'trust',
    icon: 'school',
    menuBlurb: 'Students, guardians, classes, admissions and certificates on one record.',
    title: 'School Management',
    description:
      'School management on one validated record: students, guardians, classes, admissions and certificates, audited from the first entry and built for Indian schools.',
    heroTitle: 'One validated record for the whole school',
    heroLead:
      'NetCyberAI keeps students, guardians, classes, sections, admissions and certificates in one validated school record. Every other module reads from it, so attendance, fees and parent messages never disagree, and nothing has to be typed twice. Every change is audited, and self-serve full export is planned but not live yet.',
    problem: [
      'The same student is typed into three registers, two spreadsheets and a WhatsApp group.',
      'Guardian numbers go stale, so messages reach the wrong person or nobody.',
      'Certificates are issued without checking whether dues were cleared.',
    ],
    solution: [
      'Enrol once; every module reads the same student and guardian record.',
      'Guardian WhatsApp numbers are verified and consent is recorded per purpose.',
      'Certificates are generated only after financial clearance or a formal waiver.',
    ],
    workflow: [
      { title: 'Enquiry', detail: 'Captured from the website, a call or a walk-in' },
      { title: 'Admission', detail: 'Documents checked, student record created once' },
      { title: 'Guardians linked', detail: 'WhatsApp verified, consent recorded' },
      { title: 'Class assigned', detail: 'Section, subjects and session set' },
      { title: 'Certificates', detail: 'Issued with clearance and an audit trail' },
    ],
    benefits: ['No duplicate data entry', 'Guardian contacts that actually work', 'A full audit trail of every change', 'One record, no spreadsheet copies'],
    users: [
      { role: 'School Admin', value: 'Enrols, updates and validates records' },
      { role: 'Principal', value: 'Approves certificates and sees the whole school' },
      { role: 'Admissions desk', value: 'Moves enquiries through clear stages' },
    ],
    screen: 'profile',
    secondaryScreen: 'certificates',
    chart: 'admissions',
    automation: ['Duplicate students are flagged at entry', 'Unverified guardian numbers are held back from messaging', 'Certificate requests wait for clearance automatically'],
    outcomes: ['One source of truth for every module', 'Fewer wrong-number messages', 'Certificates that can be traced'],
    related: ['attendance-safety', 'fees-billing', 'compliance-security'],
    faqs: [
      { question: 'Can we import our existing student list?', answer: 'Yes. A CSV import validates every row before anything is saved, and shows you exactly which rows need fixing.' },
      { question: 'Can one student have several guardians?', answer: 'Yes. Each guardian has their own verified WhatsApp number and their own consent record.' },
      { question: 'Who can issue a Transfer Certificate?', answer: 'Only an authorised person, and only after financial clearance or a formal waiver is recorded.' },
      { question: 'Can we take all our data out?', answer: 'That is our commitment. PostgreSQL is the single source of truth, and self-serve full export in standard formats is planned but not live yet. The data ownership page tracks what exists today.' },
    ],
  },
  {
    slug: 'ai-insights',
    name: 'AI Insights',
    tone: 'intelligence',
    icon: 'sparkle',
    menuBlurb: 'Personal Best detection, learning gaps and private teacher signals.',
    title: 'AI Insights',
    description:
      'Private, useful AI insights for schools: Personal Best detection, early learning-gap signals and a teacher Impact Card, proposed by AI and decided by people.',
    heroTitle: 'Signals that help people act, never rankings',
    heroLead:
      'NetCyberAI reads the validated school record to surface what deserves attention: a student who just beat their own best, a group slipping in fractions, a class whose homework went quiet. It proposes and flags. Teachers and principals decide what happens next, inside their permissions, and every step is recorded in the audit trail.',
    problem: [
      'Recognition goes only to the top three, so most children never hear they improved.',
      'Learning gaps show up at the term exam, when it is too late to help.',
      'Teacher feedback is either missing or turned into a public leaderboard.',
    ],
    solution: [
      'Personal Best compares each student with their own past, first and foremost.',
      'Unit-level trends flag gaps while there is still time to reteach.',
      'A private Impact Card for each teacher, seen only by them and their principal.',
    ],
    workflow: [
      { title: 'Validated data', detail: 'Marks, attendance and activity from the portal' },
      { title: 'Signal', detail: 'A Personal Best, a gap or an exception' },
      { title: 'Proposal', detail: 'A suggested action for the right person' },
      { title: 'Human decision', detail: 'Approved, edited or dismissed' },
      { title: 'Recorded', detail: 'The outcome is kept in the audit trail' },
    ],
    benefits: ['Recognition every student can earn', 'Earlier help for learning gaps', 'Teacher feedback without public ranking', 'AI that never writes to records on its own'],
    users: [
      { role: 'Teacher', value: 'Sees Personal Bests and gaps in their classes' },
      { role: 'Principal', value: 'Sees a private signal on teaching support needs' },
      { role: 'Student and parent', value: 'Receive recognition for real progress' },
    ],
    screen: 'impact',
    secondaryScreen: 'recognition',
    chart: 'personalBest',
    automation: ['Personal Bests detected after each assessment', 'Gap signals raised at unit level, not term level', 'Certificates drafted for teacher approval'],
    outcomes: ['More students recognised for progress', 'Gaps noticed while they can still be closed', 'Teachers supported, not ranked'],
    related: ['academics', 'reports-analytics', 'parent-engagement'],
    faqs: [
      { question: 'Does the AI change marks or records?', answer: 'No. It reads validated records and proposes. People with the right permissions decide, and every decision is audited.' },
      { question: 'Is there a class ranking?', answer: 'Personal Best is the primary recognition. Most Improved is secondary. Class top-3 lists are optional and off by default.' },
      { question: 'Who sees a teacher’s Impact Card?', answer: 'Only the teacher and their principal. It is never public and never a leaderboard.' },
      { question: 'What data does it use?', answer: 'Only data entered and validated in the NetCyberAI portal for that school, isolated from every other school.' },
    ],
  },
  {
    slug: 'parent-engagement',
    name: 'Parent Engagement',
    tone: 'communication',
    icon: 'parent',
    menuBlurb: 'The Daily Learning Pulse on WhatsApp, with one-tap replies.',
    title: 'Parent Engagement',
    description:
      'Parent engagement on WhatsApp with no app to install: a Daily Learning Pulse from verified class activity, one-tap replies, and a weekly brief parents read.',
    heroTitle: 'Parents who know what happened in class today',
    heroLead:
      'Every school day, NetCyberAI builds a Daily Learning Pulse from verified class activity: what was taught, the homework, attendance and any note from the school. The teacher approves it, parents read it on WhatsApp, and a one-tap reply tells the teacher who understood and who may need a call. No app download is required.',
    problem: [
      'Parents learn what happened only at the parent-teacher meeting.',
      'Class WhatsApp groups are noisy, unofficial and hard to trust.',
      'Schools send messages but never hear whether they were understood.',
    ],
    solution: [
      'One official Pulse per day, built only from verified class activity.',
      'Delivered on WhatsApp, where parents already are, with consent recorded.',
      'One-tap comprehension replies routed back to the class teacher.',
    ],
    workflow: [
      { title: 'Class activity', detail: 'Attendance, lesson and homework recorded' },
      { title: 'Pulse drafted', detail: 'Built only from those verified items' },
      { title: 'Teacher approves', detail: 'Edit or send in one step' },
      { title: 'Parent reads', detail: 'On WhatsApp, in simple Hinglish' },
      { title: 'Reply routed', detail: 'The teacher sees who needs help' },
    ],
    benefits: ['No app to install', 'Messages parents trust', 'A question to ask at dinner, daily', 'The school hears back'],
    users: [
      { role: 'Parent', value: 'Knows what was taught and what is due' },
      { role: 'Teacher', value: 'Sees understanding at a glance' },
      { role: 'Principal', value: 'Sees Pulse coverage across classes' },
    ],
    screen: 'parent',
    secondaryScreen: 'pulse',
    chart: 'parents',
    automation: ['Pulse drafted from the day’s records', 'Quiet hours and consent checked before every send', 'Replies attached to the right class and student'],
    outcomes: ['Parents who can talk about school at home', 'Fewer “what happened today?” calls', 'Teachers who know who to follow up with'],
    related: ['communication', 'academics', 'attendance-safety'],
    faqs: [
      { question: 'Do parents need a smartphone app?', answer: 'No. Everything is built to arrive on WhatsApp, which parents already use. Parents never need an app or a login.' },
      { question: 'Can the Pulse contain something the teacher did not record?', answer: 'No. It is built only from verified class activity, and the teacher approves it before it is sent.' },
      { question: 'What language is it in?', answer: 'Simple Hinglish by default, written for parents with a range of English reading comfort.' },
      { question: 'What if a parent has not consented?', answer: 'Nothing is sent to them. The send gate checks consent and quiet hours for every message.' },
    ],
  },
  {
    slug: 'fees-billing',
    name: 'Fees & Billing',
    tone: 'action',
    icon: 'fees',
    menuBlurb: 'Due dates, WhatsApp reminders with UPI links, receipts, reconciliation.',
    title: 'Fees & Billing',
    description:
      'Fees and billing for Indian schools: fee structures, scheduled WhatsApp reminders with a UPI link, automatic receipts and a collection dashboard, no chasing.',
    heroTitle: 'Fees collected on schedule, not from memory',
    heroLead:
      'NetCyberAI turns each fee structure into dues, with concessions, sibling rules and RTE admissions applied, and sends reminders with a UPI payment link. Parents pay straight into the school’s own bank account, the office confirms each payment against its bank, and a numbered receipt follows. Accounts sees who has paid, who is due and who needs a call.',
    problem: [
      'Accounts staff chase families by phone from a paper list.',
      'Payments arrive with no reference and take hours to match.',
      'Families never receive a receipt they can find later.',
    ],
    solution: [
      'Dues generated from the fee structure, with concessions, a sibling rule and RTE admissions.',
      'Reminders on a fixed D-3 to D+7 sequence, each with a UPI link, and one link for the whole family.',
      'UPI payments go straight to the school’s own account and are confirmed against its bank before the receipt.',
    ],
    workflow: [
      { title: 'Fee falls due', detail: 'From the structure and concessions' },
      { title: 'Reminder', detail: 'WhatsApp with a UPI link, inside quiet hours' },
      { title: 'Payment', detail: 'UPI straight to the school’s own account' },
      { title: 'Receipt', detail: 'Confirmed against the bank, then a numbered receipt' },
      { title: 'Dashboard', detail: 'Collected, due and overdue at a glance' },
    ],
    benefits: ['Follow-ups that happen on schedule', 'Receipts families can find', 'Less manual reconciliation', 'Overdue families visible early'],
    users: [
      { role: 'Accounts', value: 'Sees dues and receipts in one place' },
      { role: 'Parent', value: 'Pays via UPI from the reminder' },
      { role: 'Principal', value: 'Sees collection status without asking' },
    ],
    screen: 'finance',
    chart: 'fees',
    automation: ['Reminders scheduled automatically from due dates', 'Receipts generated on payment', 'Overdue families listed for a personal call'],
    outcomes: ['Fewer missed follow-ups', 'Clearer records for every family', 'Collection visible to the principal'],
    related: ['school-management', 'communication', 'reports-analytics'],
    faqs: [
      { question: 'Can we set concessions and sibling discounts?', answer: 'Yes. Concessions, a sibling rule and RTE admissions are applied when dues are raised, and each concession is approved by a person before it counts.' },
      { question: 'How often are reminders sent?', answer: 'On a fixed sequence from three days before the due date to a week after, inside quiet hours and only with consent.' },
      { question: 'Does it replace our accounting software?', answer: 'It manages fee dues, reminders and receipts. It can run alongside the accounting system your school already uses.' },
      { question: 'Are receipts sent automatically?', answer: 'Yes, once the school has confirmed the payment in its own bank, one by one or by uploading its bank statement. A screenshot or a typed transaction number alone never marks a fee paid.' },
      { question: 'Does fee money pass through NetCyberAI?', answer: 'No. Parents pay by UPI straight into the school’s own bank account. NetCyberAI never holds the money and takes no cut of it.' },
    ],
  },
  {
    slug: 'attendance-safety',
    name: 'Attendance & Safety',
    tone: 'success',
    icon: 'attendance',
    menuBlurb: 'Attendance marked once, parents told the same morning, exceptions owned.',
    title: 'Attendance & Safety',
    description:
      'Attendance and safety: marked once on a phone, validated, parents informed the same morning, and repeated absences routed to a named owner until resolved.',
    heroTitle: 'Every absence seen the same morning',
    heroLead:
      'Teachers mark attendance once from the Today screen on any phone. NetCyberAI validates it, updates the student record, lets consenting parents know on WhatsApp, and puts the day’s picture on the principal’s dashboard. When a pattern appears, like three days absent with no reason, it becomes a task with a named owner until it is resolved.',
    problem: [
      'Paper registers are typed up later, if at all.',
      'Parents hear about an absence days after it happened.',
      'Repeated absences are noticed by nobody in particular.',
    ],
    solution: [
      'Mark once on a phone; the record updates immediately.',
      'Parents informed on WhatsApp, with consent and quiet hours respected.',
      'Patterns become tasks with a named owner and a due date.',
    ],
    workflow: [
      { title: 'Marked', detail: 'From Teacher Today, in under a minute' },
      { title: 'Validated', detail: 'Saved with an audit trail' },
      { title: 'Parent informed', detail: 'On WhatsApp the same morning' },
      { title: 'Pattern flagged', detail: 'Repeated absence with no reason' },
      { title: 'Resolved', detail: 'Owner records the outcome' },
    ],
    benefits: ['No retyping registers', 'Parents informed early', 'Every exception has an owner', 'Corrections kept on the record'],
    users: [
      { role: 'Teacher', value: 'Marks attendance in one screen' },
      { role: 'Parent', value: 'Hears about an absence the same day' },
      { role: 'Principal', value: 'Sees attendance and exceptions live' },
    ],
    screen: 'attendance',
    secondaryScreen: 'teacher',
    chart: 'attendance',
    automation: ['Absence messages sent after marking', 'Three-day patterns raised as tasks', 'Late corrections recorded, never overwritten'],
    outcomes: ['Absences visible the same morning', 'Nothing silently missed', 'A trustworthy attendance history'],
    related: ['school-management', 'parent-engagement', 'reports-analytics'],
    faqs: [
      { question: 'Can attendance be corrected?', answer: 'Yes. Corrections are recorded with who changed what and when; the original is never silently overwritten.' },
      { question: 'Do parents get a message for every absence?', answer: 'Only if they have consented to attendance updates, and never inside the school’s quiet hours.' },
      { question: 'Does it work on basic phones?', answer: 'The teacher screen is built for budget Android phones and patchy connections.' },
      { question: 'Who is alerted about repeated absence?', answer: 'The owner the school sets, usually the class teacher, with the principal able to see it.' },
    ],
  },
  {
    slug: 'academics',
    name: 'Academics',
    tone: 'product',
    icon: 'academics',
    menuBlurb: 'Classes, homework, exams, marks and results on one timetable.',
    title: 'Academics',
    description:
      'Academics in one place: classes, subjects, homework, exams and results, entered once by teachers and shared with parents without spreadsheets or retyping.',
    heroTitle: 'Homework, exams and results without spreadsheets',
    heroLead:
      'NetCyberAI keeps the academic structure, classes, sections, subjects and sessions, in one place, and builds homework, exams and results on top of it. Teachers enter marks once, the portal validates them, results are published by subject and student, and homework reaches parents through the Daily Learning Pulse on the day it is set.',
    problem: [
      'Marks live in personal spreadsheets that never match.',
      'Homework is written on the board and forgotten by evening.',
      'Report cards take days of copying and checking.',
    ],
    solution: [
      'Marks entered once and validated against the exam’s maximum.',
      'Homework shared with parents in the same day’s Pulse.',
      'Results by subject and student, ready for report cards.',
    ],
    workflow: [
      { title: 'Structure', detail: 'Classes, sections, subjects, session' },
      { title: 'Homework', detail: 'Set, shared, tracked' },
      { title: 'Exam', detail: 'Scheduled with maximum marks' },
      { title: 'Marks', detail: 'Entered and validated' },
      { title: 'Results', detail: 'Published by subject and student' },
    ],
    benefits: ['One set of marks, not five spreadsheets', 'Homework parents actually see', 'Faster report cards', 'Trends by subject and class'],
    users: [
      { role: 'Teacher', value: 'Enters homework and marks once' },
      { role: 'Principal', value: 'Sees results by class and subject' },
      { role: 'Parent', value: 'Sees homework and results on WhatsApp' },
    ],
    screen: 'exams',
    secondaryScreen: 'homework',
    chart: 'performance',
    automation: ['Marks validated against maximums', 'Missing homework entries flagged by 4 pm', 'Personal Bests detected after each test'],
    outcomes: ['Consistent marks across the school', 'Homework visible at home', 'Results ready without copying'],
    related: ['ai-insights', 'parent-engagement', 'reports-analytics'],
    faqs: [
      { question: 'Can we keep our own grading scheme?', answer: 'Exams are set up with the school’s own maximum marks and subjects; results follow that structure.' },
      { question: 'Is homework shared automatically?', answer: 'Homework recorded for the day is included in that day’s Pulse, which the teacher approves before it is sent.' },
      { question: 'Can teachers see each other’s marks?', answer: 'Access follows each person’s role and classes, set by the school.' },
      { question: 'Do you support multiple academic sessions?', answer: 'Yes. Classes and exams are scoped to an academic session, so each year stays separate.' },
    ],
  },
  {
    slug: 'communication',
    name: 'Communication',
    tone: 'communication',
    icon: 'chat',
    menuBlurb: 'One consent-aware WhatsApp channel for every school message.',
    title: 'Communication',
    description:
      'School communication through one consent-aware WhatsApp channel: notices, reminders and replies that respect quiet hours, with every single message logged.',
    heroTitle: 'One official channel, with the school in control',
    heroLead:
      'Every message NetCyberAI sends, from the Daily Learning Pulse to a fee reminder or a notice, passes through one send gate. It checks consent for that purpose, respects the school’s quiet hours, and logs what was sent. During a pilot, outbound messages stay switched off until the school turns them on.',
    problem: [
      'Dozens of unofficial class groups with no record of what was said.',
      'Messages at 10 pm that parents never asked for.',
      'No way to prove what was sent to whom.',
    ],
    solution: [
      'One official channel for every automated school message.',
      'Consent checked per purpose, quiet hours enforced.',
      'Every send logged against the student and guardian.',
    ],
    workflow: [
      { title: 'Message created', detail: 'Pulse, reminder or notice' },
      { title: 'Consent check', detail: 'For that purpose and guardian' },
      { title: 'Quiet hours', detail: 'Held until the allowed window' },
      { title: 'Delivered', detail: 'On WhatsApp' },
      { title: 'Logged', detail: 'With replies routed back' },
    ],
    benefits: ['Parents get official messages only', 'No late-night surprises', 'A record of every send', 'Pilot mode keeps sending off'],
    users: [
      { role: 'School Admin', value: 'Sends notices through one channel' },
      { role: 'Parent', value: 'Receives only what they consented to' },
      { role: 'Principal', value: 'Sees what went out and when' },
    ],
    screen: 'pulse',
    secondaryScreen: 'parent',
    chart: 'parents',
    automation: ['Consent checked on every send', 'Quiet-hours queue', 'Replies routed to the right teacher'],
    outcomes: ['Trusted, official communication', 'Fewer complaints about timing', 'A complete message history'],
    related: ['parent-engagement', 'fees-billing', 'compliance-security'],
    faqs: [
      { question: 'Which WhatsApp provider do you use?', answer: 'The send gate is provider-neutral. A school’s WhatsApp Business connection is configured during onboarding.' },
      { question: 'Can messages go out during a pilot?', answer: 'Outbound messaging stays off in pilot mode until the school deliberately switches it on.' },
      { question: 'What are quiet hours?', answer: 'A window set by the school when no automated message is sent. Messages wait until it ends.' },
      { question: 'Can parents reply?', answer: 'Yes. Replies are routed back to the class teacher and kept with the message.' },
    ],
  },
  {
    slug: 'compliance-security',
    name: 'Compliance & Security',
    tone: 'trust',
    icon: 'shield',
    menuBlurb: 'Tenant isolation, consent ledger and an append-only audit trail.',
    title: 'Compliance & Security',
    description:
      'Security built into the product: school-level data isolation, a per-purpose consent ledger, an append-only audit trail and a clear plan for full data export.',
    heroTitle: 'Children’s data, protected by the product itself',
    heroLead:
      'NetCyberAI isolates every school at the database layer, records consent per student and purpose, keeps an append-only audit trail of changes, and commits to full data export, which is planned but not live yet. These rules are enforced in the product, not in a policy document, and they apply to every module and every person who signs in.',
    problem: [
      'Student data sits in shared drives and personal phones.',
      'Nobody can say who changed a record, or when.',
      'Consent is assumed, not recorded.',
    ],
    solution: [
      'Row-level security isolates each school’s data.',
      'A consent ledger per student, guardian and purpose.',
      'An append-only audit trail staff cannot edit or delete.',
    ],
    workflow: [
      { title: 'Sign-in', detail: 'Role-based access for each person' },
      { title: 'Isolation', detail: 'Every query scoped to one school' },
      { title: 'Consent', detail: 'Checked before any message' },
      { title: 'Audit', detail: 'Every change recorded' },
      { title: 'Review', detail: 'Who changed what, and when' },
    ],
    benefits: ['School data never mixed', 'Consent on the record', 'Accountable changes', 'No lock-in'],
    users: [
      { role: 'Principal', value: 'Knows who changed what' },
      { role: 'School Admin', value: 'Records and reviews consent' },
      { role: 'Parent', value: 'Controls what they receive' },
    ],
    screen: 'compliance',
    chart: 'health',
    automation: ['Consent checked on every send', 'Audit entries written on every change', 'Pilot mode blocks outbound messages'],
    outcomes: ['A defensible data record', 'Parents’ choices respected', 'Full control of your data'],
    related: ['school-management', 'communication', 'reports-analytics'],
    faqs: [
      { question: 'Can another school see our data?', answer: 'No. Row-level security scopes every query to one school at the database layer.' },
      { question: 'Is NetCyberAI certified for DPDP?', answer: 'We do not claim a certification. The product records consent per purpose and lets schools honour choices; your own legal review decides compliance.' },
      { question: 'Can staff edit the audit trail?', answer: 'No. School staff cannot update or delete audit entries.' },
      { question: 'Can we leave and take our data?', answer: 'That is the commitment: full export in standard formats is planned but not live yet. The data ownership page states exactly what exists today.' },
    ],
  },
  {
    slug: 'reports-analytics',
    name: 'Reports & Analytics',
    tone: 'intelligence',
    icon: 'reports',
    menuBlurb: 'School health and trends from real, validated records.',
    title: 'Reports & Analytics',
    description:
      'Reports and analytics from real school records: a live school health score, attendance, results, parent engagement and fee trends, all from one record.',
    heroTitle: 'The whole school, visible without chasing',
    heroLead:
      'NetCyberAI turns validated records into the views a principal actually uses: a school health score, attendance and results trends, Pulse coverage and parent replies, fee collection and open exceptions. Every chart comes from the same record the school works in every day, and full export of the underlying data is planned but not live yet.',
    problem: [
      'Status comes from asking five people for five spreadsheets.',
      'Reports are assembled once a term, already out of date.',
      'Numbers disagree because they come from different copies.',
    ],
    solution: [
      'Live views built from the one validated record.',
      'A school health score with the reasons behind it.',
      'Every number traces back to the records behind it.',
    ],
    workflow: [
      { title: 'Recorded', detail: 'In the portal, validated' },
      { title: 'Aggregated', detail: 'By class, subject and week' },
      { title: 'Visualised', detail: 'Health, trends and exceptions' },
      { title: 'Acted on', detail: 'Owners assigned from the view' },
    ],
    benefits: ['Answers without chasing', 'Numbers that agree', 'Trends, not just snapshots', 'Traceable numbers'],
    users: [
      { role: 'Principal', value: 'Sees school health daily' },
      { role: 'Trust or group', value: 'Compares schools it owns' },
      { role: 'Teacher', value: 'Sees their own class trends' },
    ],
    screen: 'reports',
    secondaryScreen: 'health',
    chart: 'growth',
    automation: ['Health score updated through the day', 'Exceptions raised from trends', 'Weekly summaries prepared'],
    outcomes: ['Faster decisions', 'One version of the truth', 'Earlier warning signs'],
    related: ['ai-insights', 'academics', 'attendance-safety'],
    faqs: [
      { question: 'Where do the numbers come from?', answer: 'Only from records entered and validated in the NetCyberAI portal for your school.' },
      { question: 'Can we export the data behind a chart?', answer: 'Not yet. Full export of the underlying records is planned but not live; today the numbers are viewed inside NetCyberAI.' },
      { question: 'What is the school health score?', answer: 'A summary of attendance, Pulse coverage, homework, fee follow-ups and open exceptions, with each part shown.' },
      { question: 'Can a group of schools compare them?', answer: 'A group account can see each school it owns, while each school’s data stays isolated.' },
    ],
  },
];

export const solutions: CatalogPage[] = [
  {
    slug: 'principal',
    name: 'Principal',
    tone: 'trust',
    icon: 'principal',
    menuBlurb: 'School health, exceptions and teaching signals in one view.',
    title: 'For Principals',
    description:
      'For principals: school health, attendance, Pulse coverage, fee status and open exceptions in one private dashboard, without asking around or waiting on it.',
    heroTitle: 'Know how your school is doing today, not next month',
    heroLead:
      'As a principal you should not have to ask five people to find out how the school is doing. NetCyberAI shows attendance, Pulse coverage, fee status and open exceptions in one private dashboard, updated through the day, with each exception assigned to a named owner and a private signal on where teachers may need support.',
    problem: ['Status arrives late and secondhand.', 'Exceptions are noticed by nobody in particular.', 'Teacher support needs are invisible until complaints arrive.'],
    solution: ['One live dashboard from the validated record.', 'Every exception gets an owner and a due date.', 'A private Impact Card per teacher, never a public ranking.'],
    workflow: [
      { title: 'Open dashboard', detail: 'School health at a glance' },
      { title: 'Review exceptions', detail: 'What needs attention today' },
      { title: 'Assign owner', detail: 'Inside each person’s permissions' },
      { title: 'Track to closed', detail: 'Verified, with an audit trail' },
      { title: 'Support teachers', detail: 'From a private signal' },
    ],
    benefits: ['Visibility without chasing', 'Nothing silently missed', 'Private, fair teacher feedback', 'Certificates you can trust'],
    users: [
      { role: 'Principal', value: 'Sees and assigns' },
      { role: 'Vice principal', value: 'Owns academic exceptions' },
      { role: 'Office', value: 'Owns operational follow-ups' },
    ],
    screen: 'principal',
    secondaryScreen: 'impact',
    chart: 'health',
    automation: ['Exceptions raised automatically', 'Daily summary prepared', 'Certificate requests wait for clearance'],
    outcomes: ['Faster decisions', 'Clear ownership', 'Better-supported teachers'],
    related: ['school-admin', 'teacher', 'multi-school'],
    faqs: [
      { question: 'Can I see individual teacher signals?', answer: 'Yes, privately. Each teacher’s Impact Card is visible only to them and to you.' },
      { question: 'Is the dashboard live?', answer: 'It updates as records are entered through the day.' },
      { question: 'Can I approve certificates here?', answer: 'Yes, once financial clearance or a formal waiver is recorded.' },
      { question: 'Do I need to install anything?', answer: 'No. It runs in the browser on a laptop or phone.' },
    ],
  },
  {
    slug: 'school-admin',
    name: 'School Admin',
    tone: 'product',
    icon: 'admin',
    menuBlurb: 'Records, guardians, consent and notices without retyping.',
    title: 'For School Admins',
    description:
      'For school office teams: student and guardian records, consent, attendance corrections, notices and certificates handled once, with every change audited.',
    heroTitle: 'The office, without the retyping',
    heroLead:
      'School office teams spend hours copying the same details between registers, spreadsheets and phones. NetCyberAI gives them one validated record for students, guardians and classes, a clean way to record consent, one channel for notices, and a certificate workflow that checks clearance first, with every change kept in the audit trail automatically.',
    problem: ['The same data typed into many places.', 'Guardian numbers go out of date.', 'Notices scattered across groups.'],
    solution: ['Enrol once, used everywhere.', 'Verified guardians and recorded consent.', 'One channel for notices, logged.'],
    workflow: [
      { title: 'Enrol', detail: 'Or import a validated CSV' },
      { title: 'Link guardians', detail: 'Verify WhatsApp numbers' },
      { title: 'Record consent', detail: 'Per purpose' },
      { title: 'Send notices', detail: 'Through the send gate' },
      { title: 'Issue certificates', detail: 'After clearance' },
    ],
    benefits: ['Less retyping', 'Reliable contacts', 'Fewer queries at the counter', 'Traceable certificates'],
    users: [
      { role: 'Office staff', value: 'Keep records current' },
      { role: 'Accounts', value: 'Clears dues for certificates' },
      { role: 'Principal', value: 'Approves and oversees' },
    ],
    screen: 'profile',
    secondaryScreen: 'certificates',
    chart: 'attendance',
    automation: ['Duplicate checks at entry', 'Unverified numbers held back', 'Audit entries written automatically'],
    outcomes: ['Time back for the office', 'Fewer wrong-number messages', 'Cleaner records'],
    related: ['principal', 'finance', 'admissions'],
    faqs: [
      { question: 'Can we import our student list?', answer: 'Yes. The CSV import validates every row before saving and shows what needs fixing.' },
      { question: 'Can we scan documents?', answer: 'Documents can be captured and attached to the student record.' },
      { question: 'Who can change a record?', answer: 'People whose role allows it, and every change is audited.' },
      { question: 'Can we print ID cards?', answer: 'Student ID cards with QR codes can be generated from the record.' },
    ],
  },
  {
    slug: 'teacher',
    name: 'Teacher',
    tone: 'product',
    icon: 'teacher',
    menuBlurb: 'One Today screen: attendance, classes, homework, the Pulse.',
    title: 'For Teachers',
    description:
      'For teachers: one Today screen for attendance, classes, homework, marks and the Daily Learning Pulse, built for a budget phone, plus a private Impact Card.',
    heroTitle: 'Everything for today, on the phone in your pocket',
    heroLead:
      'Teachers open one Today screen: mark attendance, see the day’s classes, set homework, enter marks and approve the Daily Learning Pulse before it goes to parents. It is built for a budget Android phone. Each teacher also gets a private Impact Card with feedback on their own work, visible only to them and their principal.',
    problem: ['Registers, diaries and group messages every day.', 'Parents ask the same questions repeatedly.', 'Feedback is either missing or public.'],
    solution: ['One screen for the whole day’s tasks.', 'The Pulse answers “what happened today?” for parents.', 'A private Impact Card, never a leaderboard.'],
    workflow: [
      { title: 'Mark attendance', detail: 'In under a minute' },
      { title: 'Log the lesson', detail: 'Against the plan' },
      { title: 'Set homework', detail: 'Shared in the Pulse' },
      { title: 'Approve the Pulse', detail: 'Edit or send' },
      { title: 'See replies', detail: 'Who may need help' },
    ],
    benefits: ['Less paperwork', 'Fewer repeated parent questions', 'Private, useful feedback', 'Works on any phone'],
    users: [
      { role: 'Class teacher', value: 'Attendance and the Pulse' },
      { role: 'Subject teacher', value: 'Homework and marks' },
      { role: 'Principal', value: 'Sees coverage, supports privately' },
    ],
    screen: 'teacher',
    secondaryScreen: 'impact',
    chart: 'homework',
    automation: ['Pulse drafted from the day’s records', 'Personal Bests detected after tests', 'Reminders when homework is missing'],
    outcomes: ['Time back each day', 'Parents who are informed', 'Feedback that helps'],
    related: ['principal', 'school-admin', 'cbse'],
    faqs: [
      { question: 'Is there a teacher ranking?', answer: 'No. Impact Cards are private to each teacher and their principal.' },
      { question: 'Does it work offline?', answer: 'The screen is built for patchy connections on budget Android phones.' },
      { question: 'Do I have to write the Pulse?', answer: 'No. It is drafted from what you recorded; you review and approve it.' },
      { question: 'Can I see parent replies?', answer: 'Yes. Replies to your class’s Pulse come back to you.' },
    ],
  },
  {
    slug: 'finance',
    name: 'Finance',
    tone: 'action',
    icon: 'fees',
    menuBlurb: 'Dues, UPI reminders, receipts and collection in one view.',
    title: 'For Finance Teams',
    description:
      'For school finance teams: dues from the fee structure, WhatsApp reminders with UPI links, matched payments, automatic receipts and a live collection view.',
    heroTitle: 'Collections without the phone calls',
    heroLead:
      'Finance teams should not spend their mornings calling families from a paper list. NetCyberAI generates dues from the fee structure, sends reminders with a UPI link on a fixed schedule, matches payments to students and sends PDF receipts, while the dashboard shows what is collected, due this week and overdue.',
    problem: ['Chasing families by phone.', 'Payments with no reference.', 'Receipts lost or never sent.'],
    solution: ['Scheduled reminders with UPI links.', 'UPI payments straight to the school’s own account, confirmed against its bank.', 'Numbered receipts once confirmed.'],
    workflow: [
      { title: 'Structure', detail: 'Heads, frequency, concessions' },
      { title: 'Dues', detail: 'Generated per student' },
      { title: 'Reminders', detail: 'D-3 to D+7' },
      { title: 'Payments', detail: 'Confirmed against your bank' },
      { title: 'Receipts', detail: 'PDF on WhatsApp' },
    ],
    benefits: ['Less manual chasing', 'Cleaner reconciliation', 'Families with receipts', 'Early view of overdue accounts'],
    users: [
      { role: 'Accounts', value: 'Runs collection' },
      { role: 'Principal', value: 'Sees status' },
      { role: 'Parent', value: 'Pays and gets a receipt' },
    ],
    screen: 'finance',
    chart: 'fees',
    automation: ['Reminder schedule', 'Receipt generation', 'Overdue list for personal calls'],
    outcomes: ['Fewer missed follow-ups', 'Clear records', 'Less time on the phone'],
    related: ['principal', 'admissions', 'budget-private-schools'],
    faqs: [
      { question: 'Can we set late fees?', answer: 'Yes. A late fee is a school setting, off until you switch it on, with an amount and days of grace; it is added as a new due, never by changing an old one.' },
      { question: 'Which payment methods work?', answer: 'UPI to the school’s own account from the reminder link, and cash, UPI or cheque at the counter. Counter UPI and cheques are checked against the bank statement too.' },
      { question: 'Does it replace our accounts software?', answer: 'It runs alongside it, handling dues, reminders and receipts.' },
      { question: 'Can a certificate be issued with dues pending?', answer: 'Only with a formal waiver recorded by an authorised person.' },
    ],
  },
  {
    slug: 'admissions',
    name: 'Admissions',
    tone: 'action',
    icon: 'admissions',
    menuBlurb: 'Enquiry to admission with owners and next steps.',
    title: 'For Admissions Teams',
    description:
      'For admissions teams: every enquiry tracked from first contact to admission with an owner and a next step, and the student record then created only once.',
    heroTitle: 'Every enquiry has an owner and a next step',
    heroLead:
      'Admission season brings enquiries from calls, walk-ins and the website, and many are lost in a notebook. NetCyberAI tracks each one through clear stages, enquiry, follow-up, campus visit, application and admission, with an owner and a next date, and creates the student record once on admission so nothing is typed again.',
    problem: ['Enquiries lost in notebooks and phones.', 'No one knows who follows up.', 'Details retyped after admission.'],
    solution: ['One pipeline with stages.', 'An owner and a next date on every enquiry.', 'The record created once on admission.'],
    workflow: [
      { title: 'Enquiry', detail: 'Website, call or walk-in' },
      { title: 'Follow-up', detail: 'Owner and next date' },
      { title: 'Campus visit', detail: 'Booked and logged' },
      { title: 'Application', detail: 'Documents checked' },
      { title: 'Admission', detail: 'Student record created' },
    ],
    benefits: ['Fewer lost enquiries', 'Clear ownership', 'No retyping', 'A view of the season'],
    users: [
      { role: 'Admissions desk', value: 'Works the pipeline' },
      { role: 'Principal', value: 'Sees the funnel' },
      { role: 'Parent', value: 'Gets timely follow-ups' },
    ],
    screen: 'admissions',
    chart: 'admissions',
    automation: ['Follow-up reminders to the owner', 'Stage changes logged', 'Record created on admission'],
    outcomes: ['A clear view of the season', 'Faster follow-ups', 'Cleaner records from day one'],
    related: ['school-admin', 'finance', 'principal'],
    faqs: [
      { question: 'Can website enquiries flow in?', answer: 'Enquiries can be captured from the website and added to the pipeline.' },
      { question: 'Can we see conversion by stage?', answer: 'Yes. The funnel shows each stage for the season.' },
      { question: 'What happens on admission?', answer: 'The student record is created once and every module uses it.' },
      { question: 'Are parents messaged automatically?', answer: 'Only with consent, through the same send gate as every other message.' },
    ],
  },
  {
    slug: 'multi-school',
    name: 'Multi-school groups',
    tone: 'trust',
    icon: 'school',
    menuBlurb: 'Several schools, one account, each fully isolated.',
    title: 'For Multi-School Groups',
    description:
      'For trusts and groups running several schools: one account to see each campus, while every school’s data stays isolated at the database layer on its own.',
    heroTitle: 'Several schools, one view, no mixed data',
    heroLead:
      'Trusts and school groups need to see every campus without mixing their data. NetCyberAI lets authorised people move between the schools they belong to, while row-level security keeps each school’s records isolated at the database layer. Each campus keeps its own settings, consent records and audit trail, so nothing leaks from one school into another.',
    problem: ['One spreadsheet per campus, all different.', 'Group leaders depend on phone calls.', 'Fear of one school seeing another’s data.'],
    solution: ['Switch between schools you belong to.', 'Each school isolated at the database layer.', 'Consistent views across campuses.'],
    workflow: [
      { title: 'Sign in', detail: 'One account' },
      { title: 'Choose school', detail: 'From the ones you belong to' },
      { title: 'See health', detail: 'Per campus' },
      { title: 'Act', detail: 'Inside that school’s permissions' },
      { title: 'Audit', detail: 'Per school' },
    ],
    benefits: ['One login for group leaders', 'No mixed data', 'Comparable views', 'Per-school control'],
    users: [
      { role: 'Group director', value: 'Sees each campus' },
      { role: 'Principal', value: 'Runs their school' },
      { role: 'Group finance', value: 'Sees collection per school' },
    ],
    screen: 'principal',
    secondaryScreen: 'health',
    chart: 'health',
    automation: ['Per-school health summaries', 'Isolation enforced on every query', 'Per-school audit trails'],
    outcomes: ['Group visibility without risk', 'Consistent operations', 'Clear accountability per campus'],
    related: ['principal', 'finance', 'budget-private-schools'],
    faqs: [
      { question: 'Can one school see another’s data?', answer: 'No. Isolation is enforced by row-level security on every query.' },
      { question: 'Can a person belong to several schools?', answer: 'Yes, and they choose which school they are working in.' },
      { question: 'Can each school have its own settings?', answer: 'Yes. Quiet hours, consent and messaging are per school.' },
      { question: 'Can we onboard campuses one at a time?', answer: 'Yes. Each school is onboarded and piloted separately.' },
    ],
  },
  {
    slug: 'cbse',
    name: 'CBSE schools',
    tone: 'product',
    icon: 'academics',
    menuBlurb: 'Structured academics and parent updates for CBSE-affiliated schools.',
    title: 'For CBSE Schools',
    description:
      'For CBSE-affiliated schools: classes, subjects, exams, results and daily parent updates in one validated record. We make no claim of CBSE board approval.',
    heroTitle: 'Structured academics, honest parent updates',
    heroLead:
      'CBSE-affiliated schools run a structured academic year with regular assessments and high parent expectations. NetCyberAI keeps classes, subjects, sessions, exams and results in one validated record and shares daily learning with parents on WhatsApp. We do not claim CBSE approval, certification or board-specific compliance; your school decides what its board requires.',
    problem: ['Assessment data spread across spreadsheets.', 'Parents want more than a term report.', 'Report cards take days.'],
    solution: ['Exams and marks on one record.', 'A Daily Learning Pulse for parents.', 'Results ready by subject and student.'],
    workflow: [
      { title: 'Session', detail: 'Classes and subjects set' },
      { title: 'Teaching', detail: 'Lessons and homework logged' },
      { title: 'Assessment', detail: 'Marks validated' },
      { title: 'Results', detail: 'By subject and student' },
      { title: 'Parents', detail: 'Informed daily and at results' },
    ],
    benefits: ['Consistent assessment records', 'Parents informed daily', 'Faster results', 'Personal Best recognition'],
    users: [
      { role: 'Principal', value: 'Sees results by class' },
      { role: 'Teacher', value: 'Enters marks once' },
      { role: 'Parent', value: 'Sees progress through the year' },
    ],
    screen: 'exams',
    secondaryScreen: 'student',
    chart: 'performance',
    automation: ['Marks validated on entry', 'Personal Bests detected', 'Homework shared in the Pulse'],
    outcomes: ['Cleaner assessment records', 'Better-informed parents', 'Less report-card effort'],
    related: ['teacher', 'principal', 'budget-private-schools'],
    faqs: [
      { question: 'Is NetCyberAI approved by CBSE?', answer: 'No. We make no claim of board approval or certification.' },
      { question: 'Does it follow CBSE report-card formats?', answer: 'Results follow the exams and subjects your school sets up; confirm format needs with us during the demo.' },
      { question: 'Can we use it for classes 1 to 12?', answer: 'The academic structure supports the classes and sections your school runs.' },
      { question: 'Is data shared with the board?', answer: 'No. NetCyberAI does not send your school’s records to a board or any outside body.' },
    ],
  },
  {
    slug: 'budget-private-schools',
    name: 'Budget private schools',
    tone: 'achievement',
    icon: 'phone',
    menuBlurb: 'Built for budget Android phones and WhatsApp-first families.',
    title: 'For Budget Private Schools',
    description:
      'For budget private schools: built for budget Android phones, WhatsApp-first parents and small office teams, with no app to install and nothing extra to learn.',
    heroTitle: 'Built for the phones and families you actually have',
    heroLead:
      'Many schools run on budget Android phones, patchy internet and a small office team, with parents who live on WhatsApp and read English with varying comfort. NetCyberAI is designed for exactly that: simple screens, WhatsApp as the main channel, messages in simple Hinglish, and no app for parents to install or remember.',
    problem: ['Expensive software built for desktops.', 'Parents who will not install an app.', 'A tiny office doing everything.'],
    solution: ['Screens built for budget phones.', 'WhatsApp as the main parent channel.', 'Automation that saves office time.'],
    workflow: [
      { title: 'Teacher marks', detail: 'On their own phone' },
      { title: 'Record updates', detail: 'Validated, once' },
      { title: 'Parent informed', detail: 'On WhatsApp, in Hinglish' },
      { title: 'Fees reminded', detail: 'With a UPI link' },
      { title: 'Principal sees', detail: 'Without calling anyone' },
    ],
    benefits: ['Works on phones you have', 'Parents need nothing new', 'Less office workload', 'Clear pricing conversation'],
    users: [
      { role: 'Owner-principal', value: 'Sees the whole school' },
      { role: 'Teacher', value: 'Uses their own phone' },
      { role: 'Parent', value: 'Uses WhatsApp only' },
    ],
    screen: 'parent',
    secondaryScreen: 'teacher',
    chart: 'fees',
    automation: ['Pulse drafted automatically', 'Fee reminders scheduled', 'Receipts sent on payment'],
    outcomes: ['Better-informed parents', 'Steadier collection', 'Time back for a small team'],
    related: ['finance', 'teacher', 'multi-school'],
    faqs: [
      { question: 'Do parents need smartphones with lots of storage?', answer: 'No. If they have WhatsApp, they receive everything.' },
      { question: 'Is it expensive?', answer: 'Pricing is scoped to the school’s size; request pricing and we will quote for your school.' },
      { question: 'Does it work with slow internet?', answer: 'Screens are built to be light and to cope with patchy connections.' },
      { question: 'Do messages come in Hindi?', answer: 'Parent messages default to simple Hinglish.' },
    ],
  },
];

export function findProduct(slug: string) {
  return products.find((p) => p.slug === slug);
}

export function findSolution(slug: string) {
  return solutions.find((s) => s.slug === slug);
}

// Feature landing pages that already exist under /features.
export const featurePages: { href: string; name: string; blurb: string; tone: Tone; icon: IconName }[] = [
  { href: '/features/daily-learning-pulse-hinglish', name: 'Daily Learning Pulse', blurb: 'What was taught today, on WhatsApp', tone: 'intelligence', icon: 'pulse' },
  { href: '/features/whatsapp-fee-recovery-upi', name: 'WhatsApp Fee Recovery', blurb: 'Reminders with a UPI link', tone: 'action', icon: 'fees' },
  { href: '/features/parent-weekly-confidence-brief', name: 'Weekly Confidence Brief', blurb: 'Questions to ask at home', tone: 'communication', icon: 'chat' },
  { href: '/features/teacher-impact-card-principal-only', name: 'Teacher Impact Card', blurb: 'Private feedback, no leaderboard', tone: 'success', icon: 'sparkle' },
  { href: '/features/digital-tc-character-bonafide-pipeline', name: 'Digital Certificates', blurb: 'Clearance, PDF, WhatsApp, audit', tone: 'trust', icon: 'certificate' },
  { href: '/features/haryana-form-6-fee-advisory', name: 'Form 6 Fee Advisory', blurb: 'Fee-change guidance for Haryana', tone: 'achievement', icon: 'reports' },
];
