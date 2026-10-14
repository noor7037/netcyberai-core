import type { ControlDashboardData } from '@/components/dashboards/ControlDashboardView';
import type { OfficeDashboardData } from '@/components/dashboards/OfficeDashboardView';
import { describeFact } from '@/lib/insights/load';
import type { FactId, FactResult } from '@/lib/insights/types';

// Illustrative values for the design-system gallery and the dashboard
// previews (development only; C131). Not a real school, person or number.
// The live dashboards never read this file: they show values computed from
// the school's own records, or an honest empty state.

const day = (n: number) => `2026-09-${String(n).padStart(2, '0')}`;

export const sparkFixture = [88, 91, 90, null, 93, 92, 94.5];

export const attendanceDaysFixture = [91, 93, 90, 94, 92, 95, 93, 96, 94, 92, 95, 94.5].map((v, i) => ({ t: day(i + 14), v }));

export const feeDonutFixture = [
  { id: 'collected', label: 'Collected', value: 184_500_00 },
  { id: 'pending', label: 'Pending', value: 52_000_00 },
  { id: 'overdue', label: 'Overdue', value: 21_500_00 },
];

// Five weeks of a class's attendance percentage; weekends and a holiday have no data.
export const heatDaysFixture = Array.from({ length: 35 }, (_, i) => {
  const date = new Date(Date.UTC(2026, 7, 31 + i)); // from Monday 31 Aug 2026
  const weekday = (date.getUTCDay() + 6) % 7;
  const value = weekday >= 5 || i === 17 ? null : 78 + ((i * 7) % 20);
  return { date: date.toISOString().slice(0, 10), value };
});

// The office's dashboard is drawn from school facts (src/lib/insights, C203). These are illustrative facts in
// that shape, for the development preview only: the live dashboard computes its own from the school's rows.
const COUNTED_AT = '2026-09-25T04:00:00.000Z';
const WEEK = { from: '2026-09-19', to: '2026-09-25' };
const fact = (id: FactId, numbers: Partial<FactResult> & { value: number | null }): FactResult => ({ ...describeFact(id), state: 'ok', countedAt: COUNTED_AT, href: '/design-system/shell/dashboards', attention: false, ...numbers });

export const officeDashboardFixture: OfficeDashboardData = {
  schoolName: 'Illustrative Public School',
  rangeId: '7d',
  range: WEEK,
  failed: 0,
  facts: [
    fact('attendance.classes_marked', { value: 14, total: 16 }),
    fact('attendance.classes_unmarked', { value: 2, total: 16, attention: true }),
    fact('attendance.students_marked', { value: 400, total: 412, parts: [{ key: 'marked', value: 400 }, { key: 'not_marked', value: 12 }] }),
    fact('attendance.present', { value: 371, total: 400 }),
    fact('attendance.absent', { value: 22, total: 400 }),
    fact('attendance.late', { value: 5, total: 400 }),
    fact('attendance.leave', { value: 2, total: 400 }),
    fact('attendance.present_rate', { value: 94, total: 6, range: WEEK, series: attendanceDaysFixture.slice(-7).map((d, i) => ({ date: d.t, value: i === 3 ? null : d.v })) }),
    fact('students.active', { value: 412, total: 430 }),
    fact('students.waiting_consent', { value: 18, total: 430, attention: true }),
    fact('fees.collected', { value: 184_500_00, count: 61, range: WEEK }),
    fact('fees.owed', { value: 52_000_00 }),
    fact('fees.overdue', { value: 21_500_00, count: 17, attention: true }),
    fact('homework.set', { value: 38, range: WEEK }),
    fact('homework.checked', { value: 27, total: 33, range: WEEK, parts: [{ key: 'checked', value: 27 }, { key: 'unchecked', value: 6 }] }),
    fact('messages.total', { value: 240, range: WEEK, parts: [{ key: 'queued', value: 2 }, { key: 'uncertain', value: 0 }, { key: 'sent', value: 14 }, { key: 'delivered', value: 96 }, { key: 'read', value: 124 }, { key: 'failed', value: 1 }, { key: 'held', value: 3 }] }),
    fact('messages.held', { value: 3, range: WEEK, attention: true }),
    fact('whatsapp.spend', { state: 'not_set_up', value: null }),
    fact('complaints.open', { value: 2 }),
    fact('ptm.coming', { value: 1, parts: [{ key: 'slots', value: 48 }, { key: 'booked', value: 31 }] }),
    fact('tickets.open', { value: 1 }),
  ],
};

// A school on its first day: nothing is set up, and nothing is recorded yet.
export const officeDashboardEmptyFixture: OfficeDashboardData = {
  schoolName: 'Illustrative New School',
  rangeId: 'today',
  range: { from: '2026-09-25', to: '2026-09-25' },
  failed: 0,
  facts: [
    fact('attendance.classes_marked', { state: 'not_set_up', value: null }),
    fact('attendance.present_rate', { state: 'no_data', value: null }),
    fact('students.active', { state: 'not_set_up', value: null }),
    fact('fees.collected', { value: 0, count: 0 }),
    fact('fees.overdue', { state: 'not_set_up', value: null }),
    fact('fees.owed', { state: 'not_set_up', value: null }),
    fact('messages.total', { value: 0, parts: [] }),
    fact('whatsapp.spend', { state: 'not_set_up', value: null }),
    fact('tickets.open', { value: 0 }),
  ],
};

export const controlDashboardFixture: ControlDashboardData = {
  schools: [
    { id: 's1', name: 'Illustrative Public School', stage: 'go_live', students: 590, isFixture: false },
    { id: 's2', name: 'Illustrative Test School', stage: 'data_import', students: 160, isFixture: true },
  ],
  liveSchools: 1,
  activeStudents: 560,
  totalStudents: 590,
  totalStaff: 39,
  totalComms: 1240,
  blocked: 12,
  deliveryRate: 94,
  consentActive: 560,
  consentPending: 30,
  feesCollectedMinor: 251_000_00,
  feesDueMinor: 96_000_00,
  ticketsOpen: 2,
  ticketsInProgress: 1,
  ticketsFromTestSchools: 1,
  dailySends: [64, 80, 71, 96, 88, 102, 90, 110, 95, 120, 104, 98].map((sent, i) => ({ day: day(i + 14), sent, delivered: Math.round(sent * 0.94) })),
};

// Chart titles say the takeaway (docs/19 §3.3), so the gallery's example
// titles carry illustrative numbers and live here with the other fixtures.
export const galleryTitles = {
  donut: 'Fees collected: 72% of all billed',
  area: 'Attendance: 94.5% on the last marked day',
} as const;
