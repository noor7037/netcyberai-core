import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { controlShellGroups, toShellGroups } from '@/components/app-shell/shell-nav';
import { ControlDashboardView } from '@/components/dashboards/ControlDashboardView';
import { OfficeDashboardView } from '@/components/dashboards/OfficeDashboardView';
import { principalNavigationFixture } from '@/demo-fixture/contracts';
import { controlDashboardFixture, officeDashboardEmptyFixture, officeDashboardFixture } from '@/demo-fixture/visual-foundation';
import { FIXTURE_NOTICE } from '@/lib/contracts/fixture';
import { controlNav } from '@/lib/nav/nav-items';
import { shellWords } from '@/components/app-shell/shell-words';

// The two live dashboards on illustrative values (C131), development only:
// the real ones need a signed-in session and a database. ?view=control is
// the founder's; ?view=empty is a school with nothing recorded yet.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Dashboards (development)', robots: { index: false, follow: false } };

const NOW = new Date('2026-09-25T04:00:00Z'); // a fixed morning, so the preview does not change with the clock

export default function DashboardsPreview({ searchParams }: { searchParams: { view?: string } }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const here = '/design-system/shell/dashboards';
  const note = (
    <p role="note" className="mx-4 mt-4 rounded-md border border-tangerine/40 bg-tangerine/10 p-3 text-sm text-slate md:mx-6">
      {FIXTURE_NOTICE}
    </p>
  );
  if (searchParams.view === 'control') {
    return (
      <AppShell {...shellWords('en')} groups={controlShellGroups(controlNav, (h) => (h === '/control' ? `${here}?view=control` : h))} brand="NetCyberAI Control" roleLabel="Platform admin" navLabel="Platform 2 navigation" accountHref={here}>
        {note}
        <ControlDashboardView data={controlDashboardFixture} now={NOW} schoolsTable={<p className="text-sm text-slate">{controlDashboardFixture.schools.map((s) => s.name).join(' · ')}</p>} />
      </AppShell>
    );
  }
  return (
    <AppShell {...shellWords('en')} groups={toShellGroups(principalNavigationFixture.data)} brand="Illustrative School" roleLabel="Principal" navLabel="School navigation" accountHref={here}>
      {note}
      <OfficeDashboardView data={searchParams.view === 'empty' ? officeDashboardEmptyFixture : officeDashboardFixture} now={NOW} />
    </AppShell>
  );
}
