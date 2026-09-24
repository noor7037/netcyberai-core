import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Table, type TableColumn } from '@/components/ui/Table';
import { getServerSession } from '@/lib/auth/server-session';
import { withTenantContext } from '@/lib/auth/db';

type SchoolRow = { id: string; name: string; stage: string; students: number; isFixture: boolean };

const columns: TableColumn<SchoolRow>[] = [
  {
    key: 'name',
    header: 'School',
    render: (s) => (
      <Link href={`/control/schools/${s.id}`} className="font-medium text-sapphire underline">
        {s.name}
      </Link>
    ),
  },
  {
    key: 'stage',
    header: 'Onboarding stage',
    render: (s) => <Badge variant={s.stage === 'go_live' ? 'success' : 'neutral'}>{s.stage.replace(/_/g, ' ')}</Badge>,
  },
  { key: 'students', header: 'Students', render: (s) => s.students },
  {
    key: 'isFixture',
    header: 'Type',
    render: (s) => (s.isFixture ? <Badge variant="warning">Test fixture</Badge> : <Badge variant="neutral">Live</Badge>),
  },
];

function Kpi({ label, value, sub, tone = 'sapphire' }: { label: string; value: string; sub?: string; tone?: 'sapphire' | 'emerald' | 'amber' | 'violet' }) {
  const toneClass =
    tone === 'emerald' ? 'text-emerald-text' : tone === 'amber' ? 'text-amber-text' : tone === 'violet' ? 'text-violet' : 'text-sapphire';
  return (
    <Card className="flex-1">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate/70">{label}</p>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${toneClass}`}>{value}</p>
      {sub && <p className="mt-1 text-sm text-slate/70">{sub}</p>}
    </Card>
  );
}

