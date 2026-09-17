import type { NavItem } from '@/components/shell/TopNav';

// Platform 2 -- admin control plane. 13 top-level items, verbatim from
// docs/04_SYSTEM_DESIGN_PRD.md §7.2.
export const controlNav: NavItem[] = [
  { label: 'Dashboard', href: '/control' },
  { label: 'Schools', href: '/control/schools' },
  { label: 'Users', href: '/control/users' },
  { label: 'Onboarding', href: '/control/onboarding' },
  { label: 'Messaging & Cost', href: '/control/messaging-cost' },
  { label: 'Monitoring', href: '/control/monitoring' },
  { label: 'Analytics', href: '/control/analytics' },
  { label: 'Billing & Plans', href: '/control/billing-plans' },
  { label: 'Compliance', href: '/control/compliance' },
  { label: 'Integrations', href: '/control/integrations' },
  { label: 'Support', href: '/control/support' },
  { label: 'Audit Logs', href: '/control/audit-logs' },
  { label: 'System Settings', href: '/control/system-settings' },
];

// School detail -- PRD §7.2 labels this "19 sub-tabs" but its own list
// (Overview through Audit) has 21 entries. Real discrepancy in the
// source doc, not a miscount here -- flagged in this prompt's report
// and worth a Decision Log entry; every item the PRD actually lists is
// built below rather than silently truncated to make "19" true.
export const schoolDetailTabs: { id: string; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'profile', label: 'Profile' },
  { id: 'users', label: 'Users' },
  { id: 'students', label: 'Students' },
  { id: 'staff', label: 'Staff' },
  { id: 'admissions', label: 'Admissions' },
  { id: 'academics', label: 'Academics' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'exams', label: 'Exams' },
  { id: 'fees', label: 'Fees' },
  { id: 'communication', label: 'Communication' },
  { id: 'pulse-engagement', label: 'Pulse & Engagement' },
  { id: 'recognition', label: 'Recognition' },
  { id: 'teacher-impact', label: 'Teacher Impact' },
  { id: 'capture-documents', label: 'Capture & Documents' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'usage', label: 'Usage' },
  { id: 'billing', label: 'Billing' },
  { id: 'reports', label: 'Reports' },
  { id: 'audit', label: 'Audit' },
];

// Platform 3 -- Office shell (principal, school_admin). Verbatim from
// PRD §7.3's "Office navigation" list.
export const officeNav: NavItem[] = [
  { label: 'Dashboard', href: '/app/dashboard' },
  { label: 'Students', href: '/app/students' },
  { label: 'Admissions', href: '/app/admissions' },
  { label: 'Staff', href: '/app/staff' },
  { label: 'Attendance', href: '/app/attendance' },
  { label: 'Academics', href: '/app/academics' },
  { label: 'Exams', href: '/app/exams' },
  { label: 'Fees', href: '/app/fees' },
  { label: 'Communication', href: '/app/communication' },
  { label: 'Pulse', href: '/app/pulse' },
  { label: 'Recognition', href: '/app/recognition' },
  { label: 'Teacher Impact', href: '/app/teacher-impact' },
  { label: 'Documents & ID Cards', href: '/app/documents-id-cards' },
  { label: 'Reports', href: '/app/reports' },
  { label: 'Compliance', href: '/app/compliance' },
  { label: 'Settings', href: '/app/settings' },
];

// [GAP] Finance (accountant) nav: the PRD's §7.3 gives an explicit,
// numbered list for Office and Teacher, but not for Finance or
// Academic -- only their device priority ("Finance: Desktop primary").
// This is derived, not specified: a fee-focused subset of Office's own
// items, per this prompt's own "fee-focused nav subset" instruction,
// sharing routes with Office where the concept is the same (there is
// exactly one /app/fees, not a role-duplicated one). Flag this as a
// real open question, not a silent invention -- confirm or correct
// before Prompt H builds real Fees logic behind it.
export const financeNav: NavItem[] = [
  { label: 'Dashboard', href: '/app/dashboard' },
  { label: 'Fees', href: '/app/fees' },
  { label: 'Communication', href: '/app/communication' },
  { label: 'Reports', href: '/app/reports' },
  { label: 'Compliance', href: '/app/compliance' },
  { label: 'Settings', href: '/app/settings' },
];

// [GAP] Academic (academic_coordinator) nav: same situation as
// Finance above -- derived from Office's items, tablet-primary,
// covering the academic-coordination surface (Academics, Exams,
// Attendance, Staff for teacher allocation), not specified verbatim
// in the PRD.
export const academicNav: NavItem[] = [
  { label: 'Dashboard', href: '/app/dashboard' },
  { label: 'Academics', href: '/app/academics' },
  { label: 'Exams', href: '/app/exams' },
  { label: 'Attendance', href: '/app/attendance' },
  { label: 'Staff', href: '/app/staff' },
  { label: 'Reports', href: '/app/reports' },
  { label: 'Settings', href: '/app/settings' },
];

// Teacher shell -- exactly 6 items, verbatim from PRD §7.3. Phone-
// first, assume no desktop ever. The scan action is NOT one of these
// 6 -- it's the persistent app-bar action BottomNav renders alongside
// this list, per the PRD's own "plus a persistent scan action" wording.
export const teacherNav: NavItem[] = [
  { label: 'My Day', href: '/app/my-day' },
  { label: 'Attendance', href: '/app/attendance' },
  { label: 'Syllabus', href: '/app/syllabus' },
  { label: 'Marks', href: '/app/marks' },
  { label: 'My Impact', href: '/app/my-impact' },
  { label: 'Class Notices', href: '/app/class-notices' },
];
