import type { StaffRole } from '@/lib/auth/types';
import type { IconName } from '@/components/visual/Icons';
import type { colors } from '@/lib/design-tokens';

// The module registry (Decision Log C110): every navigation item of
// docs/17_MODULE_CATALOG.md §3 (Dashboard + 33 modules = 34 items), with
// its navigation group (§2), tone (§4), icon, roles (§5), phase and status
// (§3) and capability list. Navigation, screens and badges are built from
// it; nothing hard-codes a module list. Ids are the demo's own (src/demo-fixture/principal-dashboard.ts),
// so the real product and the website demo name modules the same way.

export const MODULE_IDS = [
  'dashboard',
  'setup', 'admissions', 'students', 'parents', 'staff',
  'academics', 'attendance', 'timetable', 'proxy', 'homework', 'recovery', 'exams',
  'pulse', 'communication', 'ptm', 'events', 'complaints',
  'fees', 'payroll',
  'documents', 'compliance', 'reports',
  'early-warning', 'learning-genome', 'curriculum-gap', 'teacher-copilot', 'parent-ai', 'school-auditor', 'career', 'twin', 'automation',
  'help-center', 'raise-ticket',
] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

export const MODULE_GROUP_IDS = ['home', 'school-people', 'teaching-learning', 'parent-engagement', 'finance', 'records-compliance', 'ai-intelligence', 'help'] as const;
export type ModuleGroupId = (typeof MODULE_GROUP_IDS)[number];

// A colour of the logo token set (src/lib/design-tokens.ts). Nothing else.
export type ColorToken = keyof typeof colors;

export type ModuleGroup = {
  id: ModuleGroupId;
  label: string;
  order: number;
  // Primary and secondary hue (17 §4).
  tone: readonly [ColorToken, ColorToken];
};

export const MODULE_GROUPS: readonly ModuleGroup[] = [
  { id: 'home', label: 'Home', order: 1, tone: ['royal', 'electric'] },
  { id: 'school-people', label: 'School & People', order: 2, tone: ['sapphire', 'royal'] },
  { id: 'teaching-learning', label: 'Teaching & Learning', order: 3, tone: ['royal', 'azure'] },
  { id: 'parent-engagement', label: 'Parent Engagement', order: 4, tone: ['cyan', 'turquoise'] },
  { id: 'finance', label: 'Finance', order: 5, tone: ['tangerine', 'amber'] },
  { id: 'records-compliance', label: 'Records & Compliance', order: 6, tone: ['emerald', 'turquoise'] },
  { id: 'ai-intelligence', label: 'AI Intelligence', order: 7, tone: ['grape', 'violet'] },
  { id: 'help', label: 'Help', order: 8, tone: ['gold', 'sunshine'] },
];

export const PHASES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P7b', 'P8'] as const;
export type Phase = (typeof PHASES)[number];

// 17's status key. `spec-v0`: specified by the supervisor, the founder
// confirms before its phase.
export const MODULE_STATUSES = ['live', 'partial', 'foundation', 'planned', 'spec-v0'] as const;
export type ModuleStatus = (typeof MODULE_STATUSES)[number];

// Roles of the school app. super_admin works in the Control Plane, not here.
export type SchoolRole = Exclude<StaffRole, 'super_admin'>;
export const SCHOOL_ROLES: readonly SchoolRole[] = ['principal', 'school_admin', 'teacher', 'accountant', 'academic_coordinator'];

export type ModuleDefinition = {
  id: ModuleId;
  label: string;
  group: ModuleGroupId;
  icon: IconName;
  tone: readonly [ColorToken, ColorToken];
  // Roles that see this module in the school app (17 §5).
  roles: readonly SchoolRole[];
  // `ownClassesOnly`: a teacher sees only their own classes' data here (17 §5).
  teacherScope?: 'ownClassesOnly';
  // The phase that completes the module; `phaseNote` when parts land earlier.
  phase: Phase;
  phaseNote?: string;
  status: ModuleStatus;
  capabilities: readonly string[];
  // Phone bottom bar order (17 §4: the teacher shell keeps bottom
  // navigation): modules with a priority appear there, lowest first, when
  // the role may use them and the school has them (C121).
  mobilePriority?: number;
  // The school-app route, reserved for every module. Modules without a
  // screen yet (status planned, foundation or spec-v0) are still linked:
  // the app shows a "coming in <phase>" page at that route,
  // never a 404.
  href: string;
};

