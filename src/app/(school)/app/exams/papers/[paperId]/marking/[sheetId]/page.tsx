import { notFound } from 'next/navigation';
import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { ScriptReviewView } from '@/components/marking/ScriptReviewView';
import { getServerSession } from '@/lib/auth/server-session';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Exams → one script beside its pages (docs/35, C347): the scanned pages with each question's mark in the margin, the
// questions with the AI's marks and reasons, the note for the child, approval. Who may do what is the API's check, and
// the database's.
export default async function ScriptReviewPage({ params }: { params: { paperId: string; sheetId: string } }) {
  const off = await moduleOffReason('exams');
  if (off) return <ModuleOffPage moduleId="exams" reason={off} />;
  if (!isUuid(params.paperId) || !isUuid(params.sheetId)) notFound();
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage moduleId="exams" help="enter-exam-marks" tour="marking-review" title={t(lang, 'mk.sheet.title')} purpose={t(lang, 'mk.sheet.purpose')}>
      <ScriptReviewView paperId={params.paperId} sheetId={params.sheetId} />
    </ModulePage>
  );
}
