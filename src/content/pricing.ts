import type { IconName } from '@/components/visual/Icons';
import type { Tone } from '@/lib/semantic';

// Pricing, as data. Every commercial statement carries a status:
//
//   confirmed  backed by the repository, the live system or an approved
//              product document; the page states it as fact.
//   proposed   requested by the founder but not yet an approved
//              commercial term; the page does NOT publish it. Flip to
//              'confirmed' only when it is an approved commitment.
//   gap        no evidence, or evidence against it; never published.
//
// Plan contents come from docs/04_SYSTEM_DESIGN_PRD.md §8.1 (module map
// per tier); plan names follow the founder's 2026-09-27 instruction
// (Free / Starter / Growth / Compass, Compass replacing Campus).

export type ClaimStatus = 'confirmed' | 'proposed' | 'gap';

export interface CommercialClaim {
  id: string;
  title: string;
  body: string;
  icon: IconName;
  tone: Tone;
  status: ClaimStatus;
  evidence: string;
}

export const commercialClaims: CommercialClaim[] = [
  {
    id: 'pilot-first',
    title: 'Pilot before you commit',
    body: 'Every school starts in pilot mode with outbound WhatsApp switched off, so nothing reaches a parent until you are ready.',
    icon: 'lock',
    tone: 'trust',
    status: 'confirmed',
    evidence: 'schools.pilot_allow_outbound defaults to false; the send-gate blocks and logs blocked_pilot.',
  },
  {
    id: 'data-in-india',
    title: 'Your data stays in India',
    body: 'The school database runs in the Mumbai region, and every school’s records are isolated from every other school’s.',
    icon: 'shield',
    tone: 'success',
    status: 'confirmed',
    evidence: 'Supabase project region ap-south-1; row-level security with a two-school isolation test suite.',
  },
  {
    id: 'whatsapp-at-cost',
    title: 'WhatsApp costs, stated openly',
    body: 'Meta bills WhatsApp messages separately from NetCyberAI. We show you the current rate card rather than hiding it inside a bundle.',
    icon: 'chat',
    tone: 'communication',
    status: 'confirmed',
    evidence: 'PRD §8.3 and Constitution: messaging cost disclosed with the rate and its verification date.',
  },
  {
    id: 'change-plans',
    title: 'Change plans as you grow',
    body: 'Move between plans as your school’s needs change. A plan is not a one-time lock-in decision.',
    icon: 'arrow',
    tone: 'product',
    status: 'confirmed',
    evidence: 'Existing pricing FAQ; plans gate modules via plan_modules feature flags (PRD §8).',
  },
  {
    id: 'per-student-15',
    title: 'Per-student price of fifteen rupees a month',
    body: 'Simple per-student pricing.',
    icon: 'fees',
    tone: 'action',
    status: 'proposed',
    evidence: 'Founder request 2026-09-27. PRD §9 lists final ₹ pricing as a GAP. Not an approved commercial term yet.',
  },
  {
    id: 'first-month-free',
    title: 'Free first month with full capabilities',
    body: 'Your first month on NetCyberAI is free, with every feature and the latest modules, counted from the day your school is set up.',
    icon: 'sparkle',
    tone: 'achievement',
    status: 'confirmed',
    evidence: 'Founder approval (Noor), 2026-09-27, Decision Log C76: publish now as a standing commercial term.',
  },
  {
    id: 'free-plan-permanent',
    title: 'A permanent free plan',
    body: 'A free plan for small schools, for as long as you need it.',
    icon: 'school',
    tone: 'success',
    status: 'proposed',
    evidence: 'Founder request 2026-09-27. PRD §8.1 has no free tier; its modules and limits are undefined.',
  },
  {
    id: 'no-setup-fees',
    title: 'No setup fees',
    body: 'Setting up your school costs nothing.',
    icon: 'check',
    tone: 'success',
    status: 'confirmed',
    evidence: 'Founder approval (Noor), 2026-09-27, Decision Log C76: publish now as a standing commercial term.',
  },
  {
    id: 'cancel-anytime',
    title: 'Cancel anytime, no questions asked',
    body: 'Leave whenever you choose. No lock-in period and no questions asked.',
    icon: 'arrow',
    tone: 'product',
    status: 'confirmed',
    evidence: 'Founder approval (Noor), 2026-09-27, Decision Log C76: publish now as a standing commercial term.',
  },
  {
    id: 'free-training',
    title: 'Complete SOP & free staff training',
    body: 'A complete standard operating procedure for your school, and free training for your principal, office staff and teachers, so nobody is left to work it out alone.',
    icon: 'teacher',
    tone: 'success',
    status: 'confirmed',
    evidence: 'Founder approval (Noor), 2026-09-27, Decision Log C76: setup and staff training are free.',
  },
  {
    id: 'go-live-24h',
    title: 'Online in under 24 hours',
    body: 'Your school is set up and live in under 24 hours once your student list is ready, with no technical skills needed.',
    icon: 'operations',
    tone: 'product',
    status: 'confirmed',
    evidence: 'Founder commitment (Noor), 2026-09-28, Decision Log C79. Scoped to a ready student list: the validated CSV import saves every valid row in one step. Messy or paper data is covered by free-data-upload, not by this 24-hour promise.',
  },
  {
    id: 'free-data-upload',
    title: 'We upload your data, free',
    body: 'No Excel sheet? Send your registers or old software export and our team prepares and uploads your data at no cost.',
    icon: 'users',
    tone: 'success',
    status: 'confirmed',
    evidence: 'Founder commitment (Noor), 2026-09-28, Decision Log C79: onboarding support for schools without spreadsheet data is free.',
  },
  {
    id: 'digital-migration',
    title: 'Seamless move from registers to digital',
    body: 'We support a seamless migration from physical registers and ledgers to the digital era.',
    icon: 'reports',
    tone: 'product',
    status: 'confirmed',
    evidence: 'Founder commitment (Noor), 2026-09-28, Decision Log C80; delivered by free-data-upload (our team prepares and uploads register data at no cost).',
  },
  {
    id: 'money-back-6m',
    title: 'Six-month 100% money-back guarantee',
    body: 'Six-month 100% money-back guarantee if you see no overall growth, including student learning growth and institutional development.',
    icon: 'shield',
    tone: 'success',
    status: 'confirmed',
    evidence: 'Source: founder commitment (Noor), 2026-09-28, Decision Log C80. Published as a commercial term; the measurement of "overall growth" must be written into the school agreement before the first paid term.',
  },
  {
    id: 'migration-24h',
    title: 'Migration in 24 hours',
    body: 'Your data moved in a day.',
    icon: 'operations',
    tone: 'product',
    status: 'gap',
    evidence: 'Migration time depends on each school’s data quality; the import reports problem rows rather than guessing. Not promisable.',
  },
  {
    id: 'daily-backups',
    title: 'Daily backups',
    body: 'Your data backed up every day.',
    icon: 'shield',
    tone: 'trust',
    status: 'gap',
    evidence: 'Launch prerequisite (docs/13_LAUNCH_CHECKLIST.md row 1): paid database tier with daily backups and a tested restore. Flip to confirmed when done.',
  },
  {
    id: 'enterprise-security',
    title: 'Enterprise-grade security',
    body: 'Enterprise-grade security.',
    icon: 'lock',
    tone: 'trust',
    status: 'gap',
    evidence: 'Unverifiable marketing phrase. Replaced by the specific, verified facts in "Your data stays in India".',
  },
  {
    id: 'sla',
    title: 'Uptime SLA',
    body: 'A contractual uptime commitment.',
    icon: 'chart',
    tone: 'trust',
    status: 'gap',
    evidence: 'Launch prerequisite (docs/13_LAUNCH_CHECKLIST.md row 2): monitoring must exist to measure an SLA, and a target must be chosen.',
  },
];

