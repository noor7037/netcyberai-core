import Link from 'next/link';
import { ControlDashboardView } from '@/components/dashboards/ControlDashboardView';
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

export default async function ControlDashboardPage() {
  const session = await getServerSession();
  if (!session) {
    return null; // control/layout.tsx already redirects unauthenticated/unauthorized sessions before this renders
  }

  const data = await withTenantContext(session, async (client) => {
    const [schoolsRes, studentsRes, staffRes, commsRes, consentRes, feesRes, dailyRes, ticketsRes] = await Promise.all([
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
           count(*) filter (where s.status = 'pending_consent') as pending
         from students s`
      ),
      client.query(
        `select
           coalesce(sum(amount_minor) filter (where status = 'paid'), 0) as collected_minor,
           coalesce(sum(amount_minor) filter (where status in ('pending','overdue')), 0) as due_minor
         from fees_ledger`
      ),
      client.query(
        `select (created_at at time zone 'Asia/Kolkata')::date::text as day, count(*) as sent,
                count(*) filter (where status in ('delivered','read')) as delivered
         from communication_log
         where (created_at at time zone 'Asia/Kolkata')::date > (now() at time zone 'Asia/Kolkata')::date - 14
         group by 1 order by 1`
      ),
      client.query(`select count(*) filter (where status = 'open') as open, count(*) filter (where status = 'in_progress') as in_progress from support_tickets`),
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
      consentPending: Number(consentRes.rows[0]?.pending ?? 0),
      feesCollectedMinor: Number(feesRes.rows[0]?.collected_minor ?? 0),
      feesDueMinor: Number(feesRes.rows[0]?.due_minor ?? 0),
      ticketsOpen: Number(ticketsRes.rows[0]?.open ?? 0),
      ticketsInProgress: Number(ticketsRes.rows[0]?.in_progress ?? 0),
      dailySends: dailyRes.rows.map((r) => ({ day: r.day as string, sent: Number(r.sent), delivered: Number(r.delivered) })),
    };
  });

  return <ControlDashboardView data={data} schoolsTable={<Table<SchoolRow> columns={columns} rows={data.schools} getRowId={(s) => s.id} emptyTitle="No schools onboarded yet" emptyDescription="Schools created through the onboarding pipeline will appear here." />} />;
}
