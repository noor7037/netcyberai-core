import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/server-session';
import { canAccessApp, shellForRole } from '@/lib/auth/guards';
import { SessionRevokedError, withTenantContext } from '@/lib/auth/db';
import { AppShell } from '@/components/app-shell/AppShell';
import { ScanButton } from '@/components/shell/ScanButton';
import { toShellGroups, toShellItem } from '@/components/app-shell/shell-nav';
import { ToastProvider } from '@/components/ui/Toast';
import type { SchoolEntitlements } from '@/lib/contracts/entitlements';
import type { SchoolRole } from '@/lib/contracts/modules';
import { bottomNavItems, buildNavigation } from '@/lib/contracts/navigation';
import { buildQuickAdd } from '@/lib/contracts/quick-add';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { loadEntitlements } from '@/lib/frameworks/entitlements';

// Every page under this route group renders through THIS layout by
// Next.js's own nesting rules. The guard below runs first and is checked
// by scripts/check_route_guards.py; nothing after it can widen access.
//
// The menu is computed here, once (C121): the module registry × this role
// × the school's entitlements (buildNavigation, 17 §2), in 8 groups; the
// teacher shell also gets the phone bottom bar. It decides only what is
// shown: every module API checks role and entitlement itself, and RLS
// stays the backstop.

// Every word of the shell comes from the message files, in the language the
// person chose (C134).

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!canAccessApp(session)) {
    redirect('/login');
  }

  const role = session!.role as SchoolRole;
  const schoolId = session!.schoolId!;
  let entitlements: SchoolEntitlements = { schoolId, plan: 'unassigned', accessMode: 'full', modules: {} };
  let schoolName = 'NetCyberAI';
  let menuIncomplete = false;
  try {
    ({ entitlements, schoolName } = await withTenantContext(session!, async (db) => {
      const { rows } = await db.query(`select name from schools where school_id = $1`, [schoolId]);
      return { entitlements: await loadEntitlements(db, schoolId), schoolName: (rows[0]?.name as string | undefined) ?? 'NetCyberAI' };
    }));
  } catch (err) {
    if (err instanceof SessionRevokedError) redirect('/login');
    // The pages still load and check their own access; the menu shows Help
    // only and says so, instead of the whole app failing.
    console.error('[app-shell] menu data unavailable', err instanceof Error ? err.name : 'error');
    menuIncomplete = true;
  }

  const { lang, known } = getLang(session!.sub);
  // With the menu's data missing, nothing is offered that the school may not have.
  const quickAdd = menuIncomplete ? [] : buildQuickAdd(role, entitlements);
  const nav = buildNavigation(role, entitlements);
  const isTeacher = shellForRole(role) === 'teacher';
  const isOffice = shellForRole(role) === 'office';
  const bottom = isTeacher ? bottomNavItems(nav).map((i) => toShellItem(i, lang)) : undefined;
  // My Day is everyone's home (docs/19 rule 2): the first link of the menu,
  // and of the teacher's bottom bar in place of the dashboard they do not have.
  const myDay = { href: '/app/my-day', label: t(lang, 'myDay.title'), icon: 'check' as const };
  const menu = toShellGroups(nav, lang);
  const home = menu.find((g) => g.id === 'home');
  // A school without the Dashboard module (or suspended) still has its home.
  const homeGroup = { id: 'home', label: t(lang, 'group.home'), tone: ['royal', 'electric'] as const, items: [myDay, ...(home?.items ?? []).filter((i) => isOffice || i.href !== '/app/dashboard')] };
  const groups = [homeGroup, ...menu.filter((g) => g.id !== 'home')];
  const bottomBar = bottom && [myDay, ...bottom.filter((i) => i.href !== '/app/dashboard')].slice(0, 4);

  return (
    <ToastProvider>
      <AppShell
        groups={groups}
        bottomItems={bottomBar}
        brand={schoolName}
        roleLabel={t(lang, `role.${role}`)}
        navLabel={t(lang, 'shell.nav.school')}
        accountHref="/app/account"
        action={isTeacher ? <ScanButton onDark /> : undefined}
        lang={lang}
        langKnown={known}
        scope="school"
        quickAdd={quickAdd}
      >
        {menuIncomplete && (
          <p role="status" lang={lang} className="bg-tangerine/10 px-4 py-2 text-sm text-slate">
            {t(lang, 'shell.menu.incomplete')}
          </p>
        )}
        {children}
      </AppShell>
    </ToastProvider>
  );
}
