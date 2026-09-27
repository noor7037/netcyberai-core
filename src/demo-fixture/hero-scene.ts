// Fictional figures for the homepage hero's principal dashboard card
// (founder's homepage reference, 2026-09-27). Same demo school as the
// full dashboard; shown under the "Demo school · fictional numbers" label.

import type { IconName } from '@/components/visual/Icons';

export const HERO_DASH = {
  nav: [
    { label: 'Dashboard', icon: 'principal' },
    { label: 'Students', icon: 'users' },
    { label: 'Attendance', icon: 'attendance' },
    { label: 'Fees', icon: 'fees' },
    { label: 'Academics', icon: 'academics' },
    { label: 'Homework', icon: 'homework' },
    { label: 'Exams', icon: 'exams' },
    { label: 'Communications', icon: 'chat' },
    { label: 'Reports', icon: 'reports' },
    { label: 'More Modules', icon: 'sparkle' },
  ] as { label: string; icon: IconName }[],
  greeting: 'Good Morning, Principal!',
  sub: 'Here’s what’s happening at Sunrise International School',
  progress: { label: 'Academic Progress', value: '+18%' },
  term: { year: 'AY 2026-27', term: 'Term 1' },
  kpis: [
    { label: 'Total Students', value: '1,240', note: '↑ +12% vs last term', icon: 'users', tone: 'product' },
    { label: 'Attendance Today', value: '95%', note: '↑ +3% vs last month', icon: 'attendance', tone: 'success' },
    { label: 'Fees Collection', value: '78%', note: 'On track', icon: 'fees', tone: 'action' },
    { label: 'Open Issues', value: '3', note: 'Need attention', icon: 'alert', tone: 'alert' },
  ] as { label: string; value: string; note: string; icon: IconName; tone: 'product' | 'success' | 'action' | 'alert' }[],
  classes: [
    { cls: '6A', pct: 96, absent: 2 },
    { cls: '6B', pct: 91, absent: 3 },
    { cls: '7A', pct: 94, absent: 2 },
    { cls: '7B', pct: 89, absent: 4 },
    { cls: '8A', pct: 97, absent: 1 },
    { cls: '8B', pct: 92, absent: 3 },
    { cls: '9A', pct: 95, absent: 2 },
    { cls: '9B', pct: 90, absent: 4 },
    { cls: '10A', pct: 96, absent: 2 },
  ],
  highlights: [
    { cls: '6A', subject: 'Science', topic: 'Plants and Photosynthesis', icon: 'sparkle', tone: 'success' },
    { cls: '7B', subject: 'Maths', topic: 'Fractions Comparison', icon: 'chart', tone: 'product' },
    { cls: '8A', subject: 'English', topic: 'Story Writing', icon: 'academics', tone: 'action' },
    { cls: '9B', subject: 'Social Science', topic: 'Indian Freedom Movement', icon: 'school', tone: 'intelligence' },
  ] as { cls: string; subject: string; topic: string; icon: IconName; tone: 'success' | 'product' | 'action' | 'intelligence' }[],
  yTicks: ['100%', '80%', '60%', '40%', '20%', '0%'],
};
