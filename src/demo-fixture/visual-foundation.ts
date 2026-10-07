import type { ControlDashboardData } from '@/components/dashboards/ControlDashboardView';
import type { OfficeDashboardData } from '@/components/dashboards/OfficeDashboardView';

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

export const officeDashboardFixture: OfficeDashboardData = {
  schoolName: 'Illustrative Public School',
  activeStudents: 412,
  totalStudents: 430,
  totalStaff: 24,
  presentToday: 378,
  absentToday: 22,
  markedToday: 400,
  attendanceTrend: attendanceDaysFixture.map((d) => ({ date: d.t, pct: d.v })),
  feesCollectedMinor: 184_500_00,
  feesPendingMinor: 52_000_00,
  feesOverdueMinor: 21_500_00,
  feesPartialMinor: 12_000_00,
  feesWaivedMinor: 0,
  overdueCount: 17,
  consentPending: 18,
  consentTotal: 430,
  blockedThisWeek: 3,
  recentActivity: [
    { action: 'attendance.submitted', at: '2026-09-25T03:40:00Z' },
    { action: 'student.created', at: '2026-09-25T03:10:00Z' },
    { action: 'ticket.created', at: '2026-09-24T09:05:00Z' },
  ],
};

// A school on its first day: nothing recorded yet.
export const officeDashboardEmptyFixture: OfficeDashboardData = {
  schoolName: 'Illustrative New School',
  activeStudents: 0,
  totalStudents: 0,
  totalStaff: 0,
  presentToday: 0,
  absentToday: 0,
  markedToday: 0,
  attendanceTrend: [],
  feesCollectedMinor: 0,
  feesPendingMinor: 0,
  feesOverdueMinor: 0,
  feesPartialMinor: 0,
  feesWaivedMinor: 0,
  overdueCount: 0,
  consentPending: 0,
  consentTotal: 0,
  blockedThisWeek: 0,
  recentActivity: [],
};

export const controlDashboardFixture: ControlDashboardData = {
  schools: [
    { id: 's1', name: 'Illustrative Public School', stage: 'go_live', students: 430, isFixture: true },
    { id: 's2', name: 'Illustrative Academy', stage: 'data_import', students: 160, isFixture: true },
  ],
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
  dailySends: [64, 80, 71, 96, 88, 102, 90, 110, 95, 120, 104, 98].map((sent, i) => ({ day: day(i + 14), sent, delivered: Math.round(sent * 0.94) })),
};

// Chart titles say the takeaway (docs/19 §3.3), so the gallery's example
// titles carry illustrative numbers and live here with the other fixtures.
export const galleryTitles = {
  donut: 'Fees collected: 72% of all billed',
  area: 'Attendance: 94.5% on the last marked day',
} as const;
