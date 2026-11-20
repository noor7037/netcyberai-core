// Example numbers for the website's principal dashboard preview. Fictional:
// a demo school, shown under the "Demo school · fictional numbers" label.
// The preview follows the real office dashboard (src/components/dashboards
// /OfficeDashboardView.tsx): its sections in order, its titles, its numbers
// grouped as the school's own dashboard groups them. The words are the
// product's own (src/lib/i18n/messages/en.ts). Nothing here is counted from
// a database, and nothing on the page is saved.

import type { IconName } from '@/components/visual/Icons';
import type { ColorToken } from '@/lib/contracts/modules';
import type { ModuleId } from './principal-dashboard';

export type RangeId = 'today' | '7d' | '30d';
export const RANGES: { id: RangeId; label: string; days: string }[] = [
  { id: 'today', label: 'Today', days: '' },
  { id: '7d', label: '7 days', days: '18 Sep to 24 Sep' },
  { id: '30d', label: '30 days', days: '26 Aug to 24 Sep' },
];

export const HERO = { greeting: 'Good morning · Thursday, 24 September 2026' };

export type Unit = 'count' | 'rupees' | 'percent';
export type ByRange = Record<RangeId, number>;
const same = (n: number): ByRange => ({ today: n, '7d': n, '30d': n });

// WhatsApp messages by state, for each choice of days (the chart and the tile).
export const MESSAGE_PARTS: Record<RangeId, { label: string; value: number }[]> = {
  today: [
    { label: 'Waiting to go', value: 6 }, { label: 'Sent', value: 84 }, { label: 'Delivered', value: 520 },
    { label: 'Read', value: 702 }, { label: 'Failed', value: 9 }, { label: 'Held back', value: 5 },
  ],
  '7d': [
    { label: 'Waiting to go', value: 11 }, { label: 'Sent', value: 410 }, { label: 'Delivered', value: 3150 },
    { label: 'Read', value: 4720 }, { label: 'Failed', value: 52 }, { label: 'Held back', value: 77 },
  ],
  '30d': [
    { label: 'Waiting to go', value: 11 }, { label: 'Sent', value: 1620 }, { label: 'Delivered', value: 12900 },
    { label: 'Read', value: 18600 }, { label: 'Failed', value: 210 }, { label: 'Held back', value: 330 },
  ],
};
const messageTotal = (r: RangeId) => MESSAGE_PARTS[r].reduce((a, p) => a + p.value, 0);

export const HOMEWORK_DUE: ByRange = { today: 35, '7d': 196, '30d': 760 };
export const HOMEWORK_CHECKED: ByRange = { today: 29, '7d': 163, '30d': 640 };

export type Tile = {
  id: string;
  label: string;
  icon: IconName;
  module: ModuleId;
  unit: Unit;
  value: ByRange;
  total?: number;
  detail?: string;
  notSetUp?: boolean; // the tile says what is missing instead of a number
  period?: string; // what the days are, when it is not the chosen range
  attention?: { count: number; text: string; action: string; why: string };
};

export type TileGroup = { id: 'today' | 'money' | 'learning' | 'parents' | 'running'; title: string; tone: ColorToken; tiles: Tile[] };

