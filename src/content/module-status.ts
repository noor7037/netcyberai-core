import type { ModuleId } from '@/demo-fixture/principal-dashboard';

// Where each module of the founder's principal dashboard stands in the
// REAL product. Decided by evidence in code and schema, mirroring
// docs/12_CAPABILITY_MATRIX.md; the demo on the website never changes a
// status. "Build step" refers to that document's dependency-first order.
//
//   live        usable today in the school app
//   partial     some of the module is live, the rest is not
//   foundation  tables (and sometimes server logic) exist, no usable screen
//   planned     specified in the product documents, not built yet
//   needs-spec  not in the product documents; waiting for the founder's
//               module specification before it can be built

export type ModuleStatus = 'live' | 'partial' | 'foundation' | 'planned' | 'needs-spec';

export const STATUS_LABEL: Record<ModuleStatus, string> = {
  live: 'Live',
  partial: 'Partly live',
  foundation: 'Foundation built',
  planned: 'Planned',
  'needs-spec': 'Needs specification',
};

export const moduleStatus: Record<ModuleId, { status: ModuleStatus; note: string }> = {
  setup: { status: 'partial', note: 'Classes and sections are live; academic sessions and subjects have their backend, office screens are next.' },
  admissions: { status: 'planned', note: 'An enrolment queue exists; the enquiry-to-offer pipeline is build step 7.' },
  students: { status: 'live', note: 'Student records, CSV import, document scan with autofill and QR ID cards.' },
  parents: { status: 'partial', note: 'Guardians, verification, DPDP consent and data requests are live on each student’s page; a Parents screen of its own is not built. Parents are reached on WhatsApp; there is no parent app.' },
  staff: { status: 'partial', note: 'Invitations, accounts and staff leave are live: a member of staff asks, the office decides, and the leave calendar shows who is away. Staff records, documents and workload are not built yet.' },
  academics: { status: 'partial', note: '“Taught today” per class and subject is live for teachers; lesson plans are planned.' },
  attendance: { status: 'live', note: 'Class attendance marking, with absence alerts on WhatsApp once a school leaves pilot mode.' },
  timetable: { status: 'partial', note: 'Period entry with a clash guard, CSV import and each teacher’s week are live; the generator, workload and change history are build step 7.' },
  homework: { status: 'partial', note: 'A teacher sets homework with a photo or PDF, copies it to sections and checks who has done it; parents do not receive it yet.' },
  exams: { status: 'foundation', note: 'Exam and marks tables exist; entry, report cards and Personal Best are build step 5.' },
  fees: { status: 'partial', note: 'The office sets fee heads and each class’s fee structure with dated versions, raises a month’s dues, records approved concessions, marks RTE admissions, takes payments at the counter and issues numbered receipts. Payment links and reminders are being built (build step 4).' },
  payroll: { status: 'needs-spec', note: 'Listed only as a later roadmap card; needs a specification (salary heads, statutory rules) to build.' },
  communication: { status: 'partial', note: 'The consent-checked WhatsApp send-gate and absence alerts are live; notices and templates are next.' },
  events: { status: 'planned', note: 'School calendar, events and PTM are on the roadmap.' },
  documents: { status: 'partial', note: 'QR ID cards are live; certificates behind fee clearance are build step 6.' },
  complaints: { status: 'needs-spec', note: 'Not in the current product documents.' },
  reports: { status: 'partial', note: 'A fixed list of reports for each role, each for a date range with a total and a CSV of the same rows. A report builder, scheduled reports and PDF are not built yet.' },
  'learning-genome': { status: 'needs-spec', note: 'Not in the current product documents.' },
  'early-warning': { status: 'partial', note: 'Version 1, for staff only: flags by rules from attendance, homework and “needs help” follow-ups, each with its evidence, and a log of what a person did. Marks join later; nothing is sent to parents.' },
  'teacher-copilot': { status: 'foundation', note: 'Version 1 is built and tested on a stand-in: drafts from the syllabus map, edited and approved by the teacher, metered per school. It is not switched on for any school, and no AI model is connected yet.' },
  'school-auditor': { status: 'needs-spec', note: 'Not in the current product documents.' },
  'parent-ai': { status: 'needs-spec', note: 'Not in the current product documents.' },
  recovery: { status: 'partial', note: 'Version 1: lists students who missed several homeworks, suggests a catch-up plan and records the teacher’s approval; parents are not informed yet.' },
  'curriculum-gap': { status: 'needs-spec', note: 'Not in the current product documents.' },
  automation: { status: 'needs-spec', note: 'Not in the current product documents.' },
  career: { status: 'needs-spec', note: 'Not in the current product documents.' },
  twin: { status: 'needs-spec', note: 'Not in the current product documents.' },
  compliance: { status: 'partial', note: 'Consent ledger, audit trail and data requests are live; APAAR is on the later roadmap.' },
  pulse: { status: 'partial', note: 'One tap “taught today” prepares the day’s message in English, Hindi and Hinglish with the homework; the teacher can change it and mark it ready, and the “needs help” queue is live. Sending and parents’ replies are not built yet.' },
  ptm: { status: 'planned', note: 'Part of the school calendar on the roadmap.' },
  proxy: { status: 'partial', note: 'When a teacher is on approved leave, the app lists their periods and the teachers who are free, and the office assigns cover with one tap; the substitute sees it in the app, not by a message.' },
  'help-center': { status: 'live', note: 'Step-by-step guides in English and Hindi, inside the school app and on the website.' },
  'raise-ticket': { status: 'live', note: 'A school raises a ticket with a screenshot; NetCyberAI answers in the app.' },
};

// The evidence behind "live" (T5, C140). A module may say `live` only when
// its screen, its API and its table exist in this repository;
// scripts/check_module_status.py fails CI otherwise, so the website can
// never call something live that a school cannot use.
//
//   route  folder under src/app/(school)/app with the module's own page
//   api    folder under src/app/api/app with its route
//   table  a table created in supabase/migrations
//
// `null` with `why` where a module truly has none (the Help Center's guides
// are files in the repository; nothing is stored).
export const LIVE_EVIDENCE: Partial<Record<ModuleId, { route: string; api: string | null; table: string | null; why?: string }>> = {
  students: { route: 'students', api: 'students', table: 'students' },
  attendance: { route: 'attendance', api: 'attendance', table: 'attendance' },
  'help-center': { route: 'help', api: null, table: null, why: 'The guides are files in src/content/help; no API serves them and nothing is stored.' },
  'raise-ticket': { route: 'help/ticket', api: 'tickets', table: 'support_tickets' },
};
