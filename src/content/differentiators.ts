import type { IconName } from '@/components/visual/Icons';
import type { Tone } from '@/lib/semantic';
import type { ModuleId } from '@/demo-fixture/principal-dashboard';

// The follow-up work an ordinary school ERP leaves to the office, shown on
// the homepage (founder, 2026-10-14, Decision Log C198-B). Each card says
// where it stands today and links the free tool a school can use now.
// The status is checked against src/content/module-status.ts by
// differentiators.test.ts, so this list cannot drift ahead of the product.

export type DifferentiatorStatus = 'app' | 'switching-on' | 'planned';

export const DIFFERENTIATOR_STATUS_LABEL: Record<DifferentiatorStatus, string> = {
  app: 'In the school app',
  'switching-on': 'Built, not switched on yet',
  planned: 'Planned',
};

export interface Differentiator {
  id: string;
  title: string;
  body: string;
  points: string[];
  icon: IconName;
  tone: Tone;
  status: DifferentiatorStatus;
  // The module whose status backs this card, when one exists.
  moduleId?: ModuleId;
  freeTools: string[];
  more?: { href: string; label: string };
}

export const differentiators: Differentiator[] = [
  {
    id: 'fee-recovery',
    title: 'Fee recovery that is fair to families',
    body: 'Overdue fees followed up one family at a time, with a person deciding the hard cases.',
    points: [
      'A promise to pay recorded with a date and the person following it up',
      'A follow-up list for the fee desk, oldest dues first',
      'Families in hardship go to a named staff member, never to automated reminders',
      'Parents pay by UPI straight into the school’s own account',
    ],
    icon: 'fees',
    tone: 'action',
    status: 'app',
    moduleId: 'fees',
    freeTools: ['fee-promise-tracker'],
    more: { href: '/features/whatsapp-fee-recovery-upi', label: 'See fee recovery' },
  },
  {
    id: 'compliance-desk',
    title: 'A compliance desk, not a scramble',
    body: 'The evidence inspections and affiliation ask for, collected while the year happens.',
    points: [
      'Fee disclosure forms such as Haryana’s Form 6, from one fee record',
      'The mandatory public disclosure kept current',
      'SQAAF evidence gathered through the year',
      'Teacher qualifications and TET tracked, with expiry alerts',
    ],
    icon: 'compliance',
    tone: 'trust',
    status: 'planned',
    freeTools: ['teacher-qualification-register'],
  },
  {
    id: 'student-data-check',
    title: 'Student data that does not block a child',
    body: 'Mismatches found before they stop an APAAR ID or a UDISE+ update.',
    points: [
      'Names, dates of birth and gender compared with what Aadhaar prints, typed by the school and never the number',
      'Spelling slips and swapped dates told apart from real differences',
      'Each family asked to confirm the correction once the school’s WhatsApp is on, with the reply kept',
    ],
    icon: 'search',
    tone: 'success',
    status: 'app',
    moduleId: 'compliance',
    freeTools: ['student-data-check', 'student-import-checker'],
  },
  {
    id: 'rte-claim-desk',
    title: 'An RTE claim desk',
    body: 'What the school is owed for RTE seats, claimed in full and followed until paid.',
    points: [
      'An evidence file for each child from admission onward',
      'A claim at the lower of the state’s rate and the school’s fee, with the rate’s source on record',
      'Unpaid dues aged year by year, oldest first',
    ],
    icon: 'reports',
    tone: 'achievement',
    status: 'app',
    moduleId: 'fees',
    freeTools: ['rte-claim-sheet-builder'],
  },
  {
    id: 'teacher-help',
    title: 'Help for teachers, approved by teachers',
    body: 'Drafts that save evenings, with nothing used until the teacher has edited it.',
    points: [
      'Lesson plans and worksheets drafted from the syllabus',
      'Report card remarks drafted from marks and attendance',
      'Every draft edited and approved by the teacher first',
    ],
    icon: 'copilot',
    tone: 'product',
    status: 'switching-on',
    moduleId: 'teacher-copilot',
    freeTools: ['report-card-remarks-builder', 'lesson-plan-worksheet-maker'],
  },
  {
    id: 'admissions-follow-up',
    title: 'Admissions that are followed up',
    body: 'Every enquiry with an owner and a date, so no family is forgotten.',
    points: [
      'Each enquiry with the next step and a follow-up date',
      'Families who have gone quiet brought back to the top',
      'A confirmed admission becomes a student record, with the class’s fees',
    ],
    icon: 'admissions',
    tone: 'communication',
    status: 'app',
    moduleId: 'admissions',
    freeTools: ['admissions-enquiry-tracker'],
  },
];
