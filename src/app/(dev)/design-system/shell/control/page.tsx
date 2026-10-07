import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { controlShellGroups } from '@/components/app-shell/shell-nav';
import { PageHeader } from '@/components/app-ui/PageHeader';
import { FIXTURE_NOTICE } from '@/lib/contracts/fixture';
import { controlNav } from '@/lib/nav/nav-items';
import { EntitlementsPreview } from './EntitlementsPreview';

// Control → a school → Modules & access on illustrative data (C123),
// development only: the real /control needs the founder's session and a
// database. The switches work here, in memory.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Control: modules and access (development)', robots: { index: false, follow: false } };

export default function ControlEntitlementsPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <AppShell
      groups={controlShellGroups(controlNav, (h) => (h === '/control/schools' ? '/design-system/shell/control' : h))}
      brand="NetCyberAI Control"
      roleLabel="Platform admin"
      navLabel="Platform 2 navigation"
      accountHref="/design-system/shell/control"
    >
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <PageHeader eyebrow="School" tone="sapphire" title="Illustrative School" description="Modules & access" />
        <p role="note" className="rounded-md border border-tangerine/40 bg-tangerine/10 p-3 text-sm text-slate">
          {FIXTURE_NOTICE}
        </p>
        <EntitlementsPreview />
      </div>
    </AppShell>
  );
}
