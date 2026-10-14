import { notFound } from 'next/navigation';
import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { ClassResultView } from '@/components/exams/ClassResultView';
import { getServerSession } from '@/lib/auth/server-session';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Exams → the class result (docs/27 row 9b, C214): each child in roll order with their marks, percent and grade by
// the grading scheme in force. Never ranked. The office and the coordinator read every class; a teacher their own.
export default async function ClassResultPage({ params }: { params: { examId: string; classId: string } }) {
  const off = await moduleOffReason('exams');
  if (off) return <ModuleOffPage moduleId="exams" reason={off} />;
  if (!isUuid(params.examId) || !isUuid(params.classId)) notFound();
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage moduleId="exams" help="enter-exam-marks" tour="class-result" title={t(lang, 'ex.result.title')} purpose={t(lang, 'ex.result.purpose')}>
      <ClassResultView examId={params.examId} classId={params.classId} />
    </ModulePage>
  );
}
