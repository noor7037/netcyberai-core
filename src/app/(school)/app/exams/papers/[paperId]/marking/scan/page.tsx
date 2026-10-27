import { notFound } from 'next/navigation';
import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { ScanScreen } from '@/components/marking/ScanScreen';
import { getServerSession } from '@/lib/auth/server-session';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Exams → a paper's AI marking → scanning with the phone (C230-AJ): the class child by child in roll order, the pages
// cut out and straightened on the phone, kept on it until the school has them, sent in the background. The phone's
// outbox is keyed by the signed-in person (school and user), so one person never sees or sends another's pages. Who may
// do what is the API's check, and the database's.
export default async function PaperScanPage({ params }: { params: { paperId: string } }) {
  const off = await moduleOffReason('exams');
  if (off) return <ModuleOffPage moduleId="exams" reason={off} />;
  if (!isUuid(params.paperId)) notFound();
  const session = await getServerSession();
  if (!session) notFound();
  const { lang } = getLang(session.sub);
  return (
    <ModulePage moduleId="exams" help="enter-exam-marks" tour="marking-scan" title={t(lang, 'mk.scan.title')} purpose={t(lang, 'mk.scan.purpose')}>
      <ScanScreen paperId={params.paperId} owner={`${session.schoolId}:${session.sub}`} />
    </ModulePage>
  );
}
