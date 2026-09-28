import type { IconName } from '@/components/visual/Icons';

// The NetCyberAI ecosystem, word for word from the founder's artwork
// (2026-09-28, Decision Log C79), rebuilt as live, selectable text for the
// homepage hero. This is the complete platform vision: which modules are
// live today is stated on /product-tour (src/content/module-status.ts).

export type EcoRoleId = 'school' | 'principal' | 'teacher' | 'student' | 'parent';

export interface EcoRole {
  id: EcoRoleId;
  name: string;
  tagline: string;
  items: string[];
  icon: IconName;
  href: string;
}

export const ECO_ROLES: EcoRole[] = [
  {
    id: 'school',
    name: 'School / Management',
    tagline: 'Complete Control · Smooth Operations',
    icon: 'school',
    href: '/solutions/school-admin',
    items: ['Student Information', 'Fee Management', 'Attendance & Timetable', 'Exams & Results', 'Homework & Assignments', 'Communication Hub', 'Reports & Compliance'],
  },
  {
    id: 'principal',
    name: 'Principal',
    tagline: 'Monitor · Decide · Lead',
    icon: 'principal',
    href: '/solutions/principal',
    items: ['School Performance', 'Attendance Overview', 'Academic Progress', 'Fee Collection', 'Staff Performance', 'Reports & Analytics', 'AI Insights & Alerts'],
  },
  {
    id: 'teacher',
    name: 'Teacher',
    tagline: 'Teach · Track · Inspire',
    icon: 'teacher',
    href: '/solutions/teacher',
    items: ['Lesson Plans & Resources', 'Class & Attendance', 'Homework & Assignments', 'Assessments & Grades', 'Student Progress', 'Communication with Parents', 'AI Teaching Assistant'],
  },
  {
    id: 'student',
    name: 'Student',
    tagline: 'Learn · Practice · Grow',
    icon: 'student',
    href: '/products/academics',
    items: ['Personal Learning Plan', 'Homework & Assignments', 'Exam Preparation', 'Progress Tracking', 'Certificates & Achievements', 'Interactive Learning', 'Doubt Support (AI)'],
  },
  {
    id: 'parent',
    name: 'Parent',
    tagline: 'Stay Informed · Support · Engage',
    icon: 'parent',
    href: '/products/parent-engagement',
    items: ['Real-time Updates (WhatsApp)', 'Attendance Alerts', 'Homework & Assignments', 'Exam Results', 'Fee Reminders & Payments', 'Teacher Messages', 'Child’s Progress & Reports'],
  },
];

export const ECO_CORE = {
  name: 'NetCyberAI',
  label: 'INTELLIGENCE CORE',
  flow: ['Data', 'Insights', 'Actions', 'Better Outcomes'],
  ringTop: ['AI & Analytics', 'Automation', 'Personalization'],
  ringBottom: ['Security & Privacy', 'Multi-School Ready', 'Integrated Platform'],
};

export const ECO_MODULES: { label: string; icon: IconName }[] = [
  { label: 'Academics', icon: 'academics' },
  { label: 'Attendance', icon: 'attendance' },
  { label: 'Fees & Payments', icon: 'fees' },
  { label: 'Exams & Results', icon: 'exams' },
  { label: 'Homework', icon: 'homework' },
  { label: 'Communication', icon: 'chat' },
  { label: 'Reports & Analytics', icon: 'chart' },
  { label: 'AI Copilot', icon: 'sparkle' },
  { label: 'Notifications & Alerts', icon: 'bell' },
  { label: 'Multi-School Management', icon: 'school' },
  { label: 'Security & Compliance', icon: 'shield' },
];
