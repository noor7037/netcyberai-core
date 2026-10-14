import { notFound } from 'next/navigation';
import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { PaperEntryView } from '@/components/exams/PaperEntryView';
import { getServerSession } from '@/lib/auth/server-session';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Exams → one paper's marks (docs/27 row 9b, C214): the class's roll in roll order, each part's mark, absent or
// exempt. Who may enter them is the API's check and the database's (may_enter_marks).
export default async function PaperMarksPage({ params }: { params: { paperId: string } }) {
  const off = await moduleOffReason('exams');
  if (off) return <ModuleOffPage moduleId="exams" reason={off} />;
  if (!isUuid(params.paperId)) notFound();
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage moduleId="exams" help="enter-exam-marks" tour="marks-entry" title={t(lang, 'ex.entry.title')} purpose={t(lang, 'ex.entry.purpose')}>
      <PaperEntryView paperId={params.paperId} />
    </ModulePage>
  );
}
