import { notFound } from 'next/navigation';
import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { NumbersView } from '@/components/marking/NumbersView';
import { getServerSession } from '@/lib/auth/server-session';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Exams → a class's exam numbers (C348), in roll order, to print. The office and the coordinator read every class, a
// teacher their own (the API's check, and the database's).
export default async function ExamNumbersPage({ params }: { params: { examId: string; classId: string } }) {
  const off = await moduleOffReason('exams');
  if (off) return <ModuleOffPage moduleId="exams" reason={off} />;
  if (!isUuid(params.examId) || !isUuid(params.classId)) notFound();
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage moduleId="exams" help="enter-exam-marks" tour="exam-numbers" title={t(lang, 'mk.numbers.title')} purpose={t(lang, 'mk.numbers.purpose')} hideHeaderInPrint>
      <NumbersView examId={params.examId} classId={params.classId} />
    </ModulePage>
  );
}
