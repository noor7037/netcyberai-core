import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { toShellGroups } from '@/components/app-shell/shell-nav';
import { DataList, type DataColumn } from '@/components/app-ui/DataList';
import { ModulePage, PRIMARY_ACTION, QUIET_ACTION } from '@/components/app-ui/ModulePage';
import { StatusPill } from '@/components/app-ui/StatusPill';
import { principalNavigationFixture, studentPageFixture } from '@/demo-fixture/contracts';
import { FIXTURE_NOTICE } from '@/lib/contracts/fixture';
import { isModuleId, type ModuleId } from '@/lib/contracts/modules';

// The ModulePage template with every slot filled (C132), development only,
// on illustrative rows. ?module=<id> shows the same layout in another
// module's colour and icon: one layout, every module.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'ModulePage (development)', robots: { index: false, follow: false } };

type Row = (typeof studentPageFixture.data.rows)[number];
const columns: DataColumn<Row>[] = [
  { key: 'name', header: 'Name', primary: true, render: (r) => r.displayName },
  { key: 'adm', header: 'Admission no.', render: (r) => r.admissionNo },
  { key: 'class', header: 'Class', render: (r) => `${r.className} ${r.section}` },
  { key: 'status', header: 'Status', render: () => <StatusPill tone="success">Active</StatusPill> },
];
const chip = 'inline-flex min-h-[44px] items-center rounded-full border border-slate/20 bg-white px-4 text-sm font-semibold text-slate';

export default function ModulePagePreview({ searchParams }: { searchParams: { module?: string } }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const moduleId: ModuleId = isModuleId(searchParams.module) ? searchParams.module : 'students';
  return (
    <AppShell groups={toShellGroups(principalNavigationFixture.data)} brand="Illustrative School" roleLabel="Principal" navLabel="School navigation" accountHref="/design-system/shell/module-page">
      <ModulePage
        moduleId={moduleId}
        title={moduleId === 'students' ? 'Students' : moduleId === 'fees' ? 'Fees' : 'Attendance'}
        purpose="One line that says what this screen is for."
        primary={
          <button type="button" className={PRIMARY_ACTION}>
            + Add
          </button>
        }
        more={
          <>
            <button type="button" className={QUIET_ACTION}>
              Import
            </button>
            <button type="button" className={QUIET_ACTION}>
              Export
            </button>
          </>
        }
        notice={
          <p role="note" className="rounded-md border border-tangerine/40 bg-tangerine/10 p-3 text-sm text-slate">
            {FIXTURE_NOTICE}
          </p>
        }
        search={
          <label className="block max-w-sm text-sm font-semibold text-slate">
            Search
            <input type="search" placeholder="Name or admission no." className="mt-1 min-h-[44px] w-full rounded-md border border-slate/20 bg-white px-3 text-base text-slate" />
          </label>
        }
        filters={
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filters">
            <button type="button" aria-pressed="true" className="inline-flex min-h-[44px] items-center rounded-full bg-sapphire px-4 text-sm font-semibold text-white">
              All
            </button>
            <button type="button" aria-pressed="false" className={chip}>
              Waiting for consent
            </button>
            <button type="button" aria-pressed="false" className={chip}>
              Class 10 A
            </button>
          </div>
        }
      >
        <DataList caption="Rows" columns={columns} rows={studentPageFixture.data.rows} rowKey={(r) => r.studentId} empty={{ title: 'Nothing here yet', whatToDo: 'Add the first one with the button above.' }} />
      </ModulePage>
    </AppShell>
  );
}
