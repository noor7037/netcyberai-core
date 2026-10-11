import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { RecoveryView } from '@/components/recovery/RecoveryView';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Homework Recovery v1 (docs/20 5g, C152).
export default async function RecoveryPage() {
  const off = await moduleOffReason('recovery');
  if (off) return <ModuleOffPage moduleId="recovery" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage moduleId="recovery" help="homework-recovery" tour="recovery" title={t(lang, 'rec.title')} purpose={t(lang, 'rec.purpose')}>
      <RecoveryView />
    </ModulePage>
  );
}
