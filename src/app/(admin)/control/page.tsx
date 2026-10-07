import Link from 'next/link';
import { ControlDashboardView } from '@/components/dashboards/ControlDashboardView';
import { Badge } from '@/components/ui/Badge';
import { Table, type TableColumn } from '@/components/ui/Table';
import { getServerSession } from '@/lib/auth/server-session';
import { withTenantContext } from '@/lib/auth/db';
import { loadControlDashboard, type ControlSchoolRow } from '@/lib/control/dashboard';

type SchoolRow = ControlSchoolRow;

const columns: TableColumn<SchoolRow>[] = [
  {
    key: 'name',
    header: 'School',
    render: (s) => (
      <Link href={`/control/schools/${s.id}`} className="inline-flex min-h-[44px] items-center font-medium text-sapphire underline">
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

  // Platform totals count live schools only; the list below shows every school (C132).
  const data = await withTenantContext(session, (client) => loadControlDashboard(client));

  return <ControlDashboardView data={data} schoolsTable={<Table<SchoolRow> columns={columns} rows={data.schools} getRowId={(s) => s.id} emptyTitle="No schools onboarded yet" emptyDescription="Schools created through the onboarding pipeline will appear here." />} />;
}
