import { notFound } from 'next/navigation';
import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { ProgressReportView } from '@/components/exams/ProgressReportView';
import { getServerSession } from '@/lib/auth/server-session';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Exams → a child's progress report (C230-AJ part 5): one child across the session's published results, by exam type, on the
// screen and as a printable PDF. No rank.
export default async function ProgressReportPage({ params }: { params: { studentId: string } }) {
  const off = await moduleOffReason('exams');
  if (off) return <ModuleOffPage moduleId="exams" reason={off} />;
  if (!isUuid(params.studentId)) notFound();
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage moduleId="exams" help="publish-report-cards" tour="progress-report" title={t(lang, 'pr.page.title')} purpose={t(lang, 'pr.page.purpose')}>
      <ProgressReportView studentId={params.studentId} />
    </ModulePage>
  );
}
