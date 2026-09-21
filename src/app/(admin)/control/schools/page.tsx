import Link from 'next/link';
import { Table, type TableColumn } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { getServerSession } from '@/lib/auth/server-session';
import { withTenantContext } from '@/lib/auth/db';

type SchoolRow = { id: string; name: string; status: string };

const columns: TableColumn<SchoolRow>[] = [
  {
    key: 'name',
    header: 'Name',
    render: (s) => (
      <Link href={`/control/schools/${s.id}`} className="font-medium text-sapphire underline">
        {s.name}
      </Link>
    ),
  },
  { key: 'status', header: 'Status', render: (s) => s.status },
];

export default async function SchoolsPage() {
  const session = await getServerSession();
  const rows: SchoolRow[] = session
    ? await withTenantContext(session, async (client) => {
        const { rows } = await client.query(
          `select school_id, name, onboarding_stage from schools order by created_at desc`
        );
        return rows.map((r) => ({ id: r.school_id, name: r.name, status: r.onboarding_stage }));
      })
    : [];

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-4 text-xl font-bold text-slate">Schools</h1>
      <Table<SchoolRow>
        columns={columns}
        rows={rows}
        getRowId={(s) => s.id}
        emptyTitle="No schools onboarded yet"
        emptyDescription="Schools created through the onboarding pipeline will appear here."
        emptyAction={
          <Button href="/control/onboarding" variant="outline">
            Start onboarding a school
          </Button>
        }
      />
    </div>
  );
}
