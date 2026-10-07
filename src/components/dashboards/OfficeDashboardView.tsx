import { AppCard } from '@/components/app-ui/Card';
import { greetingFor, HeroBand, indiaDate, indiaHour } from '@/components/app-ui/HeroBand';
import { KpiTile } from '@/components/app-ui/KpiTile';
import { AreaTrend, DonutChart, RingProgress } from '@/components/app-ui/ProgressCharts';
import { AttentionList, indiaToday, lastDays, plural, QuickActions, trendFromSeries, type AttentionItem } from './dashboard-parts';

// The principal's and school admin's dashboard (docs/19 §3.3): hero band,
// KPI row, attention list, chart cards, quick actions. Every number is a
// value the server computed from this school's own records (OfficeDashboard
// runs the queries under row level security); nothing here invents one.
// Where a workflow does not exist yet, the dashboard shows nothing for it.

export type OfficeDashboardData = {
  schoolName: string;
  activeStudents: number;
  totalStudents: number;
  totalStaff: number;
  presentToday: number;
  absentToday: number;
  markedToday: number;
  attendanceTrend: { date: string; pct: number }[]; // only days with attendance recorded
  feesCollectedMinor: number;
  feesPendingMinor: number;
  feesOverdueMinor: number;
  feesPartialMinor: number; // billed amount of entries that are part paid
  feesWaivedMinor: number;
  overdueCount: number;
  consentPending: number;
  consentTotal: number;
  blockedThisWeek: number;
  recentActivity: { action: string; at: string }[];
};

