import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { toShellGroups, toShellItem } from '@/components/app-shell/shell-nav';
import { ComingInPhase } from '@/components/app-ui/ComingInPhase';
import { ScanButton } from '@/components/shell/ScanButton';
import { bottomNavItems } from '@/lib/contracts/navigation';
import { FIXTURE_NOTICE } from '@/lib/contracts/fixture';
import { principalNavigationFixture, teacherNavigationFixture } from '@/demo-fixture/contracts';

// The app shell on illustrative navigation (C121), development only: the
// real /app needs a signed-in session and a database. ?role=teacher shows
// the teacher shell with its phone bottom bar and scan action.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'App shell (development)', robots: { index: false, follow: false } };

export default function ShellPreview({ searchParams }: { searchParams: { role?: string } }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const teacher = searchParams.role === 'teacher';
  const nav = (teacher ? teacherNavigationFixture : principalNavigationFixture).data;
  return (
    <AppShell
      groups={toShellGroups(nav)}
      bottomItems={teacher ? bottomNavItems(nav).map((i) => toShellItem(i)) : undefined}
      brand="Illustrative School"
      roleLabel={teacher ? 'Teacher' : 'Principal'}
      navLabel="School navigation"
      accountHref="/design-system/shell"
      action={teacher ? <ScanButton onDark /> : undefined}
    >
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <p role="note" className="rounded-md border border-tangerine/40 bg-tangerine/10 p-3 text-sm text-slate">
          {FIXTURE_NOTICE}
        </p>
        <ComingInPhase moduleId="ptm" />
      </div>
    </AppShell>
  );
}
