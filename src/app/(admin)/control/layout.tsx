import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/server-session';
import { canAccessControl } from '@/lib/auth/guards';
import { AppShell } from '@/components/app-shell/AppShell';
import { controlShellGroups } from '@/components/app-shell/shell-nav';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
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
// with its own single group, its own search and no "+ New".

export default async function ControlLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!canAccessControl(session)) {
    redirect('/login');
  }
  const { lang, known } = getLang(session!.sub);
  return (
    <AppShell groups={controlShellGroups(controlNav, undefined, lang)} brand={t(lang, 'shell.brand.control')} roleLabel={t(lang, 'role.super_admin')} navLabel={t(lang, 'shell.nav.control')} accountHref="/control/account" lang={lang} langKnown={known} scope="control">
      {children}
    </AppShell>
  );
}
