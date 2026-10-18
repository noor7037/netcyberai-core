import Link from 'next/link';
import { Table, type TableColumn } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { getServerSession } from '@/lib/auth/server-session';
import { withTenantContext } from '@/lib/auth/db';
import { ModulePage } from '@/components/app-ui/ModulePage';

type SchoolRow = { id: string; name: string; status: string };

const columns: TableColumn<SchoolRow>[] = [
  {
    key: 'name',
    header: 'Name',
    render: (s) => (
      <Link href={`/control/schools/${s.id}`} className="inline-flex min-h-[44px] items-center font-medium text-sapphire underline">
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
    <ModulePage title="Schools" purpose="Every school. Open one for its onboarding, modules and access." icon="school" tone="sapphire" eyebrow="Control">
      <Table<SchoolRow>
        columns={columns}
        rows={rows}
        getRowId={(s) => s.id}
        emptyTitle="No schools onboarded yet"
        emptyDescription="Schools created in onboarding appear here."
        emptyAction={
          <Button href="/control/onboarding" variant="outline">
            Start onboarding a school
          </Button>
        }
      />
    </ModulePage>
  );
}
