import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppCard, ChartCard, DataList, EmptyState, KpiTile, NoAccessState, PageHeader, Skeleton, StatusPill, TOKEN_TONES, type DataColumn, type StatusTone } from '@/components/app-ui';
import { MODULE_GROUPS } from '@/lib/contracts/modules';
import { attendanceTrendFixture, classCoverageFixture, feeShareFixture, kpiTilesFixture, studentPageFixture } from '@/demo-fixture/contracts';
import { FIXTURE_NOTICE } from '@/lib/contracts/fixture';
import { GalleryInteractive } from './GalleryInteractive';

// The app design system gallery (PR-3a, 17 §4): every app-ui piece in its
// states, on illustrative fixtures from src/demo-fixture. Development
// only: production answers 404, it is never prerendered, never in the
// sitemap ((dev) is excluded) and never indexed.

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'App design system (development)', robots: { index: false, follow: false } };

type Row = (typeof studentPageFixture.data.rows)[number];
const columns: DataColumn<Row>[] = [
  { key: 'name', header: 'Name', primary: true, render: (r) => r.displayName },
  { key: 'adm', header: 'Admission no.', render: (r) => r.admissionNo },
  { key: 'class', header: 'Class', render: (r) => `${r.className} ${r.section}` },
  { key: 'status', header: 'Status', render: () => <StatusPill tone="success">Active</StatusPill> },
];

const STATUS: [StatusTone, string][] = [
  ['neutral', 'Draft'],
  ['info', 'Scheduled'],
  ['success', 'Sent'],
  ['warning', 'Waiting'],
  ['alert', 'Failed'],
  ['ai', 'AI suggestion'],
  ['recognition', 'Personal best'],
];

export default function DesignSystemGallery() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main className="min-h-screen bg-off-white px-4 py-6 md:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <PageHeader eyebrow="Development only" title="App design system" description="Every piece the school app and Control are built from, in each state. Logo colours only; contrast checked; motion off when the device asks for less." />
        <p role="note" className="rounded-md border border-tangerine/40 bg-tangerine/10 p-3 text-sm text-slate">
          {FIXTURE_NOTICE}
        </p>

        <AppCard title="Module group tones" description="One pair of logo colours per navigation group (17 §2, §4).">
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {MODULE_GROUPS.map((g) => (
              <li key={g.id} className="flex items-center gap-2 rounded-lg border border-slate/10 p-2">
                <span aria-hidden="true" className={`h-8 w-8 shrink-0 rounded-md ${TOKEN_TONES[g.tone[0]].bar}`} />
                <span aria-hidden="true" className={`h-8 w-3 shrink-0 rounded ${TOKEN_TONES[g.tone[1]].bar}`} />
                <span className={`rounded-md px-2 py-1 text-sm font-bold ${TOKEN_TONES[g.tone[0]].soft}`}>{g.label}</span>
              </li>
            ))}
          </ul>
        </AppCard>

        <AppCard title="Status" description="The words say the status; the colour repeats it.">
          <div className="flex flex-wrap gap-2">
            {STATUS.map(([tone, label]) => (
              <StatusPill key={tone} tone={tone}>
                {label}
              </StatusPill>
            ))}
          </div>
        </AppCard>

        <section aria-label="KPI tiles" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {kpiTilesFixture.data.map((t) => (
            <KpiTile key={t.id} tile={t} />
          ))}
        </section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard chart={attendanceTrendFixture.data} tone="royal" />
          <ChartCard chart={classCoverageFixture.data} tone="azure" />
          <ChartCard chart={feeShareFixture.data} tone="tangerine" />
          <ChartCard chart={{ ...feeShareFixture.data, id: 'empty', title: 'Fee status (no data yet)', slices: [] }} emptyHint="Fee data appears once the first fees are recorded." />
        </div>

        <AppCard title="List" description="A table from 768 px; cards on a phone.">
          <DataList
            caption="Students"
            columns={columns}
            rows={studentPageFixture.data.rows}
            rowKey={(r) => r.studentId}
            rowHref={() => '/design-system'}
            empty={{ title: 'No students yet', whatToDo: 'Add a student or import a CSV file.' }}
          />
        </AppCard>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <AppCard title="Loading">
            <Skeleton />
          </AppCard>
          <AppCard title="Empty">
            <EmptyState title="No students yet" whatToDo="Add a student, or import your list from a CSV file." />
          </AppCard>
          <GalleryInteractive />
          <AppCard title="No permission">
            <div className="flex flex-col gap-2">
              <NoAccessState reason="role" />
              <NoAccessState reason="module" />
              <NoAccessState reason="read_only" />
            </div>
          </AppCard>
        </div>
      </div>
    </main>
  );
}
