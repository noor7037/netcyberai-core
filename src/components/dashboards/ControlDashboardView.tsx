import type { ReactNode } from 'react';
import { AppCard } from '@/components/app-ui/Card';
import { greetingFor, HeroBand, indiaDate, indiaHour } from '@/components/app-ui/HeroBand';
import { KpiTile } from '@/components/app-ui/KpiTile';
import { AreaTrend, RingProgress } from '@/components/app-ui/ProgressCharts';
import { AttentionList, lastDays, QuickActions, type AttentionItem } from './dashboard-parts';

// The founder's Control dashboard (docs/19 §3.3), on the numbers the page
// computes across every school. While every school is a tagged test
// fixture the page says so in plain words.

export type ControlDashboardData = {
  schools: { id: string; name: string; stage: string; students: number; isFixture: boolean }[];
  activeStudents: number;
  totalStudents: number;
  totalStaff: number;
  totalComms: number;
  blocked: number;
  deliveryRate: number | null;
  consentActive: number;
  consentPending: number;
  feesCollectedMinor: number;
  feesDueMinor: number;
  ticketsOpen: number;
  ticketsInProgress: number;
  dailySends: { day: string; sent: number; delivered: number }[];
};

export function ControlDashboardView({ data, schoolsTable, now = new Date() }: { data: ControlDashboardData; schoolsTable: ReactNode; now?: Date }) {
  const fixtures = data.schools.filter((s) => s.isFixture).length;
  const allFixture = data.schools.length > 0 && fixtures === data.schools.length;
  const attention: AttentionItem[] = [
    ...(data.ticketsOpen > 0 ? [{ id: 'open', label: data.ticketsOpen === 1 ? 'support ticket is waiting to be picked up' : 'support tickets are waiting to be picked up', count: data.ticketsOpen, href: '/control/tickets', action: 'Open tickets', why: 'A ticket is “open” until someone at NetCyberAI starts work on it or replies.', icon: 'ticket' as const, tone: 'gold' as const }] : []),
    ...(data.ticketsInProgress > 0 ? [{ id: 'progress', label: data.ticketsInProgress === 1 ? 'ticket is being worked on' : 'tickets are being worked on', count: data.ticketsInProgress, href: '/control/tickets', action: 'Continue', why: 'These tickets were started and are not resolved yet.', icon: 'support' as const, tone: 'royal' as const }] : []),
  ];
  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <HeroBand variant="cinematic" greeting={greetingFor(indiaHour(now))} date={indiaDate(now)} title="NetCyberAI Control" chips={attention.map((a) => ({ label: a.action, href: a.href, count: a.count }))} allClear="No ticket is waiting for you." />
      {allFixture && (
        <p role="note" className="rounded-md border border-tangerine/40 bg-tangerine/10 p-3 text-sm text-slate">
          Every school so far is a tagged test school. The numbers below are counted from that test data, not from real schools.
        </p>
      )}
      {!allFixture && fixtures > 0 && (
        <p role="note" className="rounded-md border border-tangerine/40 bg-tangerine/10 p-3 text-sm text-slate">
          The totals below include {fixtures} tagged test {fixtures === 1 ? 'school' : 'schools'}.
        </p>
      )}

      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile tone="royal" icon="school" tile={{ kind: 'kpi', id: 'schools', label: fixtures ? `Schools (${fixtures} test)` : 'Schools', value: data.schools.length, unit: 'count', drillHref: '/control/schools' }} />
        <KpiTile tone="turquoise" icon="student" tile={{ kind: 'kpi', id: 'students', label: 'Students', value: data.totalStudents, unit: 'count', drillHref: '/control/schools' }} />
        <KpiTile tone="grape" icon="staff" tile={{ kind: 'kpi', id: 'staff', label: 'Teaching staff', value: data.totalStaff, unit: 'count', drillHref: '/control/users' }} />
        <KpiTile tone="tangerine" icon="fees" tile={{ kind: 'kpi', id: 'fees', label: 'Fees marked paid', value: data.feesCollectedMinor, unit: 'inr_paise', drillHref: '/control/billing-plans' }} />
      </section>

      <AttentionList items={attention} allClear="No support ticket is open or in progress." />

      <section aria-label="Charts" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <AreaTrend title="Messages logged, last 14 days" seriesLabel="Messages" unit="count" tone="royal" points={lastDays(data.dailySends.map((d) => ({ date: d.day, value: d.sent })), 14, 0, now)} emptyHint="Messages appear here once schools start sending." />
          <p className="px-1 text-sm text-slate">
            {data.totalComms.toLocaleString('en-IN')} messages logged in the last 30 days
            {data.deliveryRate !== null && `; ${data.deliveryRate}% delivered or read`}
            {data.blocked > 0 && `; ${data.blocked.toLocaleString('en-IN')} held back by the consent, pilot or budget safeguards`}. Fees still pending or overdue: ₹{(data.feesDueMinor / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}.
          </p>
        </div>
        <RingProgress title="Consent recorded" done={data.consentActive} total={data.consentActive + data.consentPending} noun="students" doneWord="are active with consent recorded" tone="emerald" emptyHint="Appears once schools add students." />
      </section>

      <QuickActions
        actions={[
          { label: 'Schools', href: '/control/schools', icon: 'school', tone: 'sapphire' },
          { label: 'Applications', href: '/control/onboarding', icon: 'admissions', tone: 'turquoise' },
          { label: 'Support tickets', href: '/control/tickets', icon: 'ticket', tone: 'gold' },
          { label: 'Users', href: '/control/users', icon: 'users', tone: 'azure' },
        ]}
      />

      <AppCard title="Schools" tone="sapphire">
        {schoolsTable}
      </AppCard>
    </div>
  );
}
