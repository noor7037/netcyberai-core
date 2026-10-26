import { notFound } from 'next/navigation';
import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { MarkingHubView } from '@/components/marking/MarkingHubView';
import { getServerSession } from '@/lib/auth/server-session';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Exams → a paper's AI marking (docs/35, C347): its questions, the class's scripts, how far marking has come, and the
// review list. Who may do what is the API's check, and the database's.
export default async function PaperMarkingPage({ params }: { params: { paperId: string } }) {
  const off = await moduleOffReason('exams');
  if (off) return <ModuleOffPage moduleId="exams" reason={off} />;
  if (!isUuid(params.paperId)) notFound();
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage moduleId="exams" help="enter-exam-marks" tour="marking" title={t(lang, 'mk.page.title')} purpose={t(lang, 'mk.page.purpose')}>
      <MarkingHubView paperId={params.paperId} />
    </ModulePage>
  );
}
