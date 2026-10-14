import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { ComplaintsShown } from '@/components/complaints/ComplaintsShown';
import { ComplaintsView } from '@/components/complaints/ComplaintsView';
import { getServerSession } from '@/lib/auth/server-session';
import { isComplaintShow } from '@/lib/complaints/complaints';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Complaints from parents (docs/25 slice 7m, C195).
// ?show=open | overdue comes from a dashboard number and lists the complaints behind it first (C203). The
// screen below is told that a list is drawn above it, so a change made there has that list read again.
export default async function ComplaintsPage({ searchParams = {} }: { searchParams?: { show?: string } }) {
  const off = await moduleOffReason('complaints');
  if (off) return <ModuleOffPage moduleId="complaints" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  const shown = isComplaintShow(searchParams.show) ? searchParams.show : null;
  return (
    <ModulePage moduleId="complaints" help="handle-a-complaint" tour="complaints" title={t(lang, 'cmp.page.title')} purpose={t(lang, 'cmp.page.purpose')}>
      {shown && <ComplaintsShown show={shown} />}
      <ComplaintsView shownAbove={shown !== null} />
    </ModulePage>
  );
}
