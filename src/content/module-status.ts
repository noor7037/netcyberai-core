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
  staff: { status: 'foundation', note: 'Teacher records exist; leave and substitution are on the roadmap.' },
  academics: { status: 'partial', note: '“Taught today” per class and subject is live for teachers; lesson plans are planned.' },
  attendance: { status: 'live', note: 'Class attendance marking, with absence alerts on WhatsApp once a school leaves pilot mode.' },
  timetable: { status: 'partial', note: 'Period entry with a clash guard, CSV import and each teacher’s week are live; the generator, workload and change history are build step 7.' },
  homework: { status: 'planned', note: 'Build step 7.' },
  exams: { status: 'foundation', note: 'Exam and marks tables exist; entry, report cards and Personal Best are build step 5.' },
  fees: { status: 'foundation', note: 'Fee structures, ledger and payment tables exist; reminders, payments and receipts are build step 4.' },
  payroll: { status: 'needs-spec', note: 'Listed only as a later roadmap card; needs a specification (salary heads, statutory rules) to build.' },
  communication: { status: 'partial', note: 'The consent-checked WhatsApp send-gate and absence alerts are live; notices and templates are next.' },
  events: { status: 'planned', note: 'School calendar, events and PTM are on the roadmap.' },
  documents: { status: 'partial', note: 'QR ID cards are live; certificates behind fee clearance are build step 6.' },
  complaints: { status: 'needs-spec', note: 'Not in the current product documents.' },
  reports: { status: 'planned', note: 'Built after the modules they report on.' },
  'learning-genome': { status: 'needs-spec', note: 'Not in the current product documents.' },
  'early-warning': { status: 'foundation', note: 'The at-risk signal table exists; signals need attendance and marks history (build step 5).' },
  'teacher-copilot': { status: 'needs-spec', note: 'Not in the current product documents.' },
  'school-auditor': { status: 'needs-spec', note: 'Not in the current product documents.' },
  'parent-ai': { status: 'needs-spec', note: 'Not in the current product documents.' },
  recovery: { status: 'needs-spec', note: 'Not in the current product documents.' },
  'curriculum-gap': { status: 'needs-spec', note: 'Not in the current product documents.' },
  automation: { status: 'needs-spec', note: 'Not in the current product documents.' },
  career: { status: 'needs-spec', note: 'Not in the current product documents.' },
  twin: { status: 'needs-spec', note: 'Not in the current product documents.' },
  compliance: { status: 'partial', note: 'Consent ledger, audit trail and data requests are live; APAAR is on the later roadmap.' },
  pulse: { status: 'foundation', note: 'Pulse tables exist and “taught today” feeds them; composing, sending and replies are build step 3.' },
  ptm: { status: 'planned', note: 'Part of the school calendar on the roadmap.' },
  proxy: { status: 'planned', note: 'Substitution follows staff leave on the roadmap.' },
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
