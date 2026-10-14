import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { RteDeskView } from '@/components/rte/RteDeskView';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// The RTE claim desk (docs/28 slice 10c, C223): the state's rate for each school year, each RTE child's evidence,
// the year's claim sheet with raising and marking paid, and unpaid claims by age. The finance roles only.
export default async function RteDeskPage() {
  const off = await moduleOffReason('fees');
  if (off) return <ModuleOffPage moduleId="fees" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage moduleId="fees" help="claim-rte-reimbursement" tour="fees-rte" title={t(lang, 'rtd.page.title')} purpose={t(lang, 'rtd.page.purpose')}>
      <RteDeskView />
    </ModulePage>
  );
}
