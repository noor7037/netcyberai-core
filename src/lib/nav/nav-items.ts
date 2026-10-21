import type { NavItem } from '@/components/shell/TopNav';

// Platform 2 -- admin control plane. 13 top-level items, verbatim from
// docs/04_SYSTEM_DESIGN_PRD.md §7.2.
export const controlNav: NavItem[] = [
  { label: 'Dashboard', href: '/control' },
  { label: 'Schools', href: '/control/schools' },
  { label: 'Users', href: '/control/users' },
  { label: 'Onboarding', href: '/control/onboarding' },
  { label: 'Messaging & Cost', href: '/control/messaging-cost' },
  { label: 'Message templates', href: '/control/templates' },
  { label: 'WhatsApp account', href: '/control/whatsapp' },
  { label: 'Monitoring', href: '/control/monitoring' },
  { label: 'Analytics', href: '/control/analytics' },
  { label: 'Billing & Plans', href: '/control/billing-plans' },
  { label: 'Boards & grading', href: '/control/boards' },
  { label: 'Content', href: '/control/content' },
  { label: 'Compliance', href: '/control/compliance' },
  { label: 'Integrations', href: '/control/integrations' },
  { label: 'AI', href: '/control/ai' },
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
  // Not in the PRD's list: plan, module switches and access mode (C123).
  { id: 'modules-access', label: 'Modules & access' },
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

// The school app's menu comes from the module registry (buildNavigation,
// src/lib/contracts/navigation.ts; C121), not from lists kept here.