export const TILE_GROUPS: TileGroup[] = [
  {
    id: 'today',
    title: 'Today',
    tone: 'royal',
    tiles: [
      { id: 'classes_marked', label: 'Classes marked today', icon: 'attendance', module: 'attendance', unit: 'count', value: same(13), total: 16 },
      { id: 'present', label: 'Present today', icon: 'attendance', module: 'attendance', unit: 'count', value: same(1021), total: 1102 },
      { id: 'absent', label: 'Absent today', icon: 'attendance', module: 'attendance', unit: 'count', value: same(52), total: 1102 },
      { id: 'late', label: 'Late today', icon: 'attendance', module: 'attendance', unit: 'count', value: same(21), total: 1102 },
      { id: 'leave', label: 'On leave today', icon: 'attendance', module: 'attendance', unit: 'count', value: same(8), total: 1102 },
    ],
  },
  {
    id: 'money',
    title: 'Money',
    tone: 'tangerine',
    tiles: [
      { id: 'fees_collected', label: 'Fees received', icon: 'fees', module: 'fees', unit: 'rupees', value: { today: 186500, '7d': 1425000, '30d': 5240000 } },
      {
        id: 'fees_overdue',
        label: 'Fees overdue',
        icon: 'fees',
        module: 'fees',
        unit: 'rupees',
        value: same(640000),
        detail: 'Fee entries: 47',
        period: 'As of now',
        attention: { count: 47, text: 'fee entries are overdue', action: 'See the entries', why: 'What is still to be paid on fee entries whose due date has passed. Part payments are taken off. Paid and waived entries are never counted.' },
      },
      { id: 'fees_owed', label: 'Owed, not yet due', icon: 'fees', module: 'fees', unit: 'rupees', value: same(2180000), period: 'As of now' },
      {
        id: 'promises_due',
        label: 'Promises to pay now due',
        icon: 'fees',
        module: 'fees',
        unit: 'count',
        value: same(9),
        period: 'As of now',
        attention: { count: 9, text: 'promises to pay are due today or have passed', action: 'See the promises', why: 'A family promised to pay by a date. These promises are still open and their date is today or has passed.' },
      },
      {
        id: 'upi_to_verify',
        label: 'UPI payments to verify',
        icon: 'fees',
        module: 'fees',
        unit: 'count',
        value: same(6),
        period: 'As of now',
        attention: { count: 6, text: 'UPI payments are waiting to be verified', action: 'Verify payments', why: 'A parent paid by UPI and gave the UTR. These wait for the school to find the payment in its bank; the parent gets the receipt only then.' },
      },
    ],
  },
  {
    id: 'learning',
    title: 'Learning',
    tone: 'azure',
    tiles: [
      { id: 'present_rate', label: 'In school, of those marked', icon: 'attendance', module: 'attendance', unit: 'percent', value: { today: 93, '7d': 94, '30d': 93 } },
      { id: 'homework_set', label: 'Homework set', icon: 'homework', module: 'homework', unit: 'count', value: { today: 38, '7d': 212, '30d': 806 } },
      { id: 'homework_checked', label: 'Homework checked', icon: 'homework', module: 'homework', unit: 'count', value: HOMEWORK_CHECKED },
      { id: 'homework_not_done', label: 'Marked “not done”', icon: 'homework', module: 'homework', unit: 'count', value: { today: 41, '7d': 233, '30d': 902 } },
      { id: 'syllabus', label: 'Syllabus coverage', icon: 'academics', module: 'academics', unit: 'percent', value: same(62), period: 'As of now' },
      { id: 'followups', label: 'Students needing a follow-up', icon: 'pulse', module: 'pulse', unit: 'count', value: same(17), period: 'As of now' },
    ],
  },
  {
    id: 'parents',
    title: 'Parents',
    tone: 'cyan',
    tiles: [
      { id: 'pulse_sent', label: 'Daily Pulse messages sent', icon: 'pulse', module: 'pulse', unit: 'count', value: { today: 940, '7d': 5310, '30d': 21400 } },
      { id: 'pulse_understood', label: 'Parents answered “understood”', icon: 'pulse', module: 'pulse', unit: 'count', value: { today: 702, '7d': 4020, '30d': 16100 } },
      { id: 'pulse_needs_help', label: 'Parents answered “needs help”', icon: 'pulse', module: 'pulse', unit: 'count', value: { today: 64, '7d': 380, '30d': 1490 } },
      { id: 'messages_total', label: 'WhatsApp messages', icon: 'chat', module: 'communication', unit: 'count', value: { today: messageTotal('today'), '7d': messageTotal('7d'), '30d': messageTotal('30d') } },
      { id: 'complaints_open', label: 'Complaints open', icon: 'complaints', module: 'complaints', unit: 'count', value: same(5), period: 'As of now' },
      {
        id: 'notices_waiting',
        label: 'Notices waiting for approval',
        icon: 'chat',
        module: 'communication',
        unit: 'count',
        value: same(3),
        period: 'As of now',
        attention: { count: 3, text: 'notices are waiting for your approval', action: 'Open notices', why: 'Notices written by staff that the principal has not yet approved or rejected. Nothing is sent until then.' },
      },
      { id: 'ptm_coming', label: 'Meetings coming', icon: 'ptm', module: 'ptm', unit: 'count', value: same(1), detail: 'Meeting times booked: 31 of 48', period: 'From today' },
      { id: 'events_coming', label: 'Events coming', icon: 'events', module: 'events', unit: 'count', value: same(2), period: 'From today' },
      { id: 'parent_ai_drafts', label: 'Answers waiting for approval', icon: 'parentAi', module: 'parent-ai', unit: 'count', value: same(4), period: 'As of now' },
    ],
  },
  {
    id: 'running',
    title: 'Running the school',
    tone: 'sapphire',
    tiles: [
      { id: 'students_active', label: 'Active students', icon: 'student', module: 'students', unit: 'count', value: same(1240), total: 1268, period: 'As of now' },
      {
        id: 'waiting_consent',
        label: 'Waiting for consent',
        icon: 'student',
        module: 'students',
        unit: 'count',
        value: same(28),
        total: 1268,
        period: 'As of now',
        attention: { count: 28, text: 'students are waiting for consent', action: 'See the students', why: 'A student stays “waiting for consent” until a verified guardian grants the required consents on the student’s page. Messages to the family are held until then.' },
      },
      { id: 'admissions_conversion', label: 'Admissions conversion', icon: 'admissions', module: 'admissions', unit: 'percent', value: same(38), period: 'This session' },
      {
        id: 'leave_waiting',
        label: 'Leave requests waiting',
        icon: 'staff',
        module: 'staff',
        unit: 'count',
        value: same(2),
        period: 'As of now',
        attention: { count: 2, text: 'leave requests are waiting for your decision', action: 'See the requests', why: 'Leave requests from staff that the principal or the school admin has not yet approved or refused.' },
      },
      { id: 'on_leave_today', label: 'Staff on leave today', icon: 'staff', module: 'staff', unit: 'count', value: same(3) },
      {
        id: 'uncovered',
        label: 'Periods without cover today',
        icon: 'proxy',
        module: 'proxy',
        unit: 'count',
        value: same(1),
        total: 14,
        attention: { count: 1, text: 'period has no teacher today', action: 'Arrange cover', why: 'Today’s periods of teachers on approved leave that have no teacher: no cover is assigned yet, or the teacher who was given the cover cannot take it now.' },
      },
      { id: 'whatsapp_spend', label: 'WhatsApp spend this month', icon: 'chat', module: 'communication', unit: 'rupees', value: same(0), notSetUp: true, detail: 'No monthly budget is set yet, so WhatsApp messages are held back. NetCyberAI sets it with your school.' },
      { id: 'tickets_open', label: 'Support tickets open', icon: 'ticket', module: 'help-center', unit: 'count', value: same(1), period: 'As of now' },
    ],
  },
];

