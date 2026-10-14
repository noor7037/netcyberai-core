import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/server-session';
import { canAccessApp, shellForRole } from '@/lib/auth/guards';
import { SessionRevokedError, withTenantContext } from '@/lib/auth/db';
import { AppShell } from '@/components/app-shell/AppShell';
import { ViewAsBanner } from '@/components/app-shell/ViewAsBanner';
import { ScanButton } from '@/components/shell/ScanButton';
import { toShellGroups, toShellItem } from '@/components/app-shell/shell-nav';
import { ToastProvider } from '@/components/ui/Toast';
import { accessNoticeText, schoolAccessNotice, schoolTrialNotice, trialNoticeText, type AccessNotice, type TrialNotice } from '@/lib/control/billing-notice';
import type { SchoolEntitlements } from '@/lib/contracts/entitlements';
import type { SchoolRole } from '@/lib/contracts/modules';
import { bottomNavItems, buildNavigation } from '@/lib/contracts/navigation';
import { buildQuickAdd } from '@/lib/contracts/quick-add';
import { t } from '@/lib/i18n';
import { getLang, getToursSeen } from '@/lib/i18n/server';
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
  // While the founder is viewing as this person (C165): whose view it is and when it ends.
  let viewAs: { name: string; endsAt: string } | null = null;
  // In grace or read-only: the dated line the school reads on every screen (C204).
  let accessNotice: AccessNotice | null = null;
  // In the free month, for the principal and the school admin: the days left, and the notice from 7 days before (C226).
  let trialNotice: TrialNotice | null = null;
  try {
    ({ entitlements, schoolName, viewAs, accessNotice, trialNotice } = await withTenantContext(session!, async (db) => {
      const { rows } = await db.query(`select name from schools where school_id = $1`, [schoolId]);
      const imp = session!.impersonation
        ? (await db.query(`select i.expires_at, u.display_name from impersonation_sessions i join users u on u.user_id = i.target_user_id where i.impersonation_id = $1`, [session!.impersonation.impersonationId])).rows[0]
        : null;
      const loaded = await loadEntitlements(db, schoolId);
      return {
        entitlements: loaded,
        schoolName: (rows[0]?.name as string | undefined) ?? 'NetCyberAI',
        viewAs: imp ? { name: imp.display_name as string, endsAt: new Date(imp.expires_at as string).toISOString() } : null,
        // The last reads of this transaction: if one fails, the menu above is still whole and its line is left out.
        accessNotice: await schoolAccessNotice(db, loaded).catch(() => null),
        trialNotice: await schoolTrialNotice(db, schoolId, role).catch(() => null),
      };
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
  // Settings (what is switched on for the school, WhatsApp) is the office's, and is reached from here.
  const settings = { href: '/app/settings', label: t(lang, 'shell.settings'), icon: 'operations' as const };
  const homeGroup = { id: 'home', label: t(lang, 'group.home'), tone: ['royal', 'electric'] as const, items: [myDay, ...(home?.items ?? []).filter((i) => isOffice || i.href !== '/app/dashboard'), ...(isOffice ? [settings] : [])] };
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
        device={{ schoolId, userId: session!.sub }}
        toursSeen={getToursSeen(session!.sub)}
        scope="school"
        quickAdd={quickAdd}
      >
        {viewAs && <ViewAsBanner name={viewAs.name} role={role} endsAt={viewAs.endsAt} schoolId={schoolId} />}
        {entitlements.accessMode === 'suspended' && (
          <p role="status" lang={lang} data-account-paused className="bg-tangerine/10 px-4 py-2 text-sm font-semibold text-slate">
            {t(lang, 'modules.paused')}
          </p>
        )}
        {accessNotice && (
          <p role="status" lang={lang} data-access-notice={accessNotice.kind} className="bg-tangerine/10 px-4 py-2 text-sm font-semibold text-slate">
            {accessNoticeText(lang, accessNotice)}
          </p>
        )}
        {trialNotice && (
          <p role="status" lang={lang} data-trial-notice={trialNotice.kind} className={trialNotice.kind === 'days_left' ? 'bg-off-white px-4 py-2 text-sm text-slate' : 'bg-tangerine/10 px-4 py-2 text-sm font-semibold text-slate'}>
            {trialNoticeText(lang, trialNotice)}
          </p>
        )}
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
