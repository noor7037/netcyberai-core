import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { ExamsView } from '@/components/exams/ExamsView';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Exams (docs/27 row 9b, C214): the exams of a session, making one with its papers, how far each paper's entry has
// come, and the papers waiting for this person's marks. Who may do what is the API's check, and the database's.
export default async function ExamsPage() {
  const off = await moduleOffReason('exams');
  if (off) return <ModuleOffPage moduleId="exams" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  const readsScheme = session?.role === 'principal' || session?.role === 'school_admin' || session?.role === 'academic_coordinator';
  return (
    <ModulePage
      moduleId="exams"
      help="enter-exam-marks"
      tour="exams"
      title={t(lang, 'ex.page.title')}
      purpose={t(lang, 'ex.page.purpose')}
      more={readsScheme ? <a href="/app/exams/scheme" data-exams-scheme-link className="inline-flex min-h-[44px] items-center rounded-md border border-slate/20 bg-white px-4 text-sm font-semibold text-slate">{t(lang, 'ex.page.scheme')}</a> : undefined}
    >
      <ExamsView />
    </ModulePage>
  );
}