const ALL: readonly SchoolRole[] = SCHOOL_ROLES;
const OFFICE: readonly SchoolRole[] = ['principal', 'school_admin'];
const TEACHING: readonly SchoolRole[] = ['principal', 'school_admin', 'teacher', 'academic_coordinator'];
const ENGAGEMENT: readonly SchoolRole[] = ['principal', 'school_admin', 'teacher'];
const FINANCE: readonly SchoolRole[] = ['principal', 'school_admin', 'accountant'];
const LEARNING_AI: readonly SchoolRole[] = ['principal', 'school_admin', 'academic_coordinator'];
const REPORTS: readonly SchoolRole[] = ['principal', 'school_admin', 'accountant', 'academic_coordinator'];

type Row = Omit<ModuleDefinition, 'tone' | 'href'> & { href?: string };

const ROWS: readonly Row[] = [
  { id: 'dashboard', mobilePriority: 1, label: 'Dashboard', group: 'home', icon: 'dashboard', roles: ALL, phase: 'P5', phaseNote: 'The office’s dashboard is live on the school’s own records for today, 7 or 30 days: every number opens the rows it counts, and what is on screen exports as a CSV; every other role opens My Day', status: 'partial',
    capabilities: ['Role dashboards: principal, office, finance, academic, teacher', 'Every tile real and drill-down', 'Date range', 'Alerts feed', 'Export'] },

  { id: 'setup', label: 'Setup', group: 'school-people', icon: 'school', roles: OFFICE, phase: 'P7', phaseNote: 'Parts live', status: 'partial',
    capabilities: ['Academic sessions', 'Classes and sections', 'Subjects', 'Teacher assignment', 'School profile', 'Branding', 'Grading schemes', 'Calendar defaults', 'Onboarding checklist', 'Promotion rules and one-click promote'] },
  { id: 'admissions', label: 'Admissions', group: 'school-people', icon: 'admissions', roles: OFFICE, phase: 'P7', status: 'planned',
    capabilities: ['Enquiry → visit → application → test/interview → offer → enrol pipeline', 'Sources', 'Follow-up tasks', 'Conversion analytics', 'Converts to Student', 'Kanban board', 'Online admission form', 'Sibling linking'] },
  { id: 'students', label: 'Students', group: 'school-people', icon: 'student', roles: OFFICE, phase: 'P7', phaseNote: 'Live; Student 360 search in P1', status: 'live',
    capabilities: ['Profile', 'CSV import', 'Document scan with OCR autofill', 'QR ID cards', 'Siblings', 'Promotions', 'Transfers', 'History', 'Student 360 search'] },
  { id: 'parents', label: 'Parents', group: 'school-people', icon: 'parent', roles: OFFICE, phase: 'P4', phaseNote: 'One screen a guardian: children, consent, number, data requests. A teacher opens a guardian of their own classes from Communication', status: 'partial',
    capabilities: ['Guardians', 'Verification', 'DPDP consent', 'Data requests', 'Contact preferences', 'WhatsApp linkage'] },
  { id: 'staff', label: 'Staff', group: 'school-people', icon: 'staff', roles: OFFICE, phase: 'P5', phaseNote: 'Invitations, accounts and leave (ask on My account, the office decides, the leave calendar) are live; staff records, documents, workload and staff attendance later', status: 'partial',
    capabilities: ['Staff records', 'Roles', 'Documents', 'Leave requests and approvals', 'Workload', 'Attendance', 'Staff invitations'] },

  { id: 'academics', label: 'Academics', group: 'teaching-learning', icon: 'academics', roles: TEACHING, teacherScope: 'ownClassesOnly', phase: 'P2', status: 'partial',
    capabilities: ['Syllabus map', '“Taught today”', 'Lesson plans', 'Coverage', 'Objectives met', 'Classwork logbook shared with parents the same evening'] },
  { id: 'attendance', mobilePriority: 2, label: 'Attendance', group: 'teaching-learning', icon: 'attendance', roles: TEACHING, teacherScope: 'ownClassesOnly', phase: 'P2', status: 'live',
    capabilities: ['Class marking', 'Present All', 'Late and leave codes', 'Staff attendance', 'Absence alerts', 'Trends', 'Chronic-absence signal', 'Import from sheet'] },
  { id: 'timetable', label: 'Timetable', group: 'teaching-learning', icon: 'timetable', roles: TEACHING, phase: 'P7', phaseNote: 'Entry, clash guard and each teacher’s week are live (P2); the generator in P7', status: 'partial',
    capabilities: ['Periods', 'Generator with constraints', 'Teacher and class views', 'Clash guard', 'Workload', 'Change history'] },
  { id: 'proxy', label: 'Proxy Auto', group: 'teaching-learning', icon: 'proxy', roles: TEACHING, phase: 'P5', phaseNote: 'The periods of a teacher on leave, the free teachers in order, one-tap assign and undo, and the teacher’s covers on My Day are live; the substitute is told in the app, not by a message', status: 'partial',
    capabilities: ['Leave-driven substitution suggestions by free period and subject fit', 'One-tap assign', 'Notify substitute'] },
  { id: 'homework', mobilePriority: 3, label: 'Homework', group: 'teaching-learning', icon: 'homework', roles: TEACHING, teacherScope: 'ownClassesOnly', phase: 'P2', phaseNote: 'Set, copy to sections and check are live; sharing with parents in P4', status: 'partial',
    capabilities: ['Set with photo or attachment', 'Due dates', 'Completion by parent reply', 'Class completion stats', 'Copy to many sections', 'Online submission and evaluation'] },
  { id: 'recovery', label: 'Homework Recovery', group: 'teaching-learning', icon: 'recovery', roles: TEACHING, teacherScope: 'ownClassesOnly', phase: 'P2', phaseNote: 'Detect, suggest and approve are live (v1); the parent message in P4', status: 'partial',
    capabilities: ['Detect students missing homework repeatedly in a window', 'Suggest a catch-up plan', 'Teacher approves', 'Parent informed via Pulse'] },
  { id: 'exams', label: 'Exams & Report Card', group: 'teaching-learning', icon: 'exams', roles: TEACHING, teacherScope: 'ownClassesOnly', phase: 'P6', phaseNote: 'The school’s board and its grading scheme are live; so are exams with a paper for each class and subject, marks entry on a phone (absent and exempt are not zero), each class’s result in roll order, publishing a class (its marks frozen until the principal reopens it with a reason), and report card PDFs with Personal Best and Most Improved where the plan has them', status: 'partial',
    capabilities: ['Exam setup', 'Marks entry with validation', 'Bulk marks from Excel', 'Grading', 'Report card PDF', 'Holistic Progress Card', 'Admit cards', 'Publish', 'Personal Best and Most Improved'] },

  { id: 'pulse', mobilePriority: 4, label: 'Daily Pulse', group: 'parent-engagement', icon: 'pulse', roles: ENGAGEMENT, teacherScope: 'ownClassesOnly', phase: 'P4', phaseNote: 'The needs-help queue is live (P2); compose next; sending in P4', status: 'partial',
    capabilities: ['Compose from “taught today”', 'Hinglish, Hindi and English', 'Send on WhatsApp', 'Understanding replies', 'Teacher follow-up queue', 'Response-rate North Star'] },
  { id: 'communication', label: 'Communication', group: 'parent-engagement', icon: 'chat', roles: ENGAGEMENT, teacherScope: 'ownClassesOnly', phase: 'P4', status: 'partial',
    capabilities: ['Notices for school and class', 'One notice to every channel', 'Templates', 'Send-gate: consent, quiet hours, budget', 'Delivery states', 'Failure retry', 'Cost view'] },
  { id: 'ptm', label: 'PTM Scheduler', group: 'parent-engagement', icon: 'ptm', roles: ENGAGEMENT, teacherScope: 'ownClassesOnly', phase: 'P4', phaseNote: 'Slots for class teachers and, when chosen, subject teachers; booking by reply, reminder and attendance are live', status: 'partial',
    capabilities: ['Slots per teacher', 'Parent booking over WhatsApp', 'Reminders', 'Attendance', 'Notes'] },
  { id: 'events', label: 'Events', group: 'parent-engagement', icon: 'events', roles: ENGAGEMENT, phase: 'P4', phaseNote: 'Events, invitations, YES and NO counted, reminder and cancellation are live; calendar and photos later', status: 'partial',
    capabilities: ['School calendar', 'Holidays', 'Events', 'RSVPs', 'Reminders'] },
  { id: 'complaints', label: 'Complaints', group: 'parent-engagement', icon: 'complaints', roles: ENGAGEMENT, teacherScope: 'ownClassesOnly', phase: 'P4', phaseNote: 'Recording, owner, due time, notes, closing with a note and passing an overdue one to the principal are live; categories and intake straight from WhatsApp later', status: 'partial',
    capabilities: ['Intake from WhatsApp and web', 'Category', 'Owner', 'SLA timer', 'Status machine', 'Resolution note', 'Escalation to principal'] },

  { id: 'fees', label: 'Fees', group: 'finance', icon: 'fees', roles: FINANCE, phase: 'P3', phaseNote: 'Structures, dues, concessions, RTE marks, counter payments and receipts are live; payment links and reminders next (email in P3, WhatsApp from P4)', status: 'partial',
    capabilities: ['Heads and structures', 'Concessions and scholarships', 'Late-fee rules', 'Ledger', 'Razorpay payment link and UPI QR', 'Receipts', 'Auto reminders', 'Reconciliation', 'Clearance gate'] },
  { id: 'payroll', label: 'Payroll', group: 'finance', icon: 'finance', roles: FINANCE, phase: 'P7', status: 'spec-v0',
    capabilities: ['Salary structures', 'Statutory rules as configuration', 'Monthly run state machine', 'Payslip PDF', 'Bank export', 'Loans and advances from Staff'] },

  { id: 'documents', label: 'Documents & Certificates', group: 'records-compliance', icon: 'certificate', roles: OFFICE, phase: 'P7', status: 'partial', href: '/app/documents-id-cards',
    capabilities: ['ID cards', 'Certificate types', 'Request → fee clearance or waiver → PDF → WhatsApp delivery → audit'] },
  { id: 'compliance', label: 'Compliance Pro · APAAR', group: 'records-compliance', icon: 'shield', roles: OFFICE, phase: 'P7', status: 'partial',
    capabilities: ['Consent ledger', 'Audit trail', 'Data requests', 'APAAR ID capture and validation', 'UDISE+ readiness report', 'Fee-regulation advisory'] },
  { id: 'reports', label: 'Reports', group: 'records-compliance', icon: 'reports', roles: REPORTS, phase: 'P5', phaseNote: 'A fixed list of reports by role (collection, dues, attendance, absentees, homework, Daily Pulse, messages, staff leave), each with a date range, a total and a CSV of the same rows, is live; a report builder, scheduled reports and PDF later', status: 'partial',
    capabilities: ['Report builder across modules', 'Scheduled reports by email or WhatsApp', 'CSV and PDF export'] },

  // A teacher reads the flags of their own classes, which the database decides (C209).
  { id: 'early-warning', label: 'Early Warning', group: 'ai-intelligence', icon: 'earlyWarning', roles: TEACHING, teacherScope: 'ownClassesOnly', phase: 'P6', phaseNote: 'v1 is live for staff only: flags by rules from attendance, homework and needs-help follow-ups, each with its reasons, evidence and rule version, and a log of what was done; marks join in P6; nothing is sent to parents', status: 'partial',
    capabilities: ['Attendance, marks, homework and Pulse signals', 'Flags with their reasons and evidence, never a score', 'Action log', 'Parent dispatch gated by legal basis'] },
  // A teacher reads the genome of the children of their own classes, which the database decides (C217).
  { id: 'learning-genome', label: 'Learning Genome', group: 'ai-intelligence', icon: 'genome', roles: TEACHING, teacherScope: 'ownClassesOnly', phase: 'P6', phaseNote: 'v1 is live for staff only: one child’s own percent in each exam with marks entered, homework done and the Daily Pulse replies to each chapter, with strengths and gaps by the school’s settings, comparing the child only with themselves; published results replace entered marks when report cards come; nothing is sent to parents', status: 'partial',
    capabilities: ['Per-student skill map by subject and chapter', 'Strengths and gaps', 'Shown to teachers, summarised to parents'] },
  // The office and the coordinator read every class; a teacher their own classes, which the database decides (C216).
  { id: 'curriculum-gap', label: 'Curriculum Gap Detector', group: 'ai-intelligence', icon: 'curriculumGap', roles: TEACHING, teacherScope: 'ownClassesOnly', phase: 'P6', phaseNote: 'For a class and subject, each unit of the syllabus map as taught and assessed, taught but not assessed, assessed before it was taught, skipped or not taught yet, with the days it rests on and a count of each, is live; rules only', status: 'partial',
    capabilities: ['Planned vs taught vs assessed', 'Flags untaught or unassessed chapters per class'] },
  { id: 'teacher-copilot', label: 'Teacher Copilot', group: 'ai-intelligence', icon: 'copilot', roles: TEACHING, phase: 'P2', phaseNote: 'Built on a stand-in (v1); off for every school until the founder sets a key and a monthly limit', status: 'foundation',
    capabilities: ['Drafts lesson plans, worksheets, Pulse messages and remarks', 'Teacher edits and approves', 'Usage metered'] },
  // Teachers review the suggestions for their own classes (C112).
  { id: 'parent-ai', label: 'Parent AI · What to Do?', group: 'ai-intelligence', icon: 'parentAi', roles: ENGAGEMENT, teacherScope: 'ownClassesOnly', phase: 'P4', phaseNote: 'An answer for one child, drafted from the school’s records and approved by a person, is live; a weekly answer for every child later', status: 'partial',
    capabilities: ['Weekly “what to do at home” per child', 'In the family’s language', 'Teacher-reviewed templates'] },
  { id: 'school-auditor', label: 'School Health Auditor', group: 'ai-intelligence', icon: 'auditor', roles: OFFICE, phase: 'P5', phaseNote: 'Twelve checks by fixed rules, each passing, needing attention with a count and the screen that fixes it, or not set up; "N of M checks pass" and a dated record of each check-up are live. Rules only: no AI model', status: 'partial',
    capabilities: ['Checks across attendance, timetable, fees, communication, complaints and staff, never a score', 'Why each check says what it says', 'Fix list'] },
  { id: 'career', label: 'Career Graph', group: 'ai-intelligence', icon: 'career', roles: OFFICE, phase: 'P7', status: 'spec-v0',
    capabilities: ['From class 9', 'Interests and subject performance → career clusters', 'Stream guidance', 'Counsellor notes'] },
  { id: 'twin', label: 'Digital Twin', group: 'ai-intelligence', icon: 'twin', roles: OFFICE, phase: 'P7', status: 'spec-v0',
    capabilities: ['What-if simulator on the school’s own data', 'Stated assumptions'] },
  { id: 'automation', label: 'Automation OS', group: 'ai-intelligence', icon: 'automation', roles: OFFICE, phase: 'P7', status: 'spec-v0',
    capabilities: ['Rule builder: trigger → condition → action', 'Prebuilt automations', 'Every run audited', 'Human approval for parent-facing actions'] },

  { id: 'help-center', label: 'Help Center', group: 'help', icon: 'support', roles: ALL, phase: 'P1', status: 'live', href: '/app/help',
    capabilities: ['In-app guides per module', 'Search'] },
  { id: 'raise-ticket', label: 'Raise Ticket', group: 'help', icon: 'ticket', roles: ALL, phase: 'P1', status: 'live', href: '/app/help/ticket',
    capabilities: ['Ticket with screenshot', 'Status', 'Founder queue in Control'] },
];

const groupTone = (id: ModuleGroupId) => MODULE_GROUPS.find((g) => g.id === id)!.tone;

export const MODULE_REGISTRY: readonly ModuleDefinition[] = ROWS.map((r) => ({
  ...r,
  tone: groupTone(r.group),
  href: r.href ?? `/app/${r.id}`,
}));

export function moduleById(id: ModuleId): ModuleDefinition {
  const m = MODULE_REGISTRY.find((x) => x.id === id);
  if (!m) throw new Error(`unknown module ${id}`);
  return m;
}

export function isModuleId(value: unknown): value is ModuleId {
  return typeof value === 'string' && (MODULE_IDS as readonly string[]).includes(value);
}
