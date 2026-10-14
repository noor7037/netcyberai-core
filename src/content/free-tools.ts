import type { IconName } from '@/components/visual/Icons';
import type { Tone } from '@/lib/semantic';

// Free tools on the public website (Decision Log C78). Each one settles a
// decision or produces a document a school office repeats every term,
// runs entirely in the visitor's browser, and ends in something printable
// or shareable. Nothing typed or uploaded is sent to NetCyberAI.
//
// Audit of the earlier set (C78): the Student Import Checker stays (a real
// data-quality decision before every admission cycle). The Attendance
// Calculator was folded into the Attendance Recovery Planner, the Fee
// Reminder Message into the Fee Leakage and Recovery Calculator's action
// plan, and the Daily Pulse Message was removed (a message template, not a
// decision; the feature page explains the real thing). next.config.js
// redirects each old address.

export type FreeToolKind = 'decision' | 'certificate' | 'data' | 'compliance' | 'office' | 'teaching';

// The order the groups appear in on /free-tools and in the menu.
export const KIND_ORDER: FreeToolKind[] = ['decision', 'certificate', 'data', 'compliance', 'office', 'teaching'];

export interface FreeTool {
  slug: string;
  kind: FreeToolKind;
  name: string;
  menuBlurb: string;
  icon: IconName;
  tone: Tone;
  title: string;
  description: string;
  heroLead: string;
  problem: string;
  steps: { name: string; text: string }[];
  faqs: { question: string; answer: string }[];
  // Target search phrases chosen for each page. Search volumes were not
  // measured (no keyword-volume data source is connected); see C78.
  keywords: string[];
  blogSlug?: string;
  product: { text: string; href: string; cta: string };
}

export const FREE_TOOLS_UPDATED = '14 October 2026';

export const TRIAL_CTA = {
  text: 'NetCyberAI can automate all these types of requests. Book your free 1-month trial session instantly to streamline your workflows.',
  href: '/start-pilot',
  button: 'Book your free trial session',
};

// What the free tool cannot do and NetCyberAI does: shown as locked
// features on every tool page (founder, Decision Log C79). Wording says
// what the product is built to do; the note under each list asks schools
// to check which parts are live for them today.
export const NETCYBERAI_UNLOCKS: Record<FreeToolKind, { title: string; items: { title: string; text: string }[] }> = {
  certificate: {
    title: 'Unlocked with NetCyberAI',
    items: [
      { title: 'Certificates straight from your records', text: 'A whole class made from the student record, with no list to prepare and numbers issued in sequence.' },
      { title: 'Auto-send to parents', text: 'The signed PDF goes to each family on WhatsApp the moment it is approved.' },
      { title: 'Online QR verification', text: 'Colleges and employers scan to confirm a certificate against the school’s record.' },
      { title: 'Request to signature workflow', text: 'Application, fee clearance, remarks and principal sign-off, with nothing lost on a desk.' },
      { title: 'Permanent issue register', text: 'Every certificate recorded, duplicates blocked, reprints in seconds.' },
      { title: 'Signatures and seal set up once', text: 'Logo, seal and signatures kept securely for every authorised staff member.' },
    ],
  },
  decision: {
    title: 'Unlocked with NetCyberAI',
    items: [
      { title: 'Numbers that fill themselves', text: 'Attendance, fees, marks and timetables come straight from the school record, not retyped.' },
      { title: 'Automatic reminders and alerts', text: 'Fee reminders and attendance alerts go to each family on WhatsApp, one family at a time.' },
      { title: 'Early warnings for the principal', text: 'Students, fees and classes drifting off track are flagged with an owner assigned.' },
      { title: 'Reports on a schedule', text: 'Collection, attendance and results reports ready every week without a spreadsheet.' },
      { title: 'Every campus in one view', text: 'Compare branches side by side when you run more than one school.' },
      { title: 'Free setup and staff training', text: 'We set it up with your team and train your staff at no cost.' },
    ],
  },
  data: {
    title: 'Unlocked with NetCyberAI',
    items: [
      { title: 'One-step import', text: 'Every valid row saved at once; every problem row reported back, never dropped.' },
      { title: 'We load your data for you', text: 'Send your Excel sheet, or even paper registers, and our team does the upload free.' },
      { title: 'Consent recorded for every family', text: 'Guardian consent tracked before any message is sent.' },
      { title: 'One master record', text: 'Fees, attendance and certificates all read from the same student record.' },
      { title: 'Mismatches caught on entry', text: 'Names and dates of birth checked as they are typed, before they reach UDISE+.' },
      { title: 'Corrections asked on WhatsApp', text: 'Each family is asked to confirm the right spelling and date, with the reply kept on record.' },
    ],
  },
  compliance: {
    title: 'Unlocked with NetCyberAI',
    items: [
      { title: 'Evidence filed as you go', text: 'Each RTE child’s documents are attached to the student record from admission onward.' },
      { title: 'Claims from your own records', text: 'Enrolment, attendance and fee records fill the claim sheet, so nothing is retyped.' },
      { title: 'Unpaid claims followed up', text: 'Every claim tracked by age until it is paid, with the next step and an owner.' },
      { title: 'Qualification alerts', text: 'The principal is told before a teacher’s certificate or approval runs out.' },
      { title: 'Disclosures kept current', text: 'Mandatory disclosure and fee forms drawn from one up-to-date school record.' },
      { title: 'Inspection evidence all year', text: 'Registers, photos and reports tagged to each quality standard as the work happens.' },
    ],
  },
  office: {
    title: 'Unlocked with NetCyberAI',
    items: [
      { title: 'Enquiries straight from WhatsApp', text: 'A parent’s message becomes an enquiry with an owner and a follow-up date.' },
      { title: 'Reminders for every follow-up', text: 'Staff see the calls and visits due today without opening a register.' },
      { title: 'Promises checked against payments', text: 'A promise to pay is matched to the payment when it reaches the school’s bank.' },
      { title: 'Hardship handled by a person', text: 'Families who ask for help go to a named staff member and are never chased by automation.' },
      { title: 'Admission to fee schedule in one step', text: 'A confirmed admission becomes a student record and the family’s fee plan.' },
      { title: 'Free setup and staff training', text: 'We set it up with your team and train your staff at no cost.' },
    ],
  },
  teaching: {
    title: 'Unlocked with NetCyberAI',
    items: [
      { title: 'Drafts from the class record', text: 'Remarks drafted from marks and attendance already in the system, for the teacher to edit.' },
      { title: 'Plans against the syllabus', text: 'Lesson plans laid out across the term, showing what is done and what is left.' },
      { title: 'Worksheets for each class', text: 'Practice sheets drafted for the topic, reviewed by the teacher before students see them.' },
      { title: 'Nothing goes out unchecked', text: 'Every draft waits for the teacher’s edit and approval before it is used.' },
    ],
  },
};

export const KIND_LABELS: Record<FreeToolKind, { title: string; blurb: string }> = {
  decision: { title: 'Planning and decision tools', blurb: 'Fees, attendance, capacity, timetables, marks, payroll and budgets.' },
  certificate: { title: 'Certificates and receipts', blurb: 'Print-ready A4 documents with your logo. Nothing is uploaded.' },
  data: { title: 'Student data checks', blurb: 'Find the errors in a student list before they reach an import, UDISE+ or APAAR.' },
  compliance: { title: 'Compliance and claims', blurb: 'RTE reimbursement claims and the teacher qualification register.' },
  office: { title: 'Follow-up trackers', blurb: 'Admission enquiries and fee promises, followed up on the right day.' },
  teaching: { title: 'Teacher help', blurb: 'Report card remarks, lesson plans and worksheets, ready for the teacher to edit.' },
};

const certSteps = (doc: string): FreeTool['steps'] => [
  { name: 'Choose the design', text: `Pick ${doc} and a template. Black-and-white templates suit official records; colour suits celebrations.` },
  { name: 'Add your school details once', text: 'Type the school name, affiliation number, address and logo, and save them in this browser. Every certificate and tool fills them in from then on.' },
  { name: 'Fill in one student, or a whole list', text: 'Type one student with a live preview, or open a CSV of up to 200 students to make them all at once. Required fields are marked with a star.' },
  { name: 'Generate, then download or print', text: 'Press Generate, then download the A4 PDF at 300 DPI or print it. Start new keeps the school details and moves the number on by one.' },
];

