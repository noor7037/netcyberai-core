import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/server-session';
import { canAccessControl } from '@/lib/auth/guards';
import { AppShell } from '@/components/app-shell/AppShell';
import type { ShellGroup } from '@/components/app-shell/shell-nav';
import { controlNav } from '@/lib/nav/nav-items';

// Redundant with middleware.ts's edge gate on purpose -- defense in
// depth, same principle as RLS remaining the backstop under the app
// layer (see the B2 report). If middleware's matcher config were ever
// wrong, this layout still refuses to render for anyone but super_admin.
//
// Every page under this route group renders through THIS layout by
// Next.js's own nesting rules -- there is no per-page guard to forget.
// scripts/check_route_guards.py's real job is catching the other way
// this could be bypassed: a second route group elsewhere in src/app
// that resolves to a /control/... URL without living under this folder.
//
// The Control plane uses the same app shell as the school app (C121),
// with its own single group.
const CONTROL_GROUPS: ShellGroup[] = [{ id: 'control', label: 'Control', tone: ['sapphire', 'royal'], items: controlNav.map((n) => ({ href: n.href, label: n.label })) }];

export default async function ControlLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!canAccessControl(session)) {
    redirect('/login');
  }
  return (
    <AppShell groups={CONTROL_GROUPS} brand="NetCyberAI Control" roleLabel="Platform admin" navLabel="Platform 2 navigation" accountHref="/control/account">
      {children}
    </AppShell>
  );
}
