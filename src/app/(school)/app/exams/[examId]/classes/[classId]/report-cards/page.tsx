import { notFound } from 'next/navigation';
import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { ReportCardsView } from '@/components/exams/ReportCardsView';
import { getServerSession } from '@/lib/auth/server-session';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Exams → publish and report cards (docs/27 row 9c, C215): publish a class's result (its marks are then frozen),
// the principal's reopening with a reason, the class teacher's remarks, and each child's report card PDF.
export default async function ReportCardsPage({ params }: { params: { examId: string; classId: string } }) {
  const off = await moduleOffReason('exams');
  if (off) return <ModuleOffPage moduleId="exams" reason={off} />;
  if (!isUuid(params.examId) || !isUuid(params.classId)) notFound();
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage moduleId="exams" help="publish-report-cards" tour="report-cards" title={t(lang, 'rc.page.title')} purpose={t(lang, 'rc.page.purpose')}>
      <ReportCardsView examId={params.examId} classId={params.classId} />
    </ModulePage>
  );
}