// Classes with no attendance saved today (a number the tiles do not draw,
// but the attention list does), first in the list as the most urgent.
export const UNMARKED = {
  id: 'classes_unmarked',
  module: 'attendance' as ModuleId,
  icon: 'attendance' as IconName,
  tone: 'royal' as ColorToken,
  count: 3,
  text: 'classes have no attendance saved today',
  action: 'See the classes',
  why: 'These classes have students on their roll and no attendance saved for today. On a Sunday nothing is asked for. If the school is closed today, leave this.',
};

export const ATTENDANCE_TODAY = [
  { label: 'Present', value: 1021 },
  { label: 'Absent', value: 52 },
  { label: 'Late', value: 21 },
  { label: 'On leave', value: 8 },
  { label: 'Not marked yet', value: 138 },
];

// Share in school, day by day. A day with no mark saved is a gap, never a zero.
export const PRESENT_RATE_SERIES: Record<RangeId, { label: string; value: number | null }[]> = {
  today: [
    { label: '18 Sep', value: 92 }, { label: '19 Sep', value: 94 }, { label: '20 Sep', value: null }, { label: '21 Sep', value: 95 },
    { label: '22 Sep', value: 93 }, { label: '23 Sep', value: 94 }, { label: '24 Sep', value: 93 },
  ],
  '7d': [
    { label: '18 Sep', value: 92 }, { label: '19 Sep', value: 94 }, { label: '20 Sep', value: null }, { label: '21 Sep', value: 95 },
    { label: '22 Sep', value: 93 }, { label: '23 Sep', value: 94 }, { label: '24 Sep', value: 93 },
  ],
  '30d': [
    { label: '1 Sep', value: 91 }, { label: '4 Sep', value: 93 }, { label: '8 Sep', value: 92 }, { label: '11 Sep', value: null },
    { label: '14 Sep', value: 94 }, { label: '18 Sep', value: 92 }, { label: '21 Sep', value: 95 }, { label: '24 Sep', value: 93 },
  ],
};

export const FEES_OWED = [
  { label: 'Not yet due', value: 2180000 },
  { label: 'Overdue', value: 640000 },
];

export const QUICK_ACTIONS: { label: string; icon: IconName; tone: ColorToken; action: 'add-student' | ModuleId }[] = [
  { label: 'Add a student', icon: 'student', tone: 'sapphire', action: 'add-student' },
  { label: 'Mark attendance', icon: 'attendance', tone: 'royal', action: 'attendance' },
  { label: 'Raise a ticket', icon: 'ticket', tone: 'gold', action: 'raise-ticket' },
  { label: 'Help Center', icon: 'support', tone: 'gold', action: 'help-center' },
];