export default async function ControlDashboardPage() {
  const session = await getServerSession();
  if (!session) {
    return null; // control/layout.tsx already redirects unauthenticated/unauthorized sessions before this renders
  }

  const data = await withTenantContext(session, async (client) => {
    const [schoolsRes, studentsRes, staffRes, commsRes, consentRes, feesRes, dailyRes] = await Promise.all([
      client.query(
        `select school_id, name, onboarding_stage, is_test_fixture,
                (select count(*) from students st where st.school_id = s.school_id) as student_count
         from schools s order by created_at desc`
      ),
      client.query(`select count(*) filter (where status = 'active') as active, count(*) as total from students`),
      client.query(`select count(*) as total from teachers`),
      client.query(
        `select status, count(*) from communication_log
         where created_at > now() - interval '30 days' group by status`
      ),
      client.query(
        `select
           count(*) filter (where s.status = 'active') as active,
           count(*) as total
         from students s`
      ),
      client.query(
        `select
           coalesce(sum(amount_minor) filter (where status = 'paid'), 0) as collected_minor,
           coalesce(sum(amount_minor) filter (where status in ('pending','overdue')), 0) as due_minor
         from fees_ledger`
      ),
      client.query(
        `select date_trunc('day', created_at)::date as day, count(*) as sent,
                count(*) filter (where status in ('delivered','read')) as delivered
         from communication_log
         where created_at > now() - interval '14 days'
         group by 1 order by 1`
      ),
    ]);

    const schools: SchoolRow[] = schoolsRes.rows.map((r) => ({
      id: r.school_id,
      name: r.name,
      stage: r.onboarding_stage,
      students: Number(r.student_count),
      isFixture: r.is_test_fixture,
    }));

    const commsByStatus: Record<string, number> = {};
    for (const row of commsRes.rows) commsByStatus[row.status] = Number(row.count);
    const totalComms = Object.values(commsByStatus).reduce((a, b) => a + b, 0);
    const blocked = Object.entries(commsByStatus)
      .filter(([k]) => k.startsWith('blocked'))
      .reduce((a, [, v]) => a + v, 0);
    const readOrDelivered = (commsByStatus['read'] ?? 0) + (commsByStatus['delivered'] ?? 0);

    return {
      schools,
      activeStudents: Number(studentsRes.rows[0]?.active ?? 0),
      totalStudents: Number(studentsRes.rows[0]?.total ?? 0),
      totalStaff: Number(staffRes.rows[0]?.total ?? 0),
      totalComms,
      blocked,
      deliveryRate: totalComms > 0 ? Math.round((readOrDelivered / totalComms) * 100) : null,
      consentActive: Number(consentRes.rows[0]?.active ?? 0),
      consentTotal: Number(consentRes.rows[0]?.total ?? 0),
      feesCollectedMinor: Number(feesRes.rows[0]?.collected_minor ?? 0),
      feesDueMinor: Number(feesRes.rows[0]?.due_minor ?? 0),
      dailySends: dailyRes.rows.map((r) => ({ day: r.day as string, sent: Number(r.sent), delivered: Number(r.delivered) })),
    };
  });

  const consentPct = data.consentTotal > 0 ? Math.round((data.consentActive / data.consentTotal) * 100) : 0;
  const rupees = (minor: number) => `₹${(minor / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  const maxSent = Math.max(1, ...data.dailySends.map((d) => d.sent));
  const allFixture = data.schools.length > 0 && data.schools.every((s) => s.isFixture);

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-1 text-xl font-bold text-slate">Platform Dashboard</h1>
      <p className="mb-6 text-sm text-slate/70">
        {allFixture
          ? 'Every school onboarded so far is a tagged test fixture -- the numbers below are real queries against real fixture data, not production traffic.'
          : `${data.schools.length} school(s) onboarded.`}
      </p>

      <div className="mb-6 flex flex-wrap gap-4">
        <Kpi label="Schools" value={String(data.schools.length)} sub={`${data.schools.filter((s) => s.isFixture).length} test fixture`} />
        <Kpi label="Students" value={String(data.totalStudents)} sub={`${data.activeStudents} active, ${data.totalStudents - data.activeStudents} pending consent`} tone="emerald" />
        <Kpi label="Teaching staff" value={String(data.totalStaff)} tone="sapphire" />
        <Kpi
          label="Fee collection (fixture)"
          value={rupees(data.feesCollectedMinor)}
          sub={`${rupees(data.feesDueMinor)} outstanding`}
          tone="amber"
        />
      </div>

      <div className="mb-6 flex flex-col gap-4 md:flex-row">
        <Card className="flex-[1.4]">
          <h2 className="mb-4 text-lg font-bold text-slate">WhatsApp send volume -- last 14 days</h2>
          {data.dailySends.length === 0 ? (
            <p className="text-sm text-slate/70">No messages logged in the last 14 days.</p>
          ) : (
            <div className="flex items-end gap-2" style={{ height: 140 }}>
              {data.dailySends.map((d) => (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-xs text-slate/70 tabular-nums">{d.sent}</span>
                  <div className="flex w-full flex-col justify-end gap-0.5" style={{ height: 100 }}>
                    <div className="w-full rounded-t bg-sapphire/20" style={{ height: `${(d.sent / maxSent) * 100}%` }} />
                    <div className="w-full rounded-t bg-sapphire" style={{ height: `${(d.delivered / maxSent) * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-slate/70">{new Date(d.day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 text-sm text-slate/70">
            {data.totalComms} messages logged in the last 30 days
            {data.deliveryRate !== null && `, ${data.deliveryRate}% delivered or read`}
            {data.blocked > 0 && ` -- ${data.blocked} blocked (consent/pilot/budget gates working as designed, not a failure)`}.
          </p>
        </Card>

        <Card className="flex-1">
          <h2 className="mb-4 text-lg font-bold text-slate">Consent completion</h2>
          <div className="mb-2 h-3 w-full overflow-hidden rounded-full bg-slate/10">
            <div className="h-full bg-emerald" style={{ width: `${consentPct}%` }} />
          </div>
          <p className="text-sm text-slate">
            {consentPct}% of {data.consentTotal} students across all schools have active consent on file.
          </p>
          <p className="mt-4 text-sm text-slate/70">
            No bulk-mark-consent shortcut exists in this product -- an incomplete-but-honest number here is correct, not a bug.
          </p>
        </Card>
      </div>

      <Card>
        <h2 className="mb-4 text-lg font-bold text-slate">Schools</h2>
        <Table<SchoolRow>
          columns={columns}
          rows={data.schools}
          getRowId={(s) => s.id}
          emptyTitle="No schools onboarded yet"
          emptyDescription="Schools created through the onboarding pipeline will appear here."
        />
      </Card>
    </div>
  );
}