export function OfficeDashboardView({ data, now = new Date() }: { data: OfficeDashboardData; now?: Date }) {
  const attendancePct = data.markedToday > 0 ? Math.round((data.presentToday / data.markedToday) * 1000) / 10 : null;
  // The last 14 days in India; a day with no attendance saved is a gap (null), not a zero.
  const trend = lastDays(data.attendanceTrend.map((d) => ({ date: d.date, value: d.pct })), 14, null, now);
  const trendValues = trend.map((d) => d.v);
  const lastMarked = [...trend].reverse().find((d) => d.v !== null);
  const sunday = new Date(`${indiaToday(now)}T00:00:00Z`).getUTCDay() === 0;
  const unmarked = Math.max(0, data.activeStudents - data.markedToday);
  // A student marked and then made inactive the same day still counts as marked.
  const markable = Math.max(data.activeStudents, data.markedToday);

  const attention: AttentionItem[] = [
    ...(unmarked > 0 && !sunday
      ? [{ id: 'att', label: `${plural(unmarked, 'active student has', 'active students have')} no attendance saved today`, count: unmarked, href: '/app/attendance', action: 'Mark attendance', why: data.markedToday === 0 ? 'No attendance has been saved for today for any class. If the school is closed today, ignore this.' : 'Attendance is saved for some students today, but not for these.', icon: 'attendance' as const, tone: 'royal' as const }]
      : []),
    ...(data.overdueCount > 0 ? [{ id: 'fees', label: plural(data.overdueCount, 'fee entry is overdue', 'fee entries are overdue'), count: data.overdueCount, href: '/app/fees', action: 'Open fees', why: 'These fee entries are past their due date and not marked paid.', icon: 'fees' as const, tone: 'tangerine' as const }] : []),
    ...(data.consentPending > 0 ? [{ id: 'consent', label: `${plural(data.consentPending, 'student is', 'students are')} waiting for consent`, count: data.consentPending, href: '/app/students', action: 'Open students', why: 'A student stays “pending consent” until a parent or guardian’s consent is recorded. Messages to parents are held until then.', icon: 'shield' as const, tone: 'emerald' as const }] : []),
    ...(data.blockedThisWeek > 0 ? [{ id: 'blocked', label: `${plural(data.blockedThisWeek, 'message was', 'messages were')} held back in the last 7 days`, count: data.blockedThisWeek, href: '/app/communication', action: 'Open messages', why: 'A message is held when consent is missing, it is outside allowed hours, or the budget is used up. Holding it is the safeguard working.', icon: 'chat' as const, tone: 'cyan' as const }] : []),
  ];

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <HeroBand variant="cinematic" greeting={greetingFor(indiaHour(now))} date={indiaDate(now)} title={data.schoolName} chips={attention.map((a) => ({ label: a.action, href: a.href, count: a.count }))} allClear="Nothing needs you right now." />

      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile tone="royal" icon="attendance" spark={trendValues} tile={{ kind: 'kpi', id: 'attendance', label: 'Attendance today', value: attendancePct, unit: 'percent', drillHref: '/app/attendance', trend: attendancePct === null ? undefined : trendFromSeries(trendValues, 'percent', 'the previous marked day', 'up') }} />
        <KpiTile tone="turquoise" icon="student" tile={{ kind: 'kpi', id: 'students', label: 'Students', value: data.totalStudents, unit: 'count', drillHref: '/app/students' }} />
        <KpiTile tone="grape" icon="staff" tile={{ kind: 'kpi', id: 'staff', label: 'Teaching staff', value: data.totalStaff, unit: 'count', drillHref: '/app/staff' }} />
        <KpiTile tone="tangerine" icon="fees" tile={{ kind: 'kpi', id: 'overdue', label: 'Fees overdue', value: data.feesOverdueMinor, unit: 'inr_paise', drillHref: '/app/fees' }} />
      </section>

      <AttentionList items={attention} allClear="Nothing needs attention: attendance is marked, no fee is overdue, no consent is waiting and no message was held back." />

      <section aria-label="Charts" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AreaTrend
          title={lastMarked ? `Attendance: ${lastMarked.v}% on the last marked day` : 'Attendance, last 14 days'}
          seriesLabel="Present"
          unit="percent"
          tone="royal"
          points={trend}
          emptyHint="Mark attendance for a class and the last 14 days appear here."
        />
        <RingProgress title="Attendance marked today" done={data.markedToday} total={markable} noun="active students" doneWord="marked" tone="royal" emptyHint="Add students and record their consent; then today’s marking shows here." />
        <DonutChart
          title="Fee entries by status"
          unit="inr_paise"
          tone="tangerine"
          slices={[
            { id: 'paid', label: 'Paid', value: data.feesCollectedMinor },
            { id: 'partial', label: 'Part paid (full amount billed)', value: data.feesPartialMinor },
            { id: 'pending', label: 'Pending', value: data.feesPendingMinor },
            { id: 'overdue', label: 'Overdue', value: data.feesOverdueMinor },
            { id: 'waived', label: 'Waived', value: data.feesWaivedMinor },
          ]}
          emptyHint="Fee entries appear here once the first fees are recorded."
        />
        <RingProgress title="Consent recorded" done={data.activeStudents} total={data.activeStudents + data.consentPending} noun="students" doneWord="are active with consent recorded" tone="emerald" emptyHint="Add students; consent is recorded on each student’s page." />
      </section>

      <QuickActions
        actions={[
          { label: 'Add a student', href: '/app/students', icon: 'student', tone: 'sapphire' },
          { label: 'Mark attendance', href: '/app/attendance', icon: 'attendance', tone: 'royal' },
          { label: 'Raise a ticket', href: '/app/help/ticket/new', icon: 'ticket', tone: 'gold' },
          { label: 'Help Center', href: '/app/help', icon: 'support', tone: 'gold' },
        ]}
      />

      <AppCard title="Recent activity" tone="slate">
        {data.recentActivity.length === 0 ? (
          <p className="text-sm text-slate">Nothing has been recorded yet. Actions people take in the app are listed here.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm text-slate">
            {data.recentActivity.map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-3">
                <span className="min-w-0">{a.action.replace(/[._]/g, ' ')}</span>
                <span className="shrink-0 text-xs text-slate/70">{new Date(a.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</span>
              </li>
            ))}
          </ul>
        )}
      </AppCard>
    </div>
  );
}
