import { ModulePage } from '@/components/app-ui/ModulePage';
import { AppsView } from '@/components/control/apps/AppsView';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { liveBuild, loadControlApps } from '@/lib/control/apps';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Control → Apps (docs/family-app/10 §2, M1-7): the version, the modules and who sees them, the kill switch and the
// banner of each app, the staff-preview accounts, and the recent changes with Undo. The layout has already refused
// anyone but the founder; this runs as nca_super, in one transaction. Changes go through /api/control/apps/**.

export const dynamic = 'force-dynamic';

export default async function ControlAppsPage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  const data = session ? await withTenantContext(session, (db) => loadControlApps(db)) : null;
  return (
    <ModulePage title={t(lang, 'control.apps.title')} purpose={t(lang, 'control.apps.purpose')} about={t(lang, 'control.apps.about')} icon="operations" tone="royal" eyebrow={t(lang, 'group.control')} headerLang={lang}>
      {data && <AppsView data={data} build={liveBuild()} lang={lang} now={new Date()} />}
    </ModulePage>
  );
}