export const publishedClaims = commercialClaims.filter((c) => c.status === 'confirmed');

// The promise chips under the homepage headline (founder, C76). Each shows
// only while its claim is confirmed above; a confirmed fact fills in if one
// is ever withdrawn.
const HERO_PREFERRED: { claim: string; label: string }[] = [
  { claim: 'no-setup-fees', label: 'No setup fees' },
  { claim: 'free-training', label: 'Complete SOP & free staff training' },
  { claim: 'first-month-free', label: 'Free first month with full capabilities' },
  { claim: 'digital-migration', label: 'Seamless move from registers & ledgers to digital' },
];
const HERO_FALLBACK: { claim: string; label: string }[] = [
  { claim: 'pilot-first', label: 'Pilot mode first' },
  { claim: 'data-in-india', label: 'Data stays in India' },
  { claim: 'whatsapp-at-cost', label: 'WhatsApp costs shown openly' },
];

// The guarantee line shown under the hero chips (founder, C80), only while
// the claim is confirmed.
export function heroGuarantee(): string | null {
  const c = commercialClaims.find((x) => x.id === 'money-back-6m');
  return c && c.status === 'confirmed' ? c.body : null;
}

export function heroChips(): string[] {
  const ok = (id: string) => commercialClaims.find((c) => c.id === id)?.status === 'confirmed';
  return [...HERO_PREFERRED, ...HERO_FALLBACK].filter((c) => ok(c.claim)).slice(0, 4).map((c) => c.label);
}

