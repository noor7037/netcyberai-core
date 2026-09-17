import { Table, type TableColumn } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';

type SchoolRow = { id: string; name: string; status: string };

const columns: TableColumn<SchoolRow>[] = [
  { key: 'name', header: 'Name', render: (s) => s.name },
  { key: 'status', header: 'Status', render: (s) => s.status },
];

// No real schools exist behind app_backend yet -- Table's own `empty`
// state is the honest thing to show, not fabricated rows. The detail
// shell below is real (all 21 sub-tabs), reachable via a clearly
// labeled preview link rather than an invented school row that would
// imply data that doesn't exist.
export default function SchoolsPage() {
  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-4 text-xl font-bold text-slate">Schools</h1>
      <Table<SchoolRow>
        columns={columns}
        rows={[]}
        getRowId={(s) => s.id}
        emptyTitle="No schools onboarded yet"
        emptyDescription="Schools created through the onboarding pipeline will appear here."
        emptyAction={
          <Button href="/control/schools/shell-preview" variant="outline">
            View the school-detail shell (preview, no real school)
          </Button>
        }
      />
    </div>
  );
}
