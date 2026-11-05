import { notFound } from 'next/navigation';
import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { HpcView } from '@/components/exams/HpcView';
import { getServerSession } from '@/lib/auth/server-session';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Exams → a class's Holistic Progress Cards (W21-M4): for the school's current session, the words the school writes on
// each child's card (the session's remark, health and physical education, self-assessment, parent's feedback), a preview
// of each card made from the published results, and publishing the cards for families. The office and the class's class
// teacher; only the office publishes (the API's check, and the database's).
export default async function HpcPage({ params }: { params: { classId: string } }) {
  const off = await moduleOffReason('exams');
  if (off) return <ModuleOffPage moduleId="exams" reason={off} />;
  if (!isUuid(params.classId)) notFound();
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  const crumbs = [{ label: t(lang, 'w21m4.hpc.title') }];
  return (
    <ModulePage moduleId="exams" crumbs={crumbs} help="enter-exam-marks" tour="hpc" title={t(lang, 'w21m4.hpc.title')} purpose={t(lang, 'w21m4.hpc.purpose')}>
      <HpcView classId={params.classId} />
    </ModulePage>
  );
}