export interface Plan {
  id: 'free' | 'starter' | 'growth' | 'compass';
  name: string;
  forWhom: string;
  highlights: string[];
  support: string;
  cta: { label: string; href: string };
  recommended?: boolean;
}

export const plans: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    forWhom: 'Any school, today, with no account',
    highlights: ['Student Import Checker', 'Attendance Calculator', 'Fee reminder and parent update builders'],
    support: 'Self-serve',
    cta: { label: 'Open the free tools', href: '/free-tools' },
  },
  {
    id: 'starter',
    name: 'Starter',
    forWhom: 'Smaller schools going digital for the first time',
    highlights: ['Student records and CSV import', 'Attendance with parent alerts', 'Fees and receipts', 'DPDP consent and reports'],
    support: 'Email',
    cta: { label: 'Get a quote', href: '#quote' },
  },
  {
    id: 'growth',
    name: 'Growth',
    forWhom: 'The core NetCyberAI experience',
    highlights: ['Everything in Starter', 'Daily Learning Pulse on WhatsApp', 'Personal Best recognition', 'Admissions, exams and report cards', 'Document scan, QR ID cards'],
    support: 'Email and WhatsApp',
    cta: { label: 'Get a quote', href: '#quote' },
    recommended: true,
  },
  {
    id: 'compass',
    name: 'Compass',
    forWhom: 'Established schools that want the full picture',
    highlights: ['Everything in Growth', 'Weekly Confidence Brief', 'Private Teacher Impact Card', 'At-risk signals', 'Staff, leave and academic planning'],
    support: 'Priority',
    cta: { label: 'Get a quote', href: '#quote' },
  },
];

// Module comparison (PRD §8.1). `live` mirrors docs/12_CAPABILITY_MATRIX.md
// so the table can say honestly which modules a school can use today.
export interface ModuleRow {
  module: string;
  live: boolean;
  in: Record<Plan['id'], boolean>;
}

const row = (module: string, live: boolean, free: boolean, starter: boolean, growth: boolean, compass: boolean): ModuleRow => ({
  module,
  live,
  in: { free, starter, growth, compass },
});

export const moduleRows: ModuleRow[] = [
  row('Free browser tools', true, true, true, true, true),
  row('Student records and CSV import', true, false, true, true, true),
  row('Attendance and absence alerts', true, false, true, true, true),
  row('Guardians and DPDP consent', true, false, true, true, true),
  row('Fees and receipts', false, false, true, true, true),
  row('Reports', false, false, true, true, true),
  row('Document scan with autofill', true, false, false, true, true),
  row('QR ID cards', true, false, false, true, true),
  row('Admissions pipeline', false, false, false, true, true),
  row('Exams and report cards', false, false, false, true, true),
  row('Daily Learning Pulse', false, false, false, true, true),
  row('Personal Best recognition', false, false, false, true, true),
  row('Weekly Confidence Brief', false, false, false, false, true),
  row('Teacher Impact Card', false, false, false, false, true),
  row('At-risk signals', false, false, false, false, true),
  row('Staff and leave', false, false, false, false, true),
];
