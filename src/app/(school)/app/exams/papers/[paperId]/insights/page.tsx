import { notFound } from 'next/navigation';
import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { PaperInsightsView } from '@/components/insights/PaperInsightsView';
import { getServerSession } from '@/lib/auth/server-session';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Exams → a paper's class view (docs/35, C352): from the approved answer sheets, how the class did question by
// question and topic by topic, and which children may need support by the school's own line. In roll order and
// never ranked. The office and the coordinator read every class, a teacher their own; the accountant none.
export default async function PaperInsightsPage({ params }: { params: { paperId: string } }) {
  const off = await moduleOffReason('exams');
  if (off) return <ModuleOffPage moduleId="exams" reason={off} />;
  if (!isUuid(params.paperId)) notFound();
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage moduleId="exams" help="read-a-paper-class-view" tour="paper-insights" title={t(lang, 'ins.paper.title')} purpose={t(lang, 'ins.paper.purpose')}>
      <PaperInsightsView paperId={params.paperId} />
    </ModulePage>
  );
}
