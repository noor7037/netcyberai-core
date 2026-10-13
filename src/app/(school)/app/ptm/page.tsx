import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { PtmView } from '@/components/ptm/PtmView';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Parent-teacher meetings (docs/25 slice 7k, C193).
export default async function PtmPage() {
  const off = await moduleOffReason('ptm');
  if (off) return <ModuleOffPage moduleId="ptm" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage moduleId="ptm" help="plan-a-ptm" tour="ptm" title={t(lang, 'ptm.page.title')} purpose={t(lang, 'ptm.page.purpose')}>
      <PtmView />
    </ModulePage>
  );
}
