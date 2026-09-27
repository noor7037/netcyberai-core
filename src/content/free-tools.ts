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

export type FreeToolKind = 'decision' | 'certificate' | 'data';

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

export const FREE_TOOLS_UPDATED = '27 September 2026';

export const TRIAL_CTA = {
  text: 'NetCyberAI can automate all these types of requests. Book your free 1-month trial session instantly to streamline your workflows.',
  href: '/start-pilot',
  button: 'Book your free trial session',
};

export const KIND_LABELS: Record<FreeToolKind, { title: string; blurb: string }> = {
  decision: { title: 'Planning and decision tools', blurb: 'Fees, attendance, capacity, timetables, marks, payroll and budgets.' },
  certificate: { title: 'Certificates and receipts', blurb: 'Print-ready A4 documents with your logo. Nothing is uploaded.' },
  data: { title: 'Data checks', blurb: 'Check a list before it goes anywhere.' },
};

const certSteps = (doc: string): FreeTool['steps'] => [
  { name: 'Choose the design', text: `Pick ${doc} and a template. Black-and-white templates suit official records; colour suits celebrations.` },
  { name: 'Add your school details', text: 'Type the school name, affiliation number and address, and add your logo from the gallery. Save a school profile file to reuse next time.' },
  { name: 'Fill in the student details', text: 'The live preview updates as you type. Required fields are marked with a star.' },
  { name: 'Generate, then download or print', text: 'Press Generate, then download the A4 PDF at 300 DPI or print it. Start new keeps the school details and moves the number on by one.' },
];

const certFaqs = (doc: string): FreeTool['faqs'] => [
  {
    question: `Is my ${doc} data uploaded or stored anywhere?`,
    answer: 'No. The form, the logo and the finished certificate stay in your browser tab and are never sent to NetCyberAI. Closing or refreshing the tab clears them. The PDF is made on your device.',
  },
  {
    question: 'How many certificates can I make for free?',
    answer: 'Three without an account. After that, a free account (name, school and phone, no payment) unlocks unlimited certificates on that browser. We do not save certificates or form data.',
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
      { question: 'Can I make many certificates at once?', answer: 'Yes. Download the CSV template, add one row per student, and the studio makes one PDF with a page for each, stopping first if two rows share a number.' },
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