const certFaqs = (doc: string): FreeTool['faqs'] => [
  {
    question: `Is my ${doc} data uploaded or stored anywhere?`,
    answer: 'No. Nothing is sent to NetCyberAI and the PDF is made on your device. Only your school’s own details and logo are saved, in this browser, if you choose. Student details stay in the tab and are cleared when you close it.',
  },
  {
    question: 'How many certificates can I make for free?',
    answer: 'As many as you need. There is no login, no limit and no watermark. We do not save your certificates or form data.',
  },
  {
    question: 'Is the PDF good enough to print?',
    answer: 'Yes. Each page is an A4 image at 300 DPI, the usual print standard, with fixed margins. You can also print directly from the page.',
  },
  {
    question: 'Does the QR code verify the certificate online?',
    answer: 'No. Because nothing is stored, the optional QR code holds the certificate’s key details as text so anyone can compare it with the printed page. Online verification needs a school system that keeps records, such as NetCyberAI.',
  },
];

export const freeTools: FreeTool[] = [
  // ---- planning and decision tools -------------------------------------------
  {
    slug: 'school-fee-planner',
    kind: 'decision',
    name: 'School Fee Planner',
    menuBlurb: 'Instalments, discounts and a collection forecast.',
    icon: 'fees',
    tone: 'action',
    title: 'Free School Fee Planner and Forecast',
    description:
      'Plan monthly, quarterly or term-wise fee instalments with sibling discounts, scholarships and late fees, and forecast collection and shortfall for the year.',
    heroLead:
      'Set the annual fee, the instalment plan, the down payment and your discounts, and see the full instalment schedule with due dates. Add how many families usually pay on time and the planner forecasts the year’s collection and the shortfall, with a printable schedule and a parent link.',
    problem:
      'Every session the office rebuilds the same fee schedule by hand, works out sibling and scholarship amounts separately, and only discovers the shortfall in the last quarter when it is too late to act.',
    steps: [
      { name: 'Enter the fee structure', text: 'Annual fee, number of students, instalment plan, first month and due day, down payment and late fee.' },
      { name: 'Add discounts', text: 'How many students get a sibling discount or a scholarship or concession, and how much each gets.' },
      { name: 'Add your collection pattern', text: 'From last year’s register: the share of instalments paid on time and the share paid late.' },
      { name: 'Print or share', text: 'Download the PDF, print the schedule, or copy a parent link that carries only the fee numbers.' },
    ],
    faqs: [
      { question: 'How is the instalment amount worked out?', answer: 'The annual fee, after any discount, minus the down payment, divided by the number of instalments in whole rupees. The last instalment absorbs the rounding so the schedule adds up exactly.' },
      { question: 'What is the projected shortfall?', answer: 'The net fee billable after discounts, minus the down payments and the instalments you expect to be paid on time or late within the year.' },
      { question: 'Can a student get both a sibling discount and a scholarship?', answer: 'Not in this planner. The two groups are kept separate so each student gets one discount. If your policy stacks them, enter the combined discount as a concession.' },
      { question: 'Does the parent link show any family’s details?', answer: 'No. It carries only the fee numbers you entered, in the part of the address browsers never send to a server.' },
    ],
    keywords: ['school fee structure calculator', 'fee instalment plan for school', 'school fee collection forecast', 'sibling discount school fees'],
    blogSlug: 'school-fee-instalment-plan-and-collection-forecast',
    product: { text: 'In NetCyberAI the fee plan becomes each family’s schedule, reminders go to one family at a time on WhatsApp, and collection is tracked against the forecast every week.', href: '/products/fees-billing', cta: 'See Fees & Billing' },
  },
  {
    slug: 'attendance-recovery-planner',
    kind: 'decision',
    name: 'Attendance Recovery Planner',
    menuBlurb: 'Days needed to reach the target, and what can still be missed.',
    icon: 'attendance',
    tone: 'product',
    title: 'Free Attendance Recovery Planner',
    description:
      'Find how many of the remaining school days a student must attend to reach your attendance target, how many can still be missed, and when to warn about exams.',
    heroLead:
      'Enter the days present and absent so far, the working days left and your school’s target. The planner shows how many of the remaining days must be attended, the most that can still be missed, the best possible final attendance, and an early warning when exam eligibility is at risk.',
    problem:
      'Families usually learn a child is short of attendance when the admit card is held back. By then no amount of attendance can fix it, and the school has to handle an avoidable dispute.',
    steps: [
      { name: 'Enter attendance so far', text: 'Days present and days absent from the register.' },
      { name: 'Enter the days left', text: 'Working days remaining before attendance is checked for exams.' },
      { name: 'Set the rule', text: 'Your board’s or school’s target. It is not fixed at one number.' },
      { name: 'Check the what-if table', text: 'See the final attendance if the student misses 0, 2, 5 or 10 more days, then print the plan for the family.' },
    ],
    faqs: [
      { question: 'How are the days needed calculated?', answer: 'The planner finds the smallest number of remaining days that brings present days to the target share of all working days in the term, using exact whole-number arithmetic.' },
      { question: 'What if the target cannot be reached?', answer: 'It says so plainly and shows the best possible final attendance, so the family can speak to the school about medical certificates or any condonation rule the board allows.' },
      { question: 'Is 75 the rule for every board?', answer: 'Many boards use 75, but rules and exemptions differ and change. Enter the rule your board and school apply today.' },
      { question: 'Can I use it for a whole class?', answer: 'It plans one student at a time. NetCyberAI tracks every student against the target automatically and flags those drifting towards it.' },
    ],
    keywords: ['attendance percentage calculator', '75 attendance calculator for students', 'how many days to attend to reach attendance', 'exam eligibility attendance'],
    blogSlug: 'attendance-recovery-plan-for-exam-eligibility',
    product: { text: 'In NetCyberAI attendance is marked once by the class teacher, and students drifting towards the target line show up for the principal early, with an owner assigned.', href: '/products/attendance-safety', cta: 'See Attendance & Safety' },
  },
  {
    slug: 'school-capacity-planner',
    kind: 'decision',
    name: 'Capacity and Section Planner',
    menuBlurb: 'Safe seats, sections and teachers from your rooms.',
    icon: 'school',
    tone: 'trust',
    title: 'Free School Capacity and Section Planner',
    description:
      'Work out safe seats per classroom from floor area, maximum capacity, available seats, sections and teachers needed, with CBSE reference norms shown alongside.',
    heroLead:
      'Enter your classrooms, their average area, the usable share of floor and the area you allow per student, then the enrollment for each class. The planner shows safe seats per room, total capacity, seats left, sections and teachers required, and warns where rooms or enrollment cross your limits.',
    problem:
      'Admissions are often promised before anyone checks whether there is a room and a teacher for another section. Overcrowded classrooms then become an inspection finding and a parent complaint.',
    steps: [
      { name: 'Describe the rooms', text: 'Number of classrooms, average area, usable share and floor area per student.' },
      { name: 'Set section and teaching limits', text: 'Most students per section, weekly periods per section and per teacher.' },
      { name: 'Add enrollment by class', text: 'Students enrolled now and new admissions expected, class by class, or import a CSV.' },
      { name: 'Read the warnings', text: 'Room shortfall, over-capacity and any figure below the reference norms, then print the plan.' },
    ],
    faqs: [
      { question: 'What are the CBSE reference norms shown?', answer: 'The CBSE Affiliation Bye-Laws 2018 describe classrooms of at least 8 m by 6 m (about 500 sq ft), an optimum of 40 students per section and 1 sq m of floor area per student. They are shown for reference, not as legal advice.' },
      { question: 'Why are my seats per room lower than the section size?', answer: 'Because the room’s usable area, divided by the area per student, allows fewer students than the section limit. The smaller of the two decides.' },
      { question: 'How are teachers required worked out?', answer: 'Sections multiplied by weekly periods per section, divided by the periods one teacher takes a week, rounded up. Subject specialists can raise the real number.' },
      { question: 'Does it replace a building or fire safety check?', answer: 'No. State and local building rules decide what is allowed. Use this to plan and to spot problems early.' },
    ],
    keywords: ['school classroom capacity calculator', 'cbse classroom size norms', 'how many sections does my school need', 'students per classroom calculation'],
    blogSlug: 'school-capacity-and-section-planning',
    product: { text: 'NetCyberAI keeps classes, sections and enrollment in one record, so the admissions team sees seats left per class before confirming a family.', href: '/solutions/admissions', cta: 'See Admissions' },
  },
  {
    slug: 'timetable-clash-checker',
    kind: 'decision',
    name: 'Timetable Clash Checker',
    menuBlurb: 'Clashes, free periods, workload and substitutes.',
    icon: 'academics',
    tone: 'intelligence',
    title: 'Free Timetable Clash and Workload Checker',
    description:
      'Check a school timetable for teacher clashes, double-booked classes and unavailability, see free periods and workload balance, and get substitute suggestions.',
    heroLead:
      'Import or type the week’s timetable, one row per class per period, with the weekly periods each subject needs and when teachers are unavailable. The checker lists every clash and double booking, compares required with scheduled periods, shows each teacher’s load and free periods, and suggests substitutes for an absent teacher.',
    problem:
      'A timetable built in a spreadsheet hides clashes until the first week of term, and on the morning a teacher is absent nobody can see quickly who is free to cover.',
    steps: [
      { name: 'Set the week', text: 'School days and periods per day.' },
      { name: 'Add the timetable', text: 'One row per class per period: day, period, class, subject and teacher. Import a CSV for a full week.' },
      { name: 'Add rules', text: 'Weekly periods each class needs per subject, and when teachers are unavailable.' },
      { name: 'Fix and export', text: 'Work through the problems list, check workload balance, print each class timetable, and name an absent teacher to see substitutes.' },
    ],
    faqs: [
      { question: 'What counts as a clash?', answer: 'The same teacher in two different classes in the same period, or one class with two lessons in the same period. Teaching while marked unavailable is listed separately.' },
      { question: 'How are substitutes chosen?', answer: 'Only teachers with no class and no unavailability in that period. Teachers of the same subject come first, then whoever has the lightest day.' },
      { question: 'Can I share the timetable?', answer: 'Yes. The share link replaces every teacher’s name with a stand-in such as Teacher 2, so clashes still show but names never leave your device.' },
      { question: 'Does it build the timetable for me?', answer: 'No. It checks a timetable you have made. The timetable in-charge keeps the final say.' },
    ],
    keywords: ['school timetable clash checker', 'teacher timetable workload', 'substitute teacher arrangement', 'school timetable in excel checker'],
    blogSlug: 'timetable-clashes-and-substitution',
    product: { text: 'NetCyberAI keeps teachers, classes and subjects in one place, so the principal sees the day’s substitutions from the attendance of staff, not a phone round.', href: '/solutions/principal', cta: 'See the principal’s view' },
  },
  {
    slug: 'exam-marks-analyzer',
    kind: 'decision',
    name: 'Exam Marks Analyzer',
    menuBlurb: 'Averages, grades, pass or fail and at-risk students.',
    icon: 'exams',
    tone: 'alert',
    title: 'Free Exam Marks and Result Analyzer',
    description:
      'Enter or import a class’s marks to get subject averages, percentages, grades on your own scale, pass or fail, missing marks, improvement and at-risk students.',
    heroLead:
      'Type marks into the grid or import a CSV, set maximum and pass marks for each subject, and choose your grade scale. The analyzer gives each student’s total, percentage, grade and result, the class distribution, subject averages, missing marks, improvement since the last exam and a list of students who need support first.',
    problem:
      'Result day means hours of spreadsheet formulas, and the students who most need help are found by memory rather than by the numbers.',
    steps: [
      { name: 'Set up subjects', text: 'Subject names with maximum and pass marks.' },
      { name: 'Enter marks', text: 'Type into the grid or import a CSV with a Student column and one column per subject. Write AB for absent.' },
      { name: 'Choose rules', text: 'Your grade scale and the overall percentage that marks a student as at risk.' },
      { name: 'Print the analysis', text: 'Download the class report as PDF or CSV, and start with the students listed as needing support.' },
    ],
    faqs: [
      { question: 'Which grade scale does it use?', answer: 'The one you enter. A common eight-band scale is filled in to start; change it to match your board or school.' },
      { question: 'How are absent or missing marks treated?', answer: 'They make the result incomplete, never zero, and are counted separately so you can chase them before results go out.' },
      { question: 'Who is marked at risk?', answer: 'Students below your at-risk percentage, below the pass mark in any subject, or down ten or more points since the previous exam.' },
      { question: 'Are the marks sent anywhere?', answer: 'No. They stay in your browser. Saving on this device is optional and share links never include marks.' },
    ],
    keywords: ['marks analysis excel for teachers', 'result analysis of class', 'grade calculator cbse', 'exam result analysis format'],
    blogSlug: 'exam-result-analysis-for-teachers',
    product: { text: 'In NetCyberAI marks are entered once, report cards and parent updates come from the same record, and at-risk students reach the class teacher’s list automatically.', href: '/products/academics', cta: 'See Academics' },
  },
  {
    slug: 'school-payroll-planner',
    kind: 'decision',
    name: 'Payroll and Staff Cost Planner',
    menuBlurb: 'Monthly payroll, annual budget and increment scenarios.',
    icon: 'finance',
    tone: 'trust',
    title: 'Free School Payroll and Staff Cost Planner',
    description:
      'Estimate monthly school payroll, employer cost, annual staff budget, cost per student and student-teacher ratio, and compare increment scenarios side by side.',
    heroLead:
      'List each staff role with head count, basic pay, allowances and the deduction and employer rates you use. The planner totals monthly payroll and cost to the school, the annual staff budget, cost per student and students per teacher, and compares two increment scenarios, all clearly marked as estimates.',
    problem:
      'Increments and new posts are agreed in meetings without a clear view of what they add to the annual budget or to the cost per student.',
    steps: [
      { name: 'Add each role', text: 'Role, whether it is teaching, head count, basic pay and allowances.' },
      { name: 'Add your rates', text: 'Employee deduction and employer contribution as a share of basic, as your school applies them.' },
      { name: 'Add students and scenarios', text: 'Students enrolled, salary months and two increment levels to compare.' },
      { name: 'Export', text: 'Download the PDF or CSV for the management meeting.' },
    ],
    faqs: [
      { question: 'Does it calculate PF, ESI or TDS?', answer: 'No. Statutory amounts depend on thresholds and current rules. Enter the rates you apply; the planner treats them as your estimate.' },
      { question: 'What is the cost to school?', answer: 'Gross pay plus the employer contribution you entered, for every person in every role.' },
      { question: 'How is the student-teacher ratio worked out?', answer: 'Students enrolled divided by the head count of roles you marked as teaching.' },
      { question: 'Can I import my staff list?', answer: 'Yes. Import a CSV with the same column names as the table; export first to see the headings.' },
    ],
    keywords: ['school salary budget calculator', 'teacher salary cost per student', 'school payroll excel', 'staff cost planning school'],
    blogSlug: 'school-payroll-budget-planning',
    product: { text: 'NetCyberAI brings staff, fees and expenses into one view so the principal and owner see cost per student move as decisions are made.', href: '/solutions/finance', cta: 'See Finance' },
  },
  {
    slug: 'fee-leakage-calculator',
    kind: 'decision',
    name: 'Fee Leakage and Recovery Calculator',
    menuBlurb: 'Where fee money leaks and how much you can recover.',
    icon: 'alert',
    tone: 'action',
    title: 'Free Fee Leakage and Recovery Calculator',
    description:
      'Estimate yearly fee leakage from overdue fees, failed online payments and unreceipted cash, what timely reminders can recover, and a monthly recovery target.',
    heroLead:
      'Enter students, the average fee and your honest estimates of overdue fees, failed online payments and cash taken without a receipt. The calculator shows the yearly leakage, where it comes from, what reminders and retry links can recover under three scenarios, a monthly recovery target and a practical action checklist.',
    problem:
      'Most schools know fees are slipping but not how much, or from where, so recovery becomes a year-end scramble rather than a weekly habit.',
    steps: [
      { name: 'Enter the basics', text: 'Students enrolled and the average annual fee.' },
      { name: 'Estimate the leaks', text: 'Overdue share, online share, failed payments and unreceipted cash.' },
      { name: 'Set a recovery scenario', text: 'How much overdue fee timely reminders recover, how many failed payments a retry link recovers, and over how many months.' },
      { name: 'Act on the checklist', text: 'Print the report and work through the actions with the accounts team.' },
    ],
    faqs: [
      { question: 'Is unreceipted cash really leakage?', answer: 'Yes. Cash without a numbered receipt cannot be matched to a family or a bank deposit. Receipting every payment the same day closes the leak.' },
      { question: 'What is a good reminder sequence?', answer: 'A private reminder to each family three days before the due date, on the date and seven days after. Never name a family in a group or on a notice board.' },
      { question: 'Where do the recovery rates come from?', answer: 'From you. They are your estimates, and the three scenarios show how much the answer depends on them.' },
      { question: 'Can I write a reminder message here?', answer: 'The action checklist gives the sequence. NetCyberAI sends the reminders itself, one family at a time, in each family’s chosen language.' },
    ],
    keywords: ['school fee collection problems', 'fee recovery strategy for schools', 'how to reduce fee defaulters', 'school fee reminder'],
    blogSlug: 'fee-recovery-sequence-d3-to-d7-playbook',
    product: { text: 'NetCyberAI is built so each family gets its own reminder and payment link on WhatsApp, receipts follow the payment, and the overdue list updates itself. Ask us which parts are live for your school today.', href: '/features/whatsapp-fee-recovery-upi', cta: 'See WhatsApp fee recovery' },
  },
  {
    slug: 'admission-revenue-planner',
    kind: 'decision',
    name: 'Admission Capacity and Revenue Planner',
    menuBlurb: 'Seats, conversion, new sections and revenue.',
    icon: 'admissions',
    tone: 'success',
    title: 'Free Admission Capacity and Revenue Planner',
    description:
      'Plan an admission season: open seats, enquiry to admission conversion, expected admissions, new sections, first-year revenue, follow-up load and scenarios.',
    heroLead:
      'Enter total seats and continuing students, this season’s enquiries and your conversion rates, the admission and annual fees, and your team’s follow-up capacity. The planner forecasts admissions, unfilled seats or a waitlist, new sections, first-year revenue and daily follow-ups, and compares better-conversion scenarios.',
    problem:
      'Admission targets are set from last year’s feeling, and enquiries go cold because nobody can see how many follow-ups a day the season really needs.',
    steps: [
      { name: 'Enter seats', text: 'Total seats, continuing students and section size.' },
      { name: 'Enter the funnel', text: 'Enquiries so far, the share that apply and the share of applications that take admission.' },
      { name: 'Add fees and follow-up', text: 'Admission and annual fee, days left and calls your team can make a day.' },
      { name: 'Compare scenarios', text: 'See what a few points of better conversion is worth, then print the plan.' },
    ],
    faqs: [
      { question: 'Why can admissions not exceed open seats?', answer: 'Because every extra student needs a seat. Demand above the open seats is shown as a waitlist instead.' },
      { question: 'What is the follow-up queue?', answer: 'Enquiries that have not applied yet. Divided by the days left, it gives the calls needed each day.' },
      { question: 'What revenue is counted?', answer: 'The one-time admission fee plus one year of annual fee for each new student.' },
      { question: 'Where do conversion rates come from?', answer: 'Your admission register from past seasons. The scenarios show what better follow-up would change.' },
    ],
    keywords: ['school admission enquiry conversion', 'school admission planning', 'school revenue forecast', 'admission follow up tracker'],
    blogSlug: 'admission-season-capacity-and-revenue',
    product: { text: 'NetCyberAI tracks every enquiry to admission with an owner and a next step, so follow-ups happen on time and seats are never promised twice.', href: '/solutions/admissions', cta: 'See Admissions' },
  },
  {
    slug: 'teacher-workload-planner',
    kind: 'decision',
    name: 'Teacher Workload and Substitution Planner',
    menuBlurb: 'Hours, free periods, overload and substitutes.',
    icon: 'teacher',
    tone: 'communication',
    title: 'Free Teacher Workload and Substitution Planner',
    description:
      'Compare each teacher’s weekly teaching, preparation, correction and meeting hours, flag overload against your limits, and list fair substitutes for leave.',
    heroLead:
      'List each teacher with weekly teaching periods and the hours spent on preparation, correction and meetings, plus any leave this week. Set your school’s limits. The planner shows total hours, free periods and overload flags, lists substitutes for teachers on leave, and prints a weekly plan with every figure visible.',
    problem:
      'The same willing teachers absorb every substitution and extra duty until they burn out, because nobody can see the whole week’s load at once.',
    steps: [
      { name: 'Set the week', text: 'Working days, periods per day and minutes per period.' },
      { name: 'Set your limits', text: 'Most teaching periods and most working hours a week, from your policy.' },
      { name: 'Add teachers', text: 'Periods, preparation, correction, meeting hours and leave days, or import a CSV.' },
      { name: 'Share the plan', text: 'Print the weekly plan. Share links replace names with stand-ins.' },
    ],
    faqs: [
      { question: 'Is there an efficiency score?', answer: 'No. A single score hides the reasons. Every number shown comes straight from the hours and periods you entered.' },
      { question: 'How are substitutes suggested?', answer: 'From teachers not on leave and within both limits: same subject first, then the most free periods, then the lightest week.' },
      { question: 'How are periods on leave counted?', answer: 'A teacher’s periods are assumed to be spread evenly across the week, so each day of leave removes the same share.' },
      { question: 'Who sees the names?', answer: 'Only you. Names stay in your browser and are never placed in a share link.' },
    ],
    keywords: ['teacher workload calculator', 'substitute teacher allocation', 'teacher periods per week', 'teacher arrangement register'],
    blogSlug: 'fair-teacher-workload-and-substitution',
    product: { text: 'NetCyberAI gives teachers a Today screen and gives the principal a fair view of load, built from what is actually scheduled and taught.', href: '/solutions/teacher', cta: 'See the teacher’s view' },
  },
  {
    slug: 'school-operations-cost-calculator',
    kind: 'decision',
    name: 'School Operations Cost Calculator',
    menuBlurb: 'Cost per student, break-even fee and surplus.',
    icon: 'operations',
    tone: 'achievement',
    title: 'Free School Operations Cost Calculator',
    description:
      'Add up monthly school running costs to get the annual budget, cost per student, break-even fee at your real collection rate, and the surplus or deficit.',
    heroLead:
      'Enter monthly costs for payroll, rent, utilities, materials, maintenance, communication, software and transport, with students, average fee and the share of fees actually collected. The calculator gives the annual budget by category, cost per student, the break-even fee, the fee needed for your surplus and this year’s surplus or deficit.',
    problem:
      'Fee decisions are made against last year’s fee rather than this year’s cost per student, so a school can run a deficit for months without seeing it.',
    steps: [
      { name: 'Enter monthly costs', text: 'Every category the school pays each month. Leave any that do not apply at zero.' },
      { name: 'Enter students and fees', text: 'Students enrolled, the average annual fee and the share you really collect.' },
      { name: 'Choose a surplus', text: 'The margin to keep for buildings, repairs and emergencies.' },
      { name: 'Export the budget', text: 'Download the category budget as PDF or CSV.' },
    ],
    faqs: [
      { question: 'What is the break-even fee?', answer: 'The average annual fee each student must pay for fee income to cover the year’s costs, allowing for the share of fees that is never collected.' },
      { question: 'Why does collection change the answer so much?', answer: 'Because uncollected fees still leave the costs to pay. Improving collection is often faster than raising fees.' },
      { question: 'Are grants and donations included?', answer: 'No. Fee income is the only income counted; add other income by lowering the relevant costs if you prefer.' },
      { question: 'Is one-time spending included?', answer: 'No. New buildings or buses are capital spending and are left out of running cost.' },
    ],
    keywords: ['school running cost calculator', 'cost per student calculation', 'school budget template', 'break even fee for private school'],
    blogSlug: 'school-cost-per-student-and-break-even-fee',
    product: { text: 'NetCyberAI puts fees, collections and expenses side by side for the owner, so cost per student and the surplus are visible every month.', href: '/solutions/budget-private-schools', cta: 'See NetCyberAI for budget private schools' },
  },

  // ---- certificates and receipts ----------------------------------------------
  {
    slug: 'transfer-certificate-generator',
    kind: 'certificate',
    name: 'Transfer Certificate Generator',
    menuBlurb: 'A complete TC format, printed in black and white.',
    icon: 'certificate',
    tone: 'trust',
    title: 'Free Transfer Certificate (TC) Generator',
    description:
      'Make a school transfer certificate with every standard field, the date of birth in figures and words, your logo and signature, as a print-ready A4 PDF file.',
    heroLead:
      'Fill in the standard transfer certificate fields, from admission number and date of birth to dues, conduct and reason for leaving. The date of birth is written in figures and words for you, your logo is fitted automatically, and the certificate prints in black and white on A4 at 300 DPI.',
    problem:
      'Transfer certificates are still typed into old Word files, with dates of birth written in words by hand and fields forgotten, so errors reach the next school.',
    steps: certSteps('the Transfer Certificate'),
    faqs: certFaqs('transfer certificate'),
    keywords: ['transfer certificate format', 'school leaving certificate format', 'tc format for school', 'transfer certificate generator'],
    blogSlug: 'school-certificate-formats-guide',
    product: { text: 'In NetCyberAI a TC request moves through finance clearance, remarks and the principal’s signature, and the signed PDF reaches the family on WhatsApp.', href: '/features/digital-tc-character-bonafide-pipeline', cta: 'See the certificate pipeline' },
  },
  {
    slug: 'bonafide-certificate-generator',
    kind: 'certificate',
    name: 'Bonafide Certificate Generator',
    menuBlurb: 'For bank accounts, passports and scholarships.',
    icon: 'certificate',
    tone: 'product',
    title: 'Free Bonafide Certificate Generator',
    description:
      'Create a bonafide certificate for a student with class, academic year, purpose, your logo and signature. Preview it live and download a print-ready A4 PDF.',
    heroLead:
      'Enter the student, parent, class, academic year and the purpose, such as a bank account or passport. The bonafide certificate is written in standard wording, with your logo fitted and the date of birth in figures and words, ready to download as an A4 PDF at 300 DPI or print.',
    problem:
      'Bonafide requests arrive every week, each one retyped from a template with a slightly different wording and a new chance of a spelling mistake in a name.',
    steps: certSteps('the Bonafide Certificate'),
    faqs: certFaqs('bonafide certificate'),
    keywords: ['bonafide certificate format', 'bonafide certificate for bank account', 'student bonafide certificate', 'bonafide certificate generator'],
    blogSlug: 'school-certificate-formats-guide',
    product: { text: 'In NetCyberAI bonafide and study certificates are made from the student’s record, so names and dates are never retyped.', href: '/features/digital-tc-character-bonafide-pipeline', cta: 'See the certificate pipeline' },
  },
  {
    slug: 'character-certificate-generator',
    kind: 'certificate',
    name: 'Character Certificate Generator',
    menuBlurb: 'Conduct, participation and remarks, in black and white.',
    icon: 'certificate',
    tone: 'trust',
    title: 'Free Character Certificate Generator',
    description:
      'Write a school character and conduct certificate with period of study, conduct, activities and disciplinary remarks, as a black-and-white A4 PDF to print.',
    heroLead:
      'Enter the student, the period at the school, conduct, activities and any disciplinary remarks. The character certificate uses standard, fair wording, prints in black and white with your logo and signature, and downloads as an A4 PDF at 300 DPI. If there is nothing on record, it says so clearly.',
    problem:
      'Character certificates are needed in a rush at admission time, and wording varies from one clerk to the next, which colleges notice.',
    steps: certSteps('the Character Certificate'),
    faqs: certFaqs('character certificate'),
    keywords: ['character certificate format for school', 'school character certificate', 'conduct certificate format', 'character certificate generator'],
    blogSlug: 'school-certificate-formats-guide',
    product: { text: 'In NetCyberAI character certificates follow one school-approved wording and carry the principal’s sign-off, with every issue recorded.', href: '/features/digital-tc-character-bonafide-pipeline', cta: 'See the certificate pipeline' },
  },
  {
    slug: 'report-card-generator',
    kind: 'certificate',
    name: 'Report Card and Marksheet Generator',
    menuBlurb: 'Marks, grades, result and remarks on one A4 page.',
    icon: 'exams',
    tone: 'alert',
    title: 'Free Report Card and Marksheet Generator',
    description:
      'Make a student report card with theory and practical marks, totals, percentage, grades on your own scale, result, attendance and remarks, as an A4 PDF.',
    heroLead:
      'Enter the exam, the student and each subject’s maximum, theory and practical marks. Totals, percentage, subject grades on your own scale and the result are worked out for you, with attendance and remarks from the class teacher and principal, on a print-ready A4 report card at 300 DPI.',
    problem:
      'Report cards take teachers evenings of copying marks into templates, and one wrong total is enough to cost a school a parent’s trust.',
    steps: certSteps('the Report Card'),
    faqs: [
      ...certFaqs('report card').slice(0, 2),
      { question: 'Can I change the grading scale?', answer: 'Yes. Type your board’s or school’s scale as grade and lowest percentage pairs, such as A1:91, A2:81 and so on, and the pass mark per subject.' },
      certFaqs('report card')[2],
    ],
    keywords: ['report card format', 'marksheet format for school', 'report card generator', 'progress report card format'],
    blogSlug: 'school-certificate-formats-guide',
    product: { text: 'In NetCyberAI marks entered once produce the report card, the parent update and the class analysis together.', href: '/products/academics', cta: 'See Academics' },
  },
  {
    slug: 'study-certificate-generator',
    kind: 'certificate',
    name: 'Study and Enrollment Certificate Generator',
    menuBlurb: 'Proof that a student studies or studied at the school.',
    icon: 'certificate',
    tone: 'success',
    title: 'Free Study Certificate Generator',
    description:
      'Create a study or enrollment certificate showing a student’s class, academic year, admission date and purpose, with your logo, as a print-ready A4 PDF.',
    heroLead:
      'Enter the student, parent, class, academic year, admission date and purpose. The study certificate states clearly whether the student is studying or has studied at the school, with the date of birth in figures and words, your logo and signature, ready as an A4 PDF at 300 DPI.',
    problem:
      'Study certificates for scholarships, passports and transfers of parents’ jobs are requested all year, and each one is typed afresh.',
    steps: certSteps('the Study Certificate'),
    faqs: certFaqs('study certificate'),
    keywords: ['study certificate format', 'enrollment certificate for school', 'study certificate for passport', 'student study certificate'],
    blogSlug: 'school-certificate-formats-guide',
    product: { text: 'In NetCyberAI study certificates come from the enrollment record, with the right class and year every time.', href: '/features/digital-tc-character-bonafide-pipeline', cta: 'See the certificate pipeline' },
  },
  {
    slug: 'fee-receipt-generator',
    kind: 'certificate',
    name: 'Fee Receipt Generator',
    menuBlurb: 'Fee heads, discount, balance and amount in words.',
    icon: 'fees',
    tone: 'action',
    title: 'Free School Fee Receipt Generator',
    description:
      'Make a school fee receipt with fee heads, discount, late fee, amount paid, balance, payment mode, transaction ID and the amount in words, as an A4 PDF.',
    heroLead:
      'Enter the receipt number, student, fee heads and amounts, any discount or late fee and the payment details. The receipt totals everything, shows the balance, writes the amount paid in words using lakh and crore, and prints on A4 at 300 DPI or shares as a PDF by WhatsApp or email.',
    problem:
      'Hand-written receipt books go missing, totals are added wrongly, and a family with a paid receipt and a school with no record is a dispute nobody wins.',
    steps: certSteps('the Fee Receipt'),
    faqs: [
      certFaqs('fee receipt')[0],
      { question: 'Is the amount in words written for me?', answer: 'Yes, in Indian numbering with lakh and crore, for example Rupees One Lakh Twenty Thousand Only.' },
      certFaqs('fee receipt')[1],
      certFaqs('fee receipt')[2],
    ],
    keywords: ['school fee receipt format', 'fee receipt generator', 'fee receipt in word format', 'tuition fee receipt'],
    blogSlug: 'school-certificate-formats-guide',
    product: { text: 'NetCyberAI is built so the receipt follows the payment itself and the fee record updates at the same moment. Ask us which parts are live for your school today.', href: '/products/fees-billing', cta: 'See Fees & Billing' },
  },
  {
    slug: 'achievement-certificate-generator',
    kind: 'certificate',
    name: 'Achievement Certificate Generator',
    menuBlurb: 'Colourful certificates for prizes, merit and participation.',
    icon: 'trophy',
    tone: 'achievement',
    title: 'Free Achievement and Participation Certificate',
    description:
      'Design colourful achievement, merit, improvement and participation certificates for students or teachers, with your logo, two signatures and optional QR.',
    heroLead:
      'Choose achievement, merit, improvement or participation, enter the name, the award and the event, and pick a colourful or classic design. Add your logo and up to two signatures, and an optional QR code with the certificate details, then download an A4 PDF at 300 DPI or print it.',
    problem:
      'Annual day and competition certificates are made in a hurry in design apps, with names misspelled and no record of what was issued.',
    steps: certSteps('an Achievement Certificate'),
    faqs: [
      certFaqs('achievement certificate')[0],
      { question: 'Can I make certificates for a whole class at once?', answer: 'Yes. Open a CSV of up to 200 names and the tool makes one PDF with a page for each, numbered in sequence. In NetCyberAI the list comes from your student records and each certificate reaches the family on WhatsApp.' },
      certFaqs('achievement certificate')[1],
      certFaqs('achievement certificate')[3],
    ],
    keywords: ['certificate of achievement for students', 'participation certificate format', 'merit certificate template', 'school certificate maker'],
    blogSlug: 'school-certificate-formats-guide',
    product: { text: 'NetCyberAI celebrates each child’s personal best with parents on WhatsApp, not only the top three.', href: '/features/parent-weekly-confidence-brief', cta: 'See the weekly confidence brief' },
  },

  // ---- data checks ----------------------------------------------------------------
  {
    slug: 'student-import-checker',
    kind: 'data',
    name: 'Student Import Checker',
    menuBlurb: 'Check a student list for errors before you move it.',
    icon: 'check',
    tone: 'success',
    title: 'Free Student Import Checker',
    description:
      'Check your student list CSV for missing names, wrong dates and duplicate admission numbers before any import. It runs in your browser; nothing is uploaded.',
    heroLead:
      'Moving student records from a register or spreadsheet is where most school data problems start. Paste or open your CSV here and see every missing name, badly written date and duplicate admission number, row by row. The check runs in your browser, so your students’ details never leave your computer.',
    problem:
      'A student list with duplicate admission numbers or impossible dates, once imported, spreads its errors into fees, attendance and certificates for years.',
    steps: [
      { name: 'Open your CSV', text: 'Paste it or choose the file. It is read in your browser only.' },
      { name: 'Read the summary', text: 'Rows found, rows ready, missing columns and unknown columns.' },
      { name: 'Fix row by row', text: 'Every problem row is listed with the reason, including duplicate admission numbers.' },
      { name: 'Check again', text: 'Fix the spreadsheet, export again and re-check until every row is ready.' },
    ],
    faqs: [
      { question: 'Is the student list uploaded?', answer: 'No. The file is read in your browser and nothing is sent anywhere.' },
      { question: 'Which date formats are accepted?', answer: 'Dates written as year, month and day, such as 2015-04-23. Other formats are listed so you can fix them before import.' },
      { question: 'What columns does it expect?', answer: 'At least a name column. Admission number, class and date of birth are checked when present.' },
      { question: 'Why check before importing?', answer: 'Because a wrong row copied into a school system is much harder to find later than in a spreadsheet today.' },
    ],
    keywords: ['student data import template', 'check duplicate admission numbers', 'student list excel format', 'school data migration'],
    blogSlug: 'onboarding-500-students-without-dpdp-problem',
    product: { text: 'In NetCyberAI the same checks run when a school imports its list: every valid row is saved in one step, and every problem row is reported back instead of silently dropped.', href: '/products/school-management', cta: 'See School Management' },
  },
  {
    slug: 'student-data-check',
    kind: 'data',
    name: 'Student Data Check for UDISE+ and APAAR',
    menuBlurb: 'Find name and date of birth mismatches before APAAR.',
    icon: 'search',
    tone: 'success',
    title: 'Free Student Data Check for UDISE+ and APAAR',
    description:
      'Compare your school register with Aadhaar details to find the name, date of birth and gender mismatches that stop APAAR IDs and print parent correction letters.',
    heroLead:
      'Open your student list with each name, date of birth and gender as the school records them and as printed on Aadhaar. The check lists every mismatch that can stop an APAAR ID being created, sorts them by what to fix first, and prints a correction request for each family to sign.',
    problem:
      'APAAR IDs are created only when the school’s UDISE+ record matches Aadhaar, so one spelling or date difference leaves a child without an ID and the office chasing families at the last minute.',
    steps: [
      { name: 'Open your list', text: 'Paste a CSV or open the file, with the school’s and Aadhaar’s name, date of birth and gender for each student. Download the template to start.' },
      { name: 'Read the mismatches', text: 'Every difference is listed by type: exact match, spacing or capitals only, a likely spelling slip, names in another order, or a real difference.' },
      { name: 'Print the correction letters', text: 'One letter per family shows both versions side by side and asks which is right, with space to sign. Your school’s details fill the letterhead.' },
      { name: 'Correct and check again', text: 'Fix the school record or ask the family to correct Aadhaar, then run the check again until every row matches.' },
    ],
    faqs: [
      { question: 'Is the student list uploaded?', answer: 'No. The file is read in your browser and nothing is sent to NetCyberAI. Closing the tab clears it. Save your corrected list as a CSV on your own computer.' },
      { question: 'Why do mismatches stop APAAR IDs?', answer: 'APAAR ID creation checks the name, date of birth and gender in the school’s UDISE+ record against Aadhaar. When they differ, the ID is not created until one of the two records is corrected.' },
      { question: 'Which record should be corrected?', answer: 'The one that is wrong. A school record error is corrected in UDISE+, which may need approval from the block or district office. An Aadhaar error is corrected by the family with UIDAI.' },
      { question: 'Does it catch small spelling differences?', answer: 'Yes. It separates differences of spacing or capitals, a single changed letter, and names written in another order from real differences, so a person can decide each one quickly.' },
      { question: 'What does the parent letter say?', answer: 'It names the student and class, shows the school’s and Aadhaar’s versions side by side, and asks the family to confirm the right one and bring proof. You print or share each letter yourself.' },
    ],
    keywords: ['apaar id name mismatch', 'udise plus student data correction', 'aadhaar name mismatch in school records', 'apaar id not generated'],
    product: { text: 'NetCyberAI is built to check each student record as it is entered, list mismatches for the office with an owner, and ask families on WhatsApp to confirm corrections. Ask us which parts are live for your school today.', href: '/products/school-management', cta: 'See School Management' },
  },

  // ---- compliance and claims ------------------------------------------------------
  {
    slug: 'rte-claim-sheet-builder',
    kind: 'compliance',
    name: 'RTE Reimbursement Claim Sheet Builder',
    menuBlurb: 'Claim per child, a document checklist and unpaid dues.',
    icon: 'compliance',
    tone: 'trust',
    title: 'Free RTE Reimbursement Claim Sheet Builder',
    description:
      'Build an RTE section 12(1)(c) reimbursement claim per child at the lower of the state rate and your fee, check each child’s documents, and track unpaid dues.',
    heroLead:
      'List the children admitted under RTE section 12(1)(c), the state’s per-child rate for the year and the fee your school charges. The builder claims the lower of the two for each child, as section 12(2) of the Act sets, checks every child’s documents, and shows how long each year’s claim has stayed unpaid.',
    problem:
      'RTE reimbursement claims are rebuilt from registers every year, one missing document holds up the whole claim, and dues from earlier years are forgotten once the new session starts.',
    steps: [
      { name: 'Enter the year’s rates', text: 'The state’s per-child rate from your state’s notification for the year, and the fee your school charges, by class if it differs.' },
      { name: 'Add the children', text: 'Type each child or open a CSV with the name, class and admission date. Download the template to start.' },
      { name: 'Tick the documents', text: 'Mark each document you hold for every child. Rename or add items to match your state’s portal.' },
      { name: 'Record claims and payments', text: 'For each year, the date the claim was filed and what has been received, so the oldest dues show first.' },
      { name: 'Print the claim sheet', text: 'Download the claim sheet and the missing-document list as a PDF or CSV, with your school’s details at the top.' },
    ],
    faqs: [
      { question: 'How is the amount per child worked out?', answer: 'Section 12(2) of the RTE Act reimburses the lower of the state’s per-child expenditure and the amount the school actually charges. The builder applies that rule to the two figures you enter for each child.' },
      { question: 'Where do I find the state rate?', answer: 'In your state’s RTE reimbursement notification for the year, or from the block or district education office. Rates differ by state and change each year, so the builder never fills one in for you.' },
      { question: 'Does it file the claim on the state portal?', answer: 'No. It prepares the figures, the document checklist and a printable claim sheet. Filing is done on your state’s RTE portal or with the education office.' },
      { question: 'What does the ageing show?', answer: 'For each academic year, the amount claimed, the amount received, what is still due and the days since the claim was filed, so the oldest dues are followed up first.' },
      { question: 'Is any child’s data stored?', answer: 'No. The children’s details stay in this browser tab only. Save the list as a CSV file on your computer to continue later. The rates and document list you set are remembered in this browser.' },
    ],
    keywords: ['rte reimbursement claim format', 'rte 12(1)(c) reimbursement calculation', 'rte fee reimbursement for private schools', 'rte claim documents checklist'],
    product: { text: 'NetCyberAI is built to keep each RTE child’s documents on the student record, fill the claim from enrolment and fee records, and track every unpaid claim by age. Ask us which parts are live for your school today.', href: '/products/fees-billing', cta: 'See Fees & Billing' },
  },
  {
    slug: 'teacher-qualification-register',
    kind: 'compliance',
    name: 'Teacher Qualification and TET Register',
    menuBlurb: 'Degrees, training, TET status and expiry dates, in one list.',
    icon: 'staff',
    tone: 'product',
    title: 'Free Teacher Qualification and TET Register',
    description:
      'Keep every teacher’s degree, B.Ed or D.El.Ed, TET or CTET status and certificate dates in one register, see gaps and expiries early and print it for inspection.',
    heroLead:
      'Add each teacher with the stage they teach, their degree, professional training and TET or CTET result. The register flags anything missing against the rules you set for each stage, lists certificates and approvals running out soon, and prints a clean register for inspections and affiliation visits.',
    problem:
      'Qualification records sit in personal files, so a missing TET result or an expired approval is found by the inspector instead of by the school.',
    steps: [
      { name: 'Set the rules for each stage', text: 'Choose what each stage needs, from a degree and professional training to a TET. TET starts marked as needed for classes I to VIII.' },
      { name: 'Add your teachers', text: 'Type each teacher or open a CSV. Download the template to see the columns.' },
      { name: 'Read the gaps and expiries', text: 'Missing qualifications and certificates ending within the window you choose are listed first, teacher by teacher.' },
      { name: 'Print the register', text: 'Download the register as a PDF or CSV with your school’s details at the top, ready for an inspection.' },
    ],
    faqs: [
      { question: 'Does the register know the official rules?', answer: 'It starts with TET marked as needed for classes I to VIII, as the NCTE requires under the RTE Act, and lets you set what else each stage needs. Rules differ by board and state, so check them against your affiliation bye-laws.' },
      { question: 'How are TET certificate dates handled?', answer: 'In 2021 the NCTE made TET qualifying certificates valid for life. If a certificate or approval still shows an end date, enter it and the register warns you before it passes.' },
      { question: 'Is teacher data stored?', answer: 'Not unless you choose. The list stays in this tab, and you can save it as a CSV file. On a school computer used only by staff, tick Keep on this device to find it here next time.' },
      { question: 'Can I print it for an inspection?', answer: 'Yes. The register prints on A4 with your school’s name and codes at the top, one row per teacher, with gaps and expiry dates shown clearly.' },
    ],
    keywords: ['teacher qualification register format', 'tet and ctet status of teachers', 'staff qualification record for school', 'teacher eligibility test record'],
    product: { text: 'NetCyberAI is built to keep each teacher’s qualifications on the staff record and tell the principal before a certificate or approval runs out. Ask us which parts are live for your school today.', href: '/solutions/principal', cta: 'See NetCyberAI for principals' },
  },

  // ---- follow-up trackers -----------------------------------------------------------
  {
    slug: 'admissions-enquiry-tracker',
    kind: 'office',
    name: 'Admissions Enquiry Tracker',
    menuBlurb: 'Every enquiry with a next step and a follow-up date.',
    icon: 'admissions',
    tone: 'action',
    title: 'Free Admissions Enquiry Tracker for Schools',
    description:
      'Track every admission enquiry from first call to confirmed seat, with a next step and follow-up date for each family, conversion by stage and source, and a CSV.',
    heroLead:
      'Add each enquiry with the class wanted, where the family heard of you and the next step. The tracker lists who to call today, who is overdue and who has gone quiet, shows how many enquiries reach a visit, a form and a confirmed seat, and opens a ready WhatsApp follow-up on your own phone.',
    problem:
      'Enquiries arrive by phone, WhatsApp and walk-in, are noted on paper or in one person’s phone, and the families nobody called back join another school.',
    steps: [
      { name: 'Add each enquiry', text: 'The parent’s name and phone, the class wanted, the source and the next step with a date. Open a CSV to bring in an existing list.' },
      { name: 'Work today’s list', text: 'Follow-ups due today and overdue ones come first. Record what happened and set the next date in one step.' },
      { name: 'Move each family on', text: 'From enquiry to visit, form, admission or not joining, with the reason kept for later.' },
      { name: 'Read the numbers', text: 'Enquiries by stage and by source, and how many became admissions, as a PDF or CSV.' },
    ],
    faqs: [
      { question: 'Where is the enquiry list kept?', answer: 'In this tab, and only on this device if you tick Keep on this device, which suits a computer used only by school staff. Nothing is sent to NetCyberAI. Save the list as a CSV at any time.' },
      { question: 'Which stages does it use?', answer: 'Enquiry, visit booked, visited, form taken, form submitted, admitted and not joining. The not joining reason is kept so you can see why families chose elsewhere.' },
      { question: 'Does it send messages to parents?', answer: 'No. It opens WhatsApp on your own phone or computer with a short follow-up message you can edit before sending. Nothing is sent automatically.' },
      { question: 'How is conversion worked out?', answer: 'Admitted families divided by all enquiries in the list, and the same for each source, so you can see which sources bring families who actually join.' },
    ],
    keywords: ['school admission enquiry register', 'admission enquiry follow up format', 'school admission tracker', 'admission conversion rate for schools'],
    product: { text: 'NetCyberAI is built to turn each WhatsApp enquiry into a record with an owner and a follow-up date, and a confirmed admission into a student and a fee plan. Ask us which parts are live for your school today.', href: '/solutions/admissions', cta: 'See NetCyberAI for admissions' },
  },
  {
    slug: 'fee-promise-tracker',
    kind: 'office',
    name: 'Fee Promise-to-Pay Tracker',
    menuBlurb: 'Promises to pay, kept and broken, and hardship cases.',
    icon: 'fees',
    tone: 'alert',
    title: 'Free Fee Promise-to-Pay Tracker for Schools',
    description:
      'Record each family’s promise to pay overdue fees, see the promises due today and the broken ones, keep hardship requests with a named person and print the list.',
    heroLead:
      'Note each family that owes fees, the amount, the date they promised to pay and who is following up. The tracker shows promises due today, kept and broken, and the amount promised against the amount received, and keeps families who ask for help apart with a named staff member, never a reminder.',
    problem:
      'Promises made at the fee counter live in someone’s memory or on loose paper, so nobody follows up on the day, and families in genuine difficulty get the same reminders as everyone else.',
    steps: [
      { name: 'Add each promise', text: 'The student, class, amount due, the amount and date promised, and who is following up.' },
      { name: 'Work today’s list', text: 'Promises due today and broken ones come first. Record a payment, a new date or a request for help.' },
      { name: 'Handle hardship with care', text: 'Mark a family as needing help and name the person who will speak to them. They are kept off every reminder list.' },
      { name: 'Print the follow-up list', text: 'Download the list as a PDF or CSV with your school’s details, for the fee desk or the principal.' },
    ],
    faqs: [
      { question: 'When is a promise kept or broken?', answer: 'Kept when the amount promised is recorded as paid by the promised date. Broken when the date passes without it. A part payment shows as partly kept, with the balance still due.' },
      { question: 'How are hardship cases handled?', answer: 'They are kept apart, with a named staff member, and never appear in the reminder list. A person decides on extra time, instalments or a concession, as your school’s policy allows.' },
      { question: 'Does it send fee reminders?', answer: 'No. It opens WhatsApp on your own phone with a short, polite message you can edit before sending, and never for a family marked as needing help.' },
      { question: 'Is the list stored anywhere?', answer: 'Only in this tab, or on this device if you tick Keep on this device on a computer used only by staff. Nothing is sent to NetCyberAI. Save the list as a CSV at any time.' },
    ],
    keywords: ['school fee follow up register', 'fee defaulter list format', 'promise to pay tracker', 'school fee recovery follow up'],
    product: { text: 'In NetCyberAI a promise to pay is matched to the payment when it reaches the school’s bank, reminders go one family at a time, and hardship requests go to a named person.', href: '/features/whatsapp-fee-recovery-upi', cta: 'See WhatsApp fee recovery' },
  },

  // ---- teacher help -------------------------------------------------------------------
  {
    slug: 'report-card-remarks-builder',
    kind: 'teaching',
    name: 'Report Card Remarks Builder',
    menuBlurb: 'Specific, kind remarks drafted for the teacher to edit.',
    icon: 'academics',
    tone: 'achievement',
    title: 'Free Report Card Remarks Builder',
    description:
      'Draft specific, kind report card remarks for a whole class from marks, attendance and one strength and one next step per child, then edit each before you print.',
    heroLead:
      'Add each student’s overall percentage, attendance, one strength and one thing to work on. The builder drafts a specific, encouraging remark for every child from a bank of teacher-written phrases, varies the wording across the class, and leaves every draft for you to edit before you copy or print it.',
    problem:
      'Writing forty different remarks at the end of term takes teachers whole evenings, and tired remarks turn vague or repeated, which parents notice.',
    steps: [
      { name: 'Add the class', text: 'Each student’s name, overall percentage and attendance, typed or opened from a CSV.' },
      { name: 'Pick a strength and a next step', text: 'Choose one of each per child from the lists, such as neat work or reading aloud, or type your own.' },
      { name: 'Edit the drafts', text: 'Every remark is a draft. Change any word, or draft one again for different wording.' },
      { name: 'Copy or print', text: 'Copy the remarks into your report cards, download a CSV, or print the class list with your school’s details.' },
    ],
    faqs: [
      { question: 'Is this written by AI?', answer: 'No. Remarks are built from a fixed bank of phrases written for teachers, chosen by the student’s marks, attendance and the strength and next step you pick. The same inputs always give the same choices.' },
      { question: 'Will two students get the same remark?', answer: 'The builder varies the opening and the phrasing across the class, so remarks do not repeat word for word. Read each one and edit it so it sounds like you.' },
      { question: 'Does it label children?', answer: 'No. Phrases describe effort, habits and the next step, never fixed labels such as weak or slow. Low marks lead to a specific, encouraging next step.' },
      { question: 'Is student data saved?', answer: 'No. The class stays in this tab and is cleared when you close it. Download a CSV to keep your remarks on your own computer.' },
    ],
    keywords: ['report card remarks for students', 'teacher remarks for report card', 'positive remarks for students', 'progress report comments for teachers'],
    product: { text: 'NetCyberAI is built to draft remarks from the marks and attendance already in the system, for the teacher to edit and approve. Ask us which parts are live for your school today.', href: '/solutions/teacher', cta: 'See NetCyberAI for teachers' },
  },
  {
    slug: 'lesson-plan-worksheet-maker',
    kind: 'teaching',
    name: 'Lesson Plan and Worksheet Maker',
    menuBlurb: 'A timed lesson plan and a printable worksheet, together.',
    icon: 'homework',
    tone: 'intelligence',
    title: 'Free Lesson Plan and Worksheet Maker',
    description:
      'Lay out a timed lesson plan with objectives, activities and checks for understanding and turn your questions into a printable worksheet with your school header.',
    heroLead:
      'Enter the class, subject, topic, period length and what students should learn. The maker splits the period into warm-up, teaching, practice and review with timings, adds your activities and questions, and prints the plan and a matching worksheet with your school’s name, lines for the student’s name and an answer key.',
    problem:
      'Lesson plans are rewritten into registers to satisfy inspections, and worksheets are typed from scratch every week, time that should go into teaching.',
    steps: [
      { name: 'Describe the lesson', text: 'Class, subject, topic, period length and two or three learning objectives.' },
      { name: 'Set the timings', text: 'Adjust how the period is split between warm-up, teaching, practice and review. The minutes always add up to the period.' },
      { name: 'Add the questions', text: 'Short answer, fill in the blank, multiple choice or true or false, each with its answer for the key.' },
      { name: 'Print both', text: 'Print or download the lesson plan and the worksheet, with the answer key on a separate page.' },
    ],
    faqs: [
      { question: 'Does it write the lesson for me?', answer: 'No. It lays out what you type into a clear, timed plan and a clean worksheet. Drafting plans and worksheets from your syllabus is what NetCyberAI’s teacher tools are built for.' },
      { question: 'Which question types can I use?', answer: 'Short answer, fill in the blank, multiple choice with up to four options, and true or false. Each question carries its answer for the key.' },
      { question: 'Is the answer key printed with the worksheet?', answer: 'It prints on its own page after the worksheet, so you can hand out the questions and keep the answers.' },
      { question: 'Is my lesson saved?', answer: 'Yes, if you choose. A lesson plan holds no student’s details, so you can keep it in this browser and open it again. Nothing is sent to NetCyberAI.' },
    ],
    keywords: ['lesson plan format for teachers', 'worksheet maker for school', 'daily lesson plan template', 'printable worksheet generator'],
    product: { text: 'NetCyberAI is built to lay lesson plans out across the term against your syllabus and draft worksheets for the teacher to review. Ask us which parts are live for your school today.', href: '/solutions/teacher', cta: 'See NetCyberAI for teachers' },
  },
];

export function findFreeTool(slug: string): FreeTool | undefined {
  return freeTools.find((t) => t.slug === slug);
}

export function toolsOfKind(kind: FreeToolKind): FreeTool[] {
  return freeTools.filter((t) => t.kind === kind);
}

// Old addresses of tools removed in the C78 audit, kept alive as redirects.
export const REMOVED_TOOL_REDIRECTS = [
  { source: '/free-tools/attendance-calculator', destination: '/free-tools/attendance-recovery-planner' },
  { source: '/free-tools/fee-reminder-message', destination: '/free-tools/fee-leakage-calculator' },
  { source: '/free-tools/daily-pulse-message', destination: '/features/daily-learning-pulse-hinglish' },
];
