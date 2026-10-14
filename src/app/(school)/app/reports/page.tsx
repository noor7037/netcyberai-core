import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { ReportsView } from '@/components/reports/ReportsView';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Reports (docs/26 slice 8h, C207): this person's own list of reports; a report opens with its days, its table
// with the total row, when it was run, the rule in one sentence and a CSV of exactly those rows. The report and
// its days are in the address (?report=…&range=… or &from=…&to=…), so a report can be bookmarked.
export default async function ReportsPage() {
  const off = await moduleOffReason('reports');
  if (off) return <ModuleOffPage moduleId="reports" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage moduleId="reports" help="run-a-report" tour="reports" title={t(lang, 'rpt.page.title')} purpose={t(lang, 'rpt.page.purpose')}>
      <ReportsView />
    </ModulePage>
  );
}
