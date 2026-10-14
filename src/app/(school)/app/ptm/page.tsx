import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { PtmShown } from '@/components/ptm/PtmShown';
import { PtmView } from '@/components/ptm/PtmView';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { PTM_SHOW } from '@/lib/insights/screens';

// Parent-teacher meetings (docs/25 slice 7k, C193).
// ?show=coming comes from the dashboard's "Meetings coming" and lists those meetings first (C203). The screen
// below is told that a list is drawn above it, so a change made there has that list read again.
export default async function PtmPage({ searchParams = {} }: { searchParams?: { show?: string } }) {
  const off = await moduleOffReason('ptm');
  if (off) return <ModuleOffPage moduleId="ptm" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  const shown = searchParams.show === PTM_SHOW;
  return (
    <ModulePage moduleId="ptm" help="plan-a-ptm" tour="ptm" title={t(lang, 'ptm.page.title')} purpose={t(lang, 'ptm.page.purpose')}>
      {shown && <PtmShown />}
      <PtmView shownAbove={shown} />
    </ModulePage>
  );
}
