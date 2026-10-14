import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { SchemeView } from '@/components/exams/SchemeView';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Exams → Grading scheme (docs/27 row 9a, C213): the school's board and its grading scheme. The principal and the
// school admin change it; the academic coordinator reads it. Who may do what is the API's check, and the database's.
export default async function GradingSchemePage() {
  const off = await moduleOffReason('exams');
  if (off) return <ModuleOffPage moduleId="exams" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage moduleId="exams" help="set-up-grading-scheme" tour="grading-scheme" title={t(lang, 'gs.page.title')} purpose={t(lang, 'gs.page.purpose')}>
      <SchemeView />
    </ModulePage>
  );
}
