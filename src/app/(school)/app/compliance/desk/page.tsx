import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { ComplianceDeskView } from '@/components/compliance/ComplianceDeskView';
import { getServerSession } from '@/lib/auth/server-session';
import { COMPLIANCE_DESK_FEATURE } from '@/lib/compliance/qualifications';
import { featureOff, moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// The compliance desk (docs/28 row 10d, C227): teacher qualifications and TET with expiry alerts, the mandatory public
// disclosure data, Form 6 fee data and SQAAF evidence. The office only. It is a part of the plan (C223-A answer 1,
// C226): a school whose plan does not have it is told so plainly, and its routes refuse in the same way.
export default async function ComplianceDeskPage() {
  const off = await moduleOffReason('compliance');
  if (off) return <ModuleOffPage moduleId="compliance" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  const notInPlan = await featureOff(COMPLIANCE_DESK_FEATURE);
  return (
    <ModulePage moduleId="compliance" help="keep-the-compliance-desk" tour="compliance-desk" title={t(lang, 'cdk.page.title')} purpose={t(lang, 'cdk.page.purpose')}>
      {notInPlan ? (
        <div data-cdk-not-in-plan className="flex flex-col items-start gap-2 rounded-md bg-off-white px-3 py-2 text-sm text-slate">
          <p className="font-semibold">{t(lang, 'cdk.notInPlan')}</p>
          <p>{t(lang, 'cdk.notInPlanRest')}</p>
          <a href="/app/compliance" className="inline-flex min-h-[44px] items-center rounded-md border border-slate/20 bg-white px-4 font-semibold text-slate">{t(lang, 'cdk.openCompliance')}</a>
        </div>
      ) : (
        <ComplianceDeskView />
      )}
    </ModulePage>
  );
}
