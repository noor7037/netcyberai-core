import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { EarlyWarningView } from '@/components/early-warning/EarlyWarningView';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Early Warning v1 (docs/26 slice 8j, C209): flags for staff, by rules, with why and what was done.
export default async function EarlyWarningPage() {
  const off = await moduleOffReason('early-warning');
  if (off) return <ModuleOffPage moduleId="early-warning" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage moduleId="early-warning" help="early-warning-flags" tour="early-warning" title={t(lang, 'ew.page.title')} purpose={t(lang, 'ew.page.purpose')}>
      <EarlyWarningView />
    </ModulePage>
  );
}
