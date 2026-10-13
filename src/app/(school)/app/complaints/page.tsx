import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { ComplaintsView } from '@/components/complaints/ComplaintsView';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Complaints from parents (docs/25 slice 7m, C195).
export default async function ComplaintsPage() {
  const off = await moduleOffReason('complaints');
  if (off) return <ModuleOffPage moduleId="complaints" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage moduleId="complaints" help="handle-a-complaint" tour="complaints" title={t(lang, 'cmp.page.title')} purpose={t(lang, 'cmp.page.purpose')}>
      <ComplaintsView />
    </ModulePage>
  );
}
