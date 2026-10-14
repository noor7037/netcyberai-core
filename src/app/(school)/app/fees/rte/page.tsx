import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { RteDeskView } from '@/components/rte/RteDeskView';
import { getServerSession } from '@/lib/auth/server-session';
import { featureOff, moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { RTE_DESK_FEATURE } from '@/lib/rte/desk';

// The RTE claim desk (docs/28 slice 10c, C223; C225): the state's rate for each school year, which fee heads count,
// each RTE child's evidence, the year's claim sheet with raising, the state's payments in parts, writing off and
// reopening, and unpaid claims by age. The finance roles only. It is a part of the plan (C223-A answer 1): a school
// whose plan does not have it is told so plainly, and its routes refuse in the same way.
export default async function RteDeskPage() {
  const off = await moduleOffReason('fees');
  if (off) return <ModuleOffPage moduleId="fees" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  const notInPlan = await featureOff(RTE_DESK_FEATURE);
  return (
    <ModulePage moduleId="fees" help="claim-rte-reimbursement" tour="fees-rte" title={t(lang, 'rtd.page.title')} purpose={t(lang, 'rtd.page.purpose')}>
      {notInPlan ? (
        <div data-rte-not-in-plan className="flex flex-col items-start gap-2 rounded-md bg-off-white px-3 py-2 text-sm text-slate">
          <p className="font-semibold">{t(lang, 'rtd.notInPlan')}</p>
          <p>{t(lang, 'rtd.notInPlanTags')}</p>
          <a href="/app/fees" className="inline-flex min-h-[44px] items-center rounded-md border border-slate/20 bg-white px-4 font-semibold text-slate">{t(lang, 'rtd.openFees')}</a>
        </div>
      ) : (
        <RteDeskView />
      )}
    </ModulePage>
  );
}
