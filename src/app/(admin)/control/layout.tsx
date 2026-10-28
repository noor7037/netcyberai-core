import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/server-session';
import { canAccessControl } from '@/lib/auth/guards';
import { withTenantContext } from '@/lib/auth/db';
import { AppShell } from '@/components/app-shell/AppShell';
import { controlShellGroups } from '@/components/app-shell/shell-nav';
import { t } from '@/lib/i18n';
import { getLang, getToursSeen } from '@/lib/i18n/server';
import { controlNav } from '@/lib/nav/nav-items';
import { storageHealth } from '@/lib/observability/storage-health';
import { StorageAlert } from '@/components/app-shell/StorageAlert';
import { shellWords } from '@/components/app-shell/shell-words';

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
// with its own single group, its own search and no "+ New". Its bar shows
// NetCyberAI's mark and name, and the signed-in founder's name and role
// (C235-B); if the name cannot be read, the role alone. While file storage
// does not work, a red line on every page says which setting is wrong (C236).

export default async function ControlLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!canAccessControl(session)) {
    redirect('/login');
  }
  const { lang, known } = getLang(session!.sub);
  const storage = storageHealth();
  const name = await withTenantContext(session!, async (db) => ((await db.query(`select display_name from users where user_id = $1`, [session!.sub])).rows[0]?.display_name as string | undefined)?.trim() ?? '').catch(() => '');
  const role = t(lang, 'role.super_admin');
  const storageState = await storage;
  return (
    <AppShell {...shellWords(lang)} groups={controlShellGroups(controlNav, undefined, lang)} brand={t(lang, 'shell.brand.control')} logoSrc="/brand/logo-mark.svg" person={name ? { name, role } : null} roleLabel={role} navLabel={t(lang, 'shell.nav.control')} accountHref="/control/account" lang={lang} langKnown={known} toursSeen={getToursSeen(session!.sub)} scope="control">
      {storageState !== 'ok' && <StorageAlert state={storageState} scope="control" lang={lang} />}
      {children}
    </AppShell>
  );
}
