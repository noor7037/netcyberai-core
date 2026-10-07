import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { controlShellGroups, toShellGroups } from '@/components/app-shell/shell-nav';
import { PageHeader } from '@/components/app-ui/PageHeader';
import { principalNavigationFixture } from '@/demo-fixture/contracts';
import { FIXTURE_NOTICE } from '@/lib/contracts/fixture';
import { controlNav } from '@/lib/nav/nav-items';
import { TicketsPreview } from './TicketsPreview';

// The ticket screens on illustrative data (C128), development only: the
// real /app and /control need a signed-in session and a database.
// ?side=control shows the founder's queue; ?view=new the form; ?view=<id>
// one ticket. Everything works here, in memory.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Support tickets (development)', robots: { index: false, follow: false } };

export default function TicketsPreviewPage({ searchParams }: { searchParams: { side?: string; view?: string } }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const control = searchParams.side === 'control';
  const view = searchParams.view ?? '';
  const here = `/design-system/shell/tickets?side=${control ? 'control' : 'school'}`;
  const title = view === 'new' ? 'Raise a ticket' : view ? 'Support ticket' : 'Support tickets';
  const body = (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <PageHeader eyebrow={control ? 'Support' : 'Help'} tone="sapphire" title={title} description={view ? undefined : control ? 'Tickets from every school. You get an email when one is raised.' : 'Ask NetCyberAI for help and follow the answers here.'} />
      <p role="note" className="rounded-md border border-tangerine/40 bg-tangerine/10 p-3 text-sm text-slate">
        {FIXTURE_NOTICE}
      </p>
      <TicketsPreview side={control ? 'platform' : 'school'} view={view} />
    </div>
  );
  return control ? (
    <AppShell
      groups={controlShellGroups(controlNav, (h) => (h === '/control/support' ? here : h))}
      brand="NetCyberAI Control"
      roleLabel="Platform admin"
      navLabel="Platform 2 navigation"
      accountHref={here}
    >
      {body}
    </AppShell>
  ) : (
    <AppShell groups={toShellGroups(principalNavigationFixture.data)} brand="Illustrative School" roleLabel="Principal" navLabel="School navigation" accountHref={here}>
      {body}
    </AppShell>
  );
}
